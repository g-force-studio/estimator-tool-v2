'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { jobSchema } from '@/lib/validations';
import { createJob, addJobDraft, getJobDraft, deleteJobDraft, createTemplate } from '@/lib/db/idb';
import { addToSyncQueue } from '@/lib/db/sync';
import { addToUploadQueue, uploadJobPhoto } from '@/lib/db/upload';
import { DRAFT_DEBOUNCE_MS } from '@/lib/config';
import { debounce } from '@/lib/utils';
import { MoreIcon, OfflineIcon } from '@/components/icons';
import useAppleDialog from '@/lib/use-apple-dialog';
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

type JobDraftPayload = Partial<JobFormData> & { line_items?: LineItem[] };

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export default function NewJobPage() {
  const router = useRouter();
  const [isOnline, setIsOnline] = useState(true);
  const [photos, setPhotos] = useState<File[]>([]);
  const [photoPreviewUrls, setPhotoPreviewUrls] = useState<string[]>([]);
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const { dialog, showAlert, showPrompt } = useAppleDialog();

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    getValues,
    formState: { errors },
  } = useForm<JobFormData>({
    resolver: zodResolver(jobSchema),
    defaultValues: {
      title: '',
      description_md: '',
      status: 'draft',
      client_name: '',
      due_date: '',
    },
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
    const loadDraft = async () => {
      const draft = await getJobDraft('new');
      if (draft) {
        const draftData = isObject(draft.data) ? (draft.data as Record<string, unknown>) : null;
        if (!draftData) return;

        Object.entries(draftData).forEach(([key, value]) => {
          if (key in jobSchema.shape) {
            setValue(key as keyof JobFormData, value as JobFormData[keyof JobFormData]);
          }
        });
        const cachedItems = draftData['line_items'];
        if (Array.isArray(cachedItems)) {
          setLineItems(cachedItems as LineItem[]);
        }
      }
    };
    loadDraft();
  }, [setValue]);

  const saveDraft = useMemo(
    () =>
      debounce(async (data: unknown) => {
        if (!data || typeof data !== 'object') return;
        await addJobDraft({
          id: 'new',
          data: data as JobDraftPayload,
          updated_at: Date.now(),
        });
      }, DRAFT_DEBOUNCE_MS),
    []
  );

  useEffect(() => {
    const subscription = watch((data) => {
      saveDraft({ ...data, line_items: lineItems });
    });
    return () => subscription.unsubscribe();
  }, [watch, lineItems, saveDraft]);

  useEffect(() => {
    saveDraft({ ...getValues(), line_items: lineItems });
  }, [lineItems, getValues, saveDraft]);

  const uploadPhotos = async (jobId: string, photosToUpload: File[]) => {
    if (photosToUpload.length === 0) return;

    await Promise.all(
      photosToUpload.map(async (photo) => {
        try {
          await uploadJobPhoto({
            jobId,
            jobItemId: 'general',
            file: photo,
            filename: photo.name,
            mimeType: photo.type,
          });
        } catch (error) {
          console.error('Photo upload failed, adding to queue:', error);
          await addToUploadQueue({
            file: photo,
            job_id: jobId,
          });
        }
      })
    );
  };

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

  const getValidLineItems = () => {
    return lineItems.filter((item) => item.name.trim());
  };

  const handleSaveAsTemplate = async () => {
    setIsMenuOpen(false);
    const validItems = getValidLineItems();
    if (validItems.length === 0) {
      await showAlert('Add at least one line item before saving as a template.');
      return;
    }

    const nameDefault = getValues('title') || 'New Template';
    const name = await showPrompt('Template name', {
      title: 'Save Template',
      primaryLabel: 'Save',
      secondaryLabel: 'Cancel',
      defaultValue: nameDefault,
      placeholder: 'Template name',
    });
    if (!name) return;

    const payload = {
      name: name.trim(),
      description: getValues('description_md') || undefined,
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
        await showAlert('Template saved.');
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
        await showAlert('Template saved locally. It will sync when you are online.');
      }
    } catch (error) {
      console.error('Error saving template:', error);
      await showAlert('Failed to save template. Please try again.');
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
      const jobId = crypto.randomUUID();
      const jobData = {
        id: jobId,
        ...payload,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      if (isOnline) {
        const response = await fetch('/api/jobs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (!response.ok) throw new Error('Failed to create job');

        const result = await response.json();
        const createdJobId = result.id as string | undefined;
        if (!createdJobId) {
          throw new Error('Job creation returned no id');
        }

        await createJob(result);
        const photosToUpload = [...photos];
        if (photosToUpload.length > 0) {
          await uploadPhotos(createdJobId, photosToUpload);
        }

        await deleteJobDraft('new');
        const verifyResponse = await fetch(`/api/jobs/${createdJobId}`);
        if (!verifyResponse.ok) {
          await showAlert('Job saved, but it is not available yet. Please try again in a moment.');
          router.push('/');
          return;
        }
        router.push(`/jobs/${createdJobId}`);
      } else {
        await createJob(jobData);
        await addToSyncQueue({
          operation: 'create',
          table: 'jobs',
          data: jobData,
        });

        if (photos.length > 0) {
          for (const photo of photos) {
            await addToUploadQueue({
              file: photo,
              job_id: jobId,
            });
          }
        }

        await deleteJobDraft('new');
        router.push('/');
      }
    } catch (error) {
      console.error('Error creating job:', error);
      await showAlert('Failed to create job. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pb-20">
      {dialog}
      <div className="max-w-2xl mx-auto p-4">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">New Job</h1>
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

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {isSubmitting && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-sm px-6">
              <div className="w-full max-w-xs rounded-2xl border border-white/10 bg-gray-900/90 px-5 py-4 text-white shadow-2xl">
                <div className="text-center text-sm font-medium">Creating job…</div>
                <div className="mt-3 flex items-center justify-center gap-3">
                  <span className="inline-block h-4 w-4 rounded-full border-2 border-blue-400 border-t-transparent animate-spin" />
                  <span className="text-xs text-blue-200/90">Working, please wait</span>
                </div>
              </div>
            </div>
          )}
          <div>
            <label htmlFor="title" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Job Title *
            </label>
            <input
              id="title"
              type="text"
              {...register('title')}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:text-white"
              placeholder="Kitchen Remodel"
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
              placeholder="Full kitchen renovation including cabinets, countertops, and appliances..."
            />
            {errors.description_md && (
              <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                {errors.description_md.message}
              </p>
            )}
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
            <label htmlFor="client_name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Client Name
            </label>
            <input
              id="client_name"
              type="text"
              {...register('client_name')}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:text-white"
              placeholder="John Doe"
            />
            {errors.client_name && (
              <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.client_name.message}</p>
            )}
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
            {errors.due_date && (
              <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.due_date.message}</p>
            )}
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
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Photos
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
              onClick={() => router.back()}
              className="flex-1 px-4 py-3 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? 'Creating...' : 'Create Job'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
