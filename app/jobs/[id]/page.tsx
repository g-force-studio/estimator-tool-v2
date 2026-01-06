'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { jobSchema } from '@/lib/validations';
import { getJob, updateJob, deleteJob, addJobDraft, getJobDraft } from '@/lib/db/idb';
import { addToSyncQueue } from '@/lib/db/sync';
import { addToUploadQueue } from '@/lib/db/upload';
import { DRAFT_DEBOUNCE_MS } from '@/lib/config';
import { debounce, formatDateTime } from '@/lib/utils';
import type { z } from 'zod';

type JobFormData = z.infer<typeof jobSchema>;

interface Job extends JobFormData {
  id: string;
  workspace_id: string;
  created_at: string;
  updated_at: string;
  photos?: Array<{ id: string; url: string; file_name: string }>;
}

export default function JobDetailPage() {
  const router = useRouter();
  const params = useParams();
  const jobId = params.id as string;

  const [job, setJob] = useState<Job | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [photos, setPhotos] = useState<File[]>([]);
  const [photoPreviewUrls, setPhotoPreviewUrls] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<JobFormData>({
    resolver: zodResolver(jobSchema),
  });

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
    const loadJob = async () => {
      setIsLoading(true);
      try {
        const cachedJob = await getJob(jobId);
        if (cachedJob) {
          setJob(cachedJob as Job);
          Object.entries(cachedJob).forEach(([key, value]) => {
            if (key in jobSchema.shape) {
              setValue(key as keyof JobFormData, value);
            }
          });
        }

        if (isOnline) {
          const response = await fetch(`/api/jobs/${jobId}`);
          if (response.ok) {
            const data = await response.json();
            setJob(data);
            await updateJob({ ...data, id: jobId });
            Object.entries(data).forEach(([key, value]) => {
              if (key in jobSchema.shape) {
                setValue(key as keyof JobFormData, value);
              }
            });
          }
        }
      } catch (error) {
        console.error('Error loading job:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadJob();
  }, [jobId, isOnline, setValue]);

  const saveDraft = debounce(async (data: Partial<JobFormData>) => {
    if (isEditing) {
      await addJobDraft({
        id: jobId,
        data,
        updated_at: Date.now(),
      });
    }
  }, DRAFT_DEBOUNCE_MS);

  useEffect(() => {
    if (isEditing) {
      const subscription = watch((data) => {
        saveDraft(data);
      });
      return () => subscription.unsubscribe();
    }
  }, [watch, isEditing]);

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

  const onSubmit = async (data: JobFormData) => {
    setIsSubmitting(true);

    try {
      const payload = {
        ...data,
        due_date: data.due_date || undefined,
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

        if (photos.length > 0) {
          for (const photo of photos) {
            const formData = new FormData();
            formData.append('file', photo);
            formData.append('jobId', jobId);
            formData.append('jobItemId', 'general');

            try {
              await fetch('/api/uploads', {
                method: 'POST',
                body: formData,
              });
            } catch (error) {
              console.error('Photo upload failed, adding to queue:', error);
              await addToUploadQueue({
                id: crypto.randomUUID(),
                file: photo,
                job_id: jobId,
                status: 'pending',
                created_at: Date.now(),
              });
            }
          }
        }

        setJob(result);
        await updateJob(result);
      } else {
        await updateJob(updatedJob);
        await addToSyncQueue({
          id: crypto.randomUUID(),
          operation: 'update',
          table: 'jobs',
          data: updatedJob,
          created_at: Date.now(),
          retry_count: 0,
        });

        if (photos.length > 0) {
          for (const photo of photos) {
            await addToUploadQueue({
              id: crypto.randomUUID(),
              file: photo,
              job_id: jobId,
              status: 'pending',
              created_at: Date.now(),
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
          id: crypto.randomUUID(),
          operation: 'delete',
          table: 'jobs',
          data: { id: jobId },
          created_at: Date.now(),
          retry_count: 0,
        });
      }

      await deleteJob(jobId);
      router.push('/');
    } catch (error) {
      console.error('Error deleting job:', error);
      alert('Failed to delete job. Please try again.');
    }
  };

  const handleSubmitJob = async () => {
    if (!confirm('Submit this job? This will mark it as delivered.')) return;

    try {
      const payload = {
        status: 'delivered',
        due_date: job?.due_date || undefined,
      };

      if (isOnline) {
        const response = await fetch(`/api/jobs/${jobId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (!response.ok) throw new Error('Failed to submit job');

        const result = await response.json();
        setJob(result);
        await updateJob(result);
      } else {
        const updatedJob = {
          ...job,
          ...payload,
          updated_at: new Date().toISOString(),
        };

        await updateJob(updatedJob);
        await addToSyncQueue({
          id: crypto.randomUUID(),
          operation: 'update',
          table: 'jobs',
          data: updatedJob,
          created_at: Date.now(),
          retry_count: 0,
        });
        setJob(updatedJob as Job);
      }
    } catch (error) {
      console.error('Error submitting job:', error);
      alert('Failed to submit job. Please try again.');
    }
  };

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
          <p className="text-gray-600 dark:text-gray-400 mb-4">Job not found</p>
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
          {!isOnline && (
            <span className="text-sm text-yellow-600 dark:text-yellow-400">📴 Offline</span>
          )}
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

            <div className="grid grid-cols-2 gap-4">
              <div>
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Status</h3>
                <span className={`inline-block px-2 py-1 text-xs rounded ${
                  job.status === 'draft' ? 'bg-gray-200 text-gray-800' :
                  job.status === 'active' ? 'bg-blue-200 text-blue-800' :
                  job.status === 'delivered' ? 'bg-green-200 text-green-800' :
                  'bg-red-200 text-red-800'
                }`}>
                  {job.status}
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
                    <img
                      key={photo.id}
                      src={photo.url}
                      alt={photo.file_name}
                      className="w-full h-24 object-cover rounded-lg"
                    />
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
              <button
                onClick={() => setIsEditing(true)}
                className="flex-1 min-w-[120px] px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Edit
              </button>
              <button
                onClick={handleSubmitJob}
                className="flex-1 min-w-[120px] px-4 py-3 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700"
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
                <option value="active">Active</option>
                <option value="delivered">Delivered</option>
                <option value="archived">Archived</option>
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
              <input
                id="due_date"
                type="date"
                {...register('due_date')}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:text-white"
              />
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
