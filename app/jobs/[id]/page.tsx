'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { jobSchema } from '@/lib/validations';
import { getJob, updateJob, deleteJob, addJobDraft, createTemplate } from '@/lib/db/idb';
import { addToSyncQueue } from '@/lib/db/sync';
import { addToUploadQueue } from '@/lib/db/upload';
import { DRAFT_DEBOUNCE_MS } from '@/lib/config';
import { debounce, formatDateTime } from '@/lib/utils';
import { MoreIcon, OfflineIcon } from '@/components/icons';
import type { z } from 'zod';

type JobFormData = z.infer<typeof jobSchema>;

type LineItem = {
  id: string;
  name: string;
  description?: string;
  unit: 'each' | 'sqft' | 'lnft' | 'hour' | 'day';
  unit_price: number;
  quantity: number;
};

interface Job extends JobFormData {
  id: string;
  workspace_id: string;
  created_at: string;
  updated_at: string;
  pdf_url?: string | null;
  job_items?: Array<{
    id: string;
    type: string;
    title: string;
    content_json: unknown;
    order_index: number;
  }>;
  photos?: Array<{ id: string; url: string; file_name: string }>;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

const JOB_STATUSES = [
  'draft',
  'ai_pending',
  'ai_ready',
  'pdf_pending',
  'complete',
  'ai_error',
  'pdf_error',
] as const;

type JobStatus = (typeof JOB_STATUSES)[number];

function isJobStatus(value: unknown): value is JobStatus {
  return typeof value === 'string' && (JOB_STATUSES as readonly string[]).includes(value);
}

function toJobFromCache(value: unknown): Job | null {
  if (!isObject(value)) return null;
  if (
    typeof value.id !== 'string' ||
    typeof value.workspace_id !== 'string' ||
    typeof value.created_at !== 'string' ||
    typeof value.updated_at !== 'string' ||
    typeof value.title !== 'string' ||
    !isJobStatus(value.status)
  ) {
    return null;
  }

  return {
    id: value.id,
    workspace_id: value.workspace_id,
    created_at: value.created_at,
    updated_at: value.updated_at,
    title: value.title,
    status: value.status,
    due_date: typeof value.due_date === 'string' ? value.due_date : undefined,
    client_name: typeof value.client_name === 'string' ? value.client_name : undefined,
    description_md: typeof value.description_md === 'string' ? value.description_md : undefined,
    template_id: typeof value.template_id === 'string' ? value.template_id : undefined,
    labor_rate: typeof value.labor_rate === 'number' ? value.labor_rate : undefined,
    job_items: Array.isArray(value.job_items)
      ? value.job_items.filter((item) => isObject(item)) as Job['job_items']
      : undefined,
    photos: Array.isArray(value.photos)
      ? value.photos.filter((photo) => isObject(photo)) as Job['photos']
      : undefined,
  };
}

export default function JobDetailPage() {
  const router = useRouter();
  const params = useParams();
  const jobId = params.id as string;

  const [job, setJob] = useState<Job | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [photos, setPhotos] = useState<File[]>([]);
  const [photoPreviewUrls, setPhotoPreviewUrls] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmittingJob, setIsSubmittingJob] = useState(false);
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const isMountedRef = useRef(true);
  const functionsBaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1`
    : '';

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<JobFormData>({
    resolver: zodResolver(jobSchema),
  });

  const applyJobToForm = useCallback((jobData: Partial<Job>) => {
    Object.entries(jobData).forEach(([key, value]) => {
      if (key in jobSchema.shape) {
        const normalizedValue = value === null ? undefined : value;
        setValue(key as keyof JobFormData, normalizedValue as JobFormData[keyof JobFormData]);
      }
    });
  }, [setValue]);

  const mapJobItemsToLineItems = (items?: Job['job_items']) => {
    if (!items) return [];
    return items
      .filter((item) => item.type === 'line_item')
      .map((item) => {
        const content = (item.content_json || {}) as {
          description?: string;
          unit?: LineItem['unit'];
          unit_price?: number;
          quantity?: number;
        };
        return {
          id: item.id,
          name: item.title,
          description: content.description || '',
          unit: content.unit || 'each',
          unit_price: content.unit_price ?? 0,
          quantity: content.quantity ?? 1,
        };
      });
  };

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    setIsOnline(navigator.onLine);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const loadJob = async () => {
      setIsLoading(true);
      setLoadError(null);
      try {
        const cachedJob = toJobFromCache(await getJob(jobId));
        if (cachedJob) {
          setJob(cachedJob);
          applyJobToForm(cachedJob);
        }

        if (isOnline) {
          const response = await fetch(`/api/jobs/${jobId}`);
          if (response.ok) {
            const data = await response.json();
            setJob(data);
            await updateJob({ ...data, id: jobId });
            applyJobToForm(data);
          } else {
            const message = response.status === 404
              ? 'Job not found.'
              : 'Unable to load the job. Please try again.';
            setLoadError(message);
          }
        }
      } catch (error) {
        console.error('Error loading job:', error);
        setLoadError('Unable to load the job. Please try again.');
      } finally {
        setIsLoading(false);
      }
    };

    loadJob();
  }, [jobId, isOnline, applyJobToForm]);

  useEffect(() => {
    if (job?.job_items) {
      setLineItems(mapJobItemsToLineItems(job.job_items));
    }
  }, [job?.job_items]);

  const uploadPhotos = async (jobIdToUse: string, photosToUpload: File[]) => {
    if (photosToUpload.length === 0) return;

    await Promise.all(
      photosToUpload.map(async (photo) => {
        const formData = new FormData();
        formData.append('file', photo);
        formData.append('jobId', jobIdToUse);
        formData.append('jobItemId', 'general');

        try {
          await fetch('/api/uploads', {
            method: 'POST',
            body: formData,
          });
          } catch (error) {
            console.error('Photo upload failed, adding to queue:', error);
            await addToUploadQueue({
              file: photo,
              job_id: jobIdToUse,
            });
          }
        })
    );

    if (!isMountedRef.current) return;
    const refreshedResponse = await fetch(`/api/jobs/${jobIdToUse}`);
    if (refreshedResponse.ok) {
      const refreshedJob = await refreshedResponse.json();
      if (isMountedRef.current) {
        setJob(refreshedJob);
      }
      await updateJob(refreshedJob);
    }
  };

  const saveDraft = useMemo(
    () =>
      debounce(async (data: unknown) => {
        if (!data || typeof data !== 'object') return;
        if (isEditing) {
          await addJobDraft({
            id: jobId,
            data: data as Partial<JobFormData>,
            updated_at: Date.now(),
          });
        }
      }, DRAFT_DEBOUNCE_MS),
    [isEditing, jobId]
  );

  useEffect(() => {
    if (isEditing) {
      const subscription = watch((data) => {
        saveDraft(data);
      });
      return () => subscription.unsubscribe();
    }
  }, [watch, isEditing, saveDraft]);

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setPhotos((prev) => [...prev, ...files]);

    files.forEach((file) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        setPhotoPreviewUrls((prev) => [...prev, reader.result as string]);
      };
      reader.readAsDataURL(file);
    });
  };

  const removePhoto = (index: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
    setPhotoPreviewUrls((prev) => prev.filter((_, i) => i !== index));
  };

  const addLineItem = () => {
    setLineItems((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        name: '',
        description: '',
        unit: 'each',
        unit_price: 0,
        quantity: 1,
      },
    ]);
  };

  const updateLineItem = <K extends keyof LineItem>(
    index: number,
    key: K,
    value: LineItem[K]
  ) => {
    setLineItems((prev) =>
      prev.map((item, itemIndex) => (itemIndex === index ? { ...item, [key]: value } : item))
    );
  };

  const removeLineItem = (index: number) => {
    setLineItems((prev) => prev.filter((_, itemIndex) => itemIndex !== index));
  };

  const calculateLineItemsTotal = () => {
    return lineItems.reduce((sum, item) => sum + item.unit_price * item.quantity, 0);
  };

  const getValidLineItems = () => {
    return lineItems.filter((item) => item.name.trim());
  };

  const handleSaveAsTemplate = async () => {
    setIsMenuOpen(false);
    const validItems = getValidLineItems();
    if (validItems.length === 0) {
      alert('Add at least one line item before saving as a template.');
      return;
    }

    const nameDefault = job?.title || 'New Template';
    const name = prompt('Template name', nameDefault);
    if (!name) return;

    const payload = {
      name: name.trim(),
      description: job?.description_md || undefined,
      items: validItems.map(({ name: itemName, description, unit, unit_price, quantity }) => ({
        name: itemName,
        description,
        unit,
        unit_price,
        quantity,
      })),
    };

    try {
      if (isOnline) {
        const response = await fetch('/api/templates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (!response.ok) throw new Error('Failed to create template');
        const result = await response.json();
        await createTemplate(result);
        alert('Template saved.');
      } else {
        const templateData = {
          id: crypto.randomUUID(),
          ...payload,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        await createTemplate(templateData);
        await addToSyncQueue({
          operation: 'create',
          table: 'templates',
          data: templateData,
        });
        alert('Template saved locally. It will sync when you are online.');
      }
    } catch (error) {
      console.error('Error saving template:', error);
      alert('Failed to save template. Please try again.');
    }
  };

  const onSubmit = async (data: JobFormData) => {
    setIsSubmitting(true);

    try {
      const payload = {
        ...data,
        due_date: data.due_date || undefined,
        line_items: getValidLineItems(),
      };
      const updatedJob = {
        ...job,
        ...payload,
        updated_at: new Date().toISOString(),
      };

      if (isOnline) {
        const response = await fetch(`/api/jobs/${jobId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (!response.ok) throw new Error('Failed to update job');

        const result = await response.json();

        setJob(result);
        await updateJob(result);

        const photosToUpload = [...photos];
        void uploadPhotos(jobId, photosToUpload);
      } else {
        await updateJob(updatedJob);
        await addToSyncQueue({
          operation: 'update',
          table: 'jobs',
          data: updatedJob,
        });

        if (photos.length > 0) {
          for (const photo of photos) {
            await addToUploadQueue({
              file: photo,
              job_id: jobId,
            });
          }
        }

        setJob(updatedJob as Job);
      }

      setIsEditing(false);
      setPhotos([]);
      setPhotoPreviewUrls([]);
    } catch (error) {
      console.error('Error updating job:', error);
      alert('Failed to update job. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this job?')) return;

    try {
      if (isOnline) {
        const response = await fetch(`/api/jobs/${jobId}`, {
          method: 'DELETE',
        });

        if (!response.ok) throw new Error('Failed to delete job');
      } else {
        await addToSyncQueue({
          operation: 'delete',
          table: 'jobs',
          data: { id: jobId },
        });
      }

      await deleteJob(jobId);
      router.push('/');
    } catch (error) {
      console.error('Error deleting job:', error);
      alert('Failed to delete job. Please try again.');
    }
  };

  const handleOpenPdf = async () => {
    try {
      if (job?.pdf_url) {
        window.open(job.pdf_url, '_blank', 'noopener,noreferrer');
        return;
      }

      if (!functionsBaseUrl) {
        alert('PDF link is unavailable. Missing Supabase URL.');
        return;
      }

      const response = await fetch(`${functionsBaseUrl}/pdf-link?job_id=${jobId}`);
      if (!response.ok) throw new Error('Failed to fetch PDF link');
      const data = await response.json();
      if (data.pdf_url) {
        window.open(data.pdf_url, '_blank', 'noopener,noreferrer');
      }
    } catch (error) {
      console.error('Failed to open PDF:', error);
      alert('Failed to open PDF. Please try again.');
    }
  };

  const handleSubmitJob = async () => {
    if (!confirm('Submit this job for an estimate?')) return;

    try {
      setIsSubmittingJob(true);

      if (isOnline) {
        const response = await fetch(`/api/jobs/${jobId}/estimate`, {
          method: 'POST',
        });

        if (!response.ok) throw new Error('Failed to submit job');

        const result = await response.json();
        const updatedJob = result.job ? { ...job, ...result.job } : job;
        if (updatedJob) {
          setJob(updatedJob as Job);
          await updateJob(updatedJob as Record<string, unknown>);
        }
        router.push('/');
      } else {
        const updatedJob = {
          ...job,
          status: 'ai_pending',
          updated_at: new Date().toISOString(),
        };

        await updateJob(updatedJob as Record<string, unknown>);
        await addToSyncQueue({
          operation: 'update',
          table: 'jobs',
          data: updatedJob,
        });
        setJob(updatedJob as Job);
        alert('You are offline. The job was queued, but the estimate was not generated.');
      }
    } catch (error) {
      console.error('Error submitting job:', error);
      alert('Failed to submit job. Please try again.');
    } finally {
      setIsSubmittingJob(false);
    }
  };

  const isSubmitDisabled =
    isSubmittingJob ||
    job?.status === 'ai_pending' ||
    job?.status === 'ai_ready' ||
    job?.status === 'pdf_pending' ||
    job?.status === 'complete';

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-gray-600 dark:text-gray-400">Loading...</div>
      </div>
    );
  }

  if (!job) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            {loadError || 'Job not found'}
          </p>
          <button
            onClick={() => router.push('/')}
            className="text-blue-600 dark:text-blue-400 hover:underline"
          >
            Go back home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pb-20">
      <div className="max-w-2xl mx-auto p-4">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            {isEditing ? 'Edit Job' : 'Job Details'}
          </h1>
          <div className="flex items-center gap-3">
            {!isOnline && (
              <span className="text-sm text-yellow-600 dark:text-yellow-400 flex items-center gap-2">
                <OfflineIcon className="h-4 w-4" />
                Offline
              </span>
            )}
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsMenuOpen((prev) => !prev)}
                className="p-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800"
                aria-label="More options"
              >
                <MoreIcon className="h-5 w-5" />
              </button>
              {isMenuOpen && (
                <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-10">
                  <button
                    type="button"
                    onClick={handleSaveAsTemplate}
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
                  >
                    Save as template
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {!isEditing ? (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 space-y-4">
            <div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">{job.title}</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Created {formatDateTime(job.created_at)}
              </p>
            </div>

            {job.description_md && (
              <div>
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</h3>
                <p className="text-gray-900 dark:text-white whitespace-pre-wrap">{job.description_md}</p>
              </div>
            )}

            {lineItems.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">Line Items</h3>
                  <span className="text-sm font-semibold text-gray-900 dark:text-white">
                    ${calculateLineItemsTotal().toFixed(2)}
                  </span>
                </div>
                <div className="space-y-2">
                  {lineItems.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-start justify-between text-sm text-gray-700 dark:text-gray-300"
                    >
                      <div>
                        <div className="font-medium text-gray-900 dark:text-white">{item.name}</div>
                        {item.description && (
                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            {item.description}
                          </div>
                        )}
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          {item.quantity} {item.unit} × ${item.unit_price.toFixed(2)}
                        </div>
                      </div>
                      <div className="font-medium text-gray-900 dark:text-white">
                        ${(item.unit_price * item.quantity).toFixed(2)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Status</h3>
                <span className={`inline-block px-2 py-1 text-xs rounded ${
                  job.status === 'draft' ? 'bg-gray-200 text-gray-800' :
                  job.status === 'ai_pending' ? 'bg-blue-200 text-blue-800' :
                  job.status === 'ai_ready' ? 'bg-indigo-200 text-indigo-800' :
                  job.status === 'pdf_pending' ? 'bg-amber-200 text-amber-800' :
                  job.status === 'complete' ? 'bg-green-200 text-green-800' :
                  'bg-red-200 text-red-800'
                }`}>
                  {job.status === 'ai_pending' ? 'pending' : job.status}
                </span>
              </div>
              {job.due_date && (
                <div>
                  <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Due Date</h3>
                  <span className="text-sm text-gray-900 dark:text-white">{job.due_date}</span>
                </div>
              )}
            </div>

            {job.client_name && (
              <div>
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Client</h3>
                <p className="text-gray-900 dark:text-white">{job.client_name}</p>
              </div>
            )}

            {job.photos && job.photos.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Photos</h3>
                <div className="grid grid-cols-3 gap-2">
                  {job.photos.map((photo) => (
                    <div key={photo.id} className="space-y-1">
                      <a href={photo.url} target="_blank" rel="noopener noreferrer">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={photo.url}
                          alt={photo.file_name}
                          className="w-full h-24 object-cover rounded-lg"
                        />
                      </a>
                      <a
                        href={photo.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block text-xs text-blue-600 dark:text-blue-300 hover:underline"
                      >
                        Open photo
                      </a>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-3 pt-4">
              <button
                onClick={() => router.back()}
                className="flex-1 min-w-[120px] px-4 py-3 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                Back
              </button>
              <button
                onClick={() => router.push('/')}
                className="flex-1 min-w-[120px] px-4 py-3 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                Home
              </button>
              {(job.pdf_url || job.status === 'complete') && (
                <button
                  onClick={handleOpenPdf}
                  className="flex-1 min-w-[120px] px-4 py-3 border border-blue-300 text-blue-700 rounded-lg hover:bg-blue-50 dark:border-blue-500 dark:text-blue-200 dark:hover:bg-blue-900/20"
                >
                  Open PDF
                </button>
              )}
              <button
                onClick={() => setIsEditing(true)}
                className="flex-1 min-w-[120px] px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Edit
              </button>
              <button
                onClick={handleSubmitJob}
                disabled={isSubmitDisabled}
                className="flex-1 min-w-[120px] px-4 py-3 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Submit
              </button>
              <button
                onClick={handleDelete}
                className="min-w-[120px] px-4 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <div>
              <label htmlFor="title" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Job Title *
              </label>
              <input
                id="title"
                type="text"
                {...register('title')}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:text-white"
              />
              {errors.title && (
                <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.title.message}</p>
              )}
            </div>

            <div>
              <label htmlFor="description" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Description
              </label>
              <textarea
                id="description"
                {...register('description_md')}
                rows={4}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:text-white"
              />
            </div>

            <div>
              <label htmlFor="status" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Status
              </label>
              <select
                id="status"
                {...register('status')}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:text-white"
              >
                <option value="draft">Draft</option>
                <option value="ai_pending">AI Pending</option>
                <option value="ai_ready">AI Ready</option>
                <option value="pdf_pending">PDF Pending</option>
                <option value="complete">Complete</option>
                <option value="ai_error">AI Error</option>
                <option value="pdf_error">PDF Error</option>
              </select>
            </div>

            <div>
              <label htmlFor="client_name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Client Name
              </label>
              <input
                id="client_name"
                type="text"
                {...register('client_name')}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:text-white"
              />
            </div>

            <div>
              <label htmlFor="due_date" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Due Date
              </label>
              <div className="overflow-hidden rounded-lg">
                <input
                  id="due_date"
                  type="date"
                  {...register('due_date')}
                  className="date-input w-full max-w-full min-w-0 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:text-white appearance-none"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-3">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Line Items
                </label>
                <button
                  type="button"
                  onClick={addLineItem}
                  className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                >
                  + Add line item
                </button>
              </div>

              {lineItems.length === 0 ? (
                <div className="text-sm text-gray-500 dark:text-gray-400">
                  Add line items if you want a detailed estimate.
                </div>
              ) : (
                <div className="space-y-4">
                  {lineItems.map((item, index) => (
                    <div
                      key={item.id}
                      className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <h3 className="text-sm font-medium text-gray-900 dark:text-white">
                          Item {index + 1}
                        </h3>
                        <button
                          type="button"
                          onClick={() => removeLineItem(index)}
                          className="text-red-600 dark:text-red-400 text-sm hover:underline"
                        >
                          Remove
                        </button>
                      </div>

                      <div className="space-y-3">
                        <div>
                          <input
                            value={item.name}
                            onChange={(e) => updateLineItem(index, 'name', e.target.value)}
                            placeholder="Item name"
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white text-sm"
                          />
                        </div>

                        <div>
                          <textarea
                            value={item.description || ''}
                            onChange={(e) => updateLineItem(index, 'description', e.target.value)}
                            placeholder="Description (optional)"
                            rows={2}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white text-sm"
                          />
                        </div>

                        <div className="grid grid-cols-3 gap-2">
                          <div>
                            <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                              Unit
                            </label>
                            <select
                              value={item.unit}
                              onChange={(e) =>
                                updateLineItem(index, 'unit', e.target.value as LineItem['unit'])
                              }
                              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white text-sm"
                            >
                              <option value="each">Each</option>
                              <option value="sqft">Sq Ft</option>
                              <option value="lnft">Ln Ft</option>
                              <option value="hour">Hour</option>
                              <option value="day">Day</option>
                            </select>
                          </div>

                          <div>
                            <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                              Price
                            </label>
                            <input
                              type="number"
                              step="0.01"
                              value={item.unit_price}
                              onChange={(e) =>
                                updateLineItem(
                                  index,
                                  'unit_price',
                                  e.target.value === '' ? 0 : Number(e.target.value)
                                )
                              }
                              placeholder="0.00"
                              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white text-sm"
                            />
                          </div>

                          <div>
                            <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                              Qty
                            </label>
                            <input
                              type="number"
                              step="0.01"
                              value={item.quantity}
                              onChange={(e) =>
                                updateLineItem(
                                  index,
                                  'quantity',
                                  e.target.value === '' ? 0 : Number(e.target.value)
                                )
                              }
                              placeholder="1"
                              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white text-sm"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Add Photos
              </label>
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={handlePhotoChange}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:text-white"
              />
              {photoPreviewUrls.length > 0 && (
                <div className="mt-4 grid grid-cols-3 gap-2">
                  {photoPreviewUrls.map((url, index) => (
                    <div key={index} className="relative">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={url}
                        alt={`Preview ${index + 1}`}
                        className="w-full h-24 object-cover rounded-lg"
                      />
                      <button
                        type="button"
                        onClick={() => removePhoto(index)}
                        className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex gap-3 pt-4">
              <button
                type="button"
                onClick={() => {
                  setIsEditing(false);
                  setPhotos([]);
                  setPhotoPreviewUrls([]);
                }}
                className="flex-1 px-4 py-3 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex-1 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
