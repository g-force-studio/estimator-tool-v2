'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { templateSchema } from '@/lib/validations';
import { getTemplate, updateTemplate, deleteTemplate, createTemplate } from '@/lib/db/idb';
import { addToSyncQueue } from '@/lib/db/sync';
import type { z } from 'zod';

type TemplateFormData = z.infer<typeof templateSchema>;

export default function TemplateEditorPage() {
  const router = useRouter();
  const params = useParams();
  const templateId = params?.id as string | undefined;
  const isNew = !templateId || templateId === 'new';

  const [isOnline, setIsOnline] = useState(true);
  const [isLoading, setIsLoading] = useState(!isNew);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    control,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<TemplateFormData>({
    resolver: zodResolver(templateSchema),
    defaultValues: {
      name: '',
      description: '',
      items: [{ name: '', description: '', unit: 'each', unit_price: 0, quantity: 1 }],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'items',
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
    if (!isNew && templateId) {
      const loadTemplate = async () => {
        setIsLoading(true);
        try {
          const cachedTemplate = await getTemplate(templateId);
          if (cachedTemplate) {
            Object.entries(cachedTemplate).forEach(([key, value]) => {
              if (key in templateSchema.shape) {
                setValue(key as keyof TemplateFormData, value);
              }
            });
          }

          if (isOnline) {
            const response = await fetch(`/api/templates/${templateId}`);
            if (response.ok) {
              const data = await response.json();
              Object.entries(data).forEach(([key, value]) => {
                if (key in templateSchema.shape) {
                  setValue(key as keyof TemplateFormData, value);
                }
              });
              await updateTemplate({ ...data, id: templateId });
            }
          }
        } catch (error) {
          console.error('Error loading template:', error);
        } finally {
          setIsLoading(false);
        }
      };

      loadTemplate();
    }
  }, [templateId, isNew, isOnline, setValue]);

  const onSubmit = async (data: TemplateFormData) => {
    setIsSubmitting(true);

    try {
      if (isNew) {
        const newTemplateId = crypto.randomUUID();
        const templateData = {
          id: newTemplateId,
          ...data,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        if (isOnline) {
          const response = await fetch('/api/templates', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
          });

          if (!response.ok) throw new Error('Failed to create template');

          const result = await response.json();
          await createTemplate(result);
          router.push('/templates');
        } else {
          await createTemplate(templateData);
          await addToSyncQueue({
            id: crypto.randomUUID(),
            operation: 'create',
            table: 'templates',
            data: templateData,
            created_at: Date.now(),
            retry_count: 0,
          });
          router.push('/templates');
        }
      } else {
        const updatedTemplate = {
          id: templateId,
          ...data,
          updated_at: new Date().toISOString(),
        };

        if (isOnline) {
          const response = await fetch(`/api/templates/${templateId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
          });

          if (!response.ok) throw new Error('Failed to update template');

          const result = await response.json();
          await updateTemplate(result);
          router.push('/templates');
        } else {
          await updateTemplate(updatedTemplate);
          await addToSyncQueue({
            id: crypto.randomUUID(),
            operation: 'update',
            table: 'templates',
            data: updatedTemplate,
            created_at: Date.now(),
            retry_count: 0,
          });
          router.push('/templates');
        }
      }
    } catch (error) {
      console.error('Error saving template:', error);
      alert('Failed to save template. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!templateId || isNew) return;
    if (!confirm('Are you sure you want to delete this template?')) return;

    try {
      if (isOnline) {
        const response = await fetch(`/api/templates/${templateId}`, {
          method: 'DELETE',
        });

        if (!response.ok) throw new Error('Failed to delete template');
      } else {
        await addToSyncQueue({
          id: crypto.randomUUID(),
          operation: 'delete',
          table: 'templates',
          data: { id: templateId },
          created_at: Date.now(),
          retry_count: 0,
        });
      }

      await deleteTemplate(templateId);
      router.push('/templates');
    } catch (error) {
      console.error('Error deleting template:', error);
      alert('Failed to delete template. Please try again.');
    }
  };

  const calculateItemTotal = (index: number) => {
    const items = watch('items');
    const item = items[index];
    return (item.unit_price || 0) * (item.quantity || 0);
  };

  const calculateTotal = () => {
    const items = watch('items');
    return items.reduce((sum, item) => sum + (item.unit_price || 0) * (item.quantity || 0), 0);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-gray-600 dark:text-gray-400">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pb-20">
      <div className="max-w-2xl mx-auto p-4">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            {isNew ? 'New Template' : 'Edit Template'}
          </h1>
          {!isOnline && (
            <span className="text-sm text-yellow-600 dark:text-yellow-400">📴 Offline</span>
          )}
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Template Name *
            </label>
            <input
              id="name"
              type="text"
              {...register('name')}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:text-white"
              placeholder="Kitchen Remodel Package"
            />
            {errors.name && (
              <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.name.message}</p>
            )}
          </div>

          <div>
            <label htmlFor="description" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Description
            </label>
            <textarea
              id="description"
              {...register('description')}
              rows={3}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:text-white"
              placeholder="Standard kitchen remodel with cabinets, countertops, and appliances"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Items *
              </label>
              <button
                type="button"
                onClick={() => append({ name: '', description: '', unit: 'each', unit_price: 0, quantity: 1 })}
                className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
              >
                + Add Item
              </button>
            </div>

            <div className="space-y-4">
              {fields.map((field, index) => (
                <div key={field.id} className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
                  <div className="flex items-start justify-between mb-3">
                    <h3 className="text-sm font-medium text-gray-900 dark:text-white">Item {index + 1}</h3>
                    {fields.length > 1 && (
                      <button
                        type="button"
                        onClick={() => remove(index)}
                        className="text-red-600 dark:text-red-400 text-sm hover:underline"
                      >
                        Remove
                      </button>
                    )}
                  </div>

                  <div className="space-y-3">
                    <div>
                      <input
                        {...register(`items.${index}.name`)}
                        placeholder="Item name"
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white text-sm"
                      />
                      {errors.items?.[index]?.name && (
                        <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                          {errors.items[index]?.name?.message}
                        </p>
                      )}
                    </div>

                    <div>
                      <textarea
                        {...register(`items.${index}.description`)}
                        placeholder="Description (optional)"
                        rows={2}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white text-sm"
                      />
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Unit</label>
                        <select
                          {...register(`items.${index}.unit`)}
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
                        <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Price</label>
                        <input
                          type="number"
                          step="0.01"
                          {...register(`items.${index}.unit_price`, { valueAsNumber: true })}
                          placeholder="0.00"
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white text-sm"
                        />
                      </div>

                      <div>
                        <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Qty</label>
                        <input
                          type="number"
                          step="0.01"
                          {...register(`items.${index}.quantity`, { valueAsNumber: true })}
                          placeholder="1"
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white text-sm"
                        />
                      </div>
                    </div>

                    <div className="text-right text-sm font-medium text-gray-900 dark:text-white">
                      Total: ${calculateItemTotal(index).toFixed(2)}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {errors.items && (
              <p className="mt-2 text-sm text-red-600 dark:text-red-400">
                {errors.items.message || 'Please check item fields'}
              </p>
            )}
          </div>

          <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Template Total</span>
              <span className="text-xl font-bold text-gray-900 dark:text-white">
                ${calculateTotal().toFixed(2)}
              </span>
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={() => router.back()}
              className="flex-1 px-4 py-3 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              Cancel
            </button>
            {!isNew && (
              <button
                type="button"
                onClick={handleDelete}
                className="px-4 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700"
              >
                Delete
              </button>
            )}
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? 'Saving...' : isNew ? 'Create Template' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
