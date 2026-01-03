'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { jobSchema } from '@/lib/validations';
import { createJob, addJobDraft, getJobDraft, deleteJobDraft } from '@/lib/db/idb';
import { addToSyncQueue } from '@/lib/db/sync';
import { addToUploadQueue } from '@/lib/db/upload';
import { DRAFT_DEBOUNCE_MS } from '@/lib/config';
import { debounce } from '@/lib/utils';
import type { z } from 'zod';

type JobFormData = z.infer<typeof jobSchema>;

export default function NewJobPage() {
  const router = useRouter();
  const [isOnline, setIsOnline] = useState(true);
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
    defaultValues: {
      title: '',
      description: '',
      status: 'draft',
      client_name: '',
      client_email: '',
      client_phone: '',
      address: '',
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
        Object.entries(draft.data).forEach(([key, value]) => {
          setValue(key as keyof JobFormData, value);
        });
      }
    };
    loadDraft();
  }, [setValue]);

  const saveDraft = debounce(async (data: Partial<JobFormData>) => {
    await addJobDraft({
      id: 'new',
      data,
      updated_at: Date.now(),
    });
  }, DRAFT_DEBOUNCE_MS);

  useEffect(() => {
    const subscription = watch((data) => {
      saveDraft(data);
    });
    return () => subscription.unsubscribe();
  }, [watch]);

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
      const jobId = crypto.randomUUID();
      const jobData = {
        id: jobId,
        ...data,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      if (isOnline) {
        const response = await fetch('/api/jobs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });

        if (!response.ok) throw new Error('Failed to create job');

        const result = await response.json();
        const createdJobId = result.id;

        if (photos.length > 0) {
          for (const photo of photos) {
            const formData = new FormData();
            formData.append('file', photo);
            formData.append('job_id', createdJobId);

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
                job_id: createdJobId,
                status: 'pending',
                created_at: Date.now(),
              });
            }
          }
        }

        await deleteJobDraft('new');
        router.push(`/jobs/${createdJobId}`);
      } else {
        await createJob(jobData);
        await addToSyncQueue({
          id: crypto.randomUUID(),
          operation: 'create',
          table: 'jobs',
          data: jobData,
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

        await deleteJobDraft('new');
        router.push('/');
      }
    } catch (error) {
      console.error('Error creating job:', error);
      alert('Failed to create job. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pb-20">
      <div className="max-w-2xl mx-auto p-4">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">New Job</h1>
          {!isOnline && (
            <span className="text-sm text-yellow-600 dark:text-yellow-400">📴 Offline</span>
          )}
        </div>

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
              {...register('description')}
              rows={4}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:text-white"
              placeholder="Full kitchen renovation including cabinets, countertops, and appliances..."
            />
            {errors.description && (
              <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.description.message}</p>
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
            <label htmlFor="client_email" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Client Email
            </label>
            <input
              id="client_email"
              type="email"
              {...register('client_email')}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:text-white"
              placeholder="john@example.com"
            />
            {errors.client_email && (
              <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.client_email.message}</p>
            )}
          </div>

          <div>
            <label htmlFor="client_phone" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Client Phone
            </label>
            <input
              id="client_phone"
              type="tel"
              {...register('client_phone')}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:text-white"
              placeholder="(555) 123-4567"
            />
            {errors.client_phone && (
              <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.client_phone.message}</p>
            )}
          </div>

          <div>
            <label htmlFor="address" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Address
            </label>
            <input
              id="address"
              type="text"
              {...register('address')}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:text-white"
              placeholder="123 Main St, City, State 12345"
            />
            {errors.address && (
              <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.address.message}</p>
            )}
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
