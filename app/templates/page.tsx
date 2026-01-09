'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getCachedTemplates, updateTemplate } from '@/lib/db/idb';
import { formatDateTime } from '@/lib/utils';
import { BottomNav } from '@/components/bottom-nav';
import { OfflineIcon } from '@/components/icons';

interface Template {
  id: string;
  workspace_id: string;
  name: string;
  description?: string;
  items: Array<{
    name: string;
    description?: string;
    unit: string;
    unit_price: number;
    quantity: number;
  }>;
  created_at: string;
  updated_at: string;
}

export default function TemplatesPage() {
  const router = useRouter();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [isOnline, setIsOnline] = useState(true);
  const [isLoading, setIsLoading] = useState(true);

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
    const loadTemplates = async () => {
      setIsLoading(true);
      try {
        const cachedTemplates = await getCachedTemplates();
        if (cachedTemplates.length > 0) {
          setTemplates(cachedTemplates as Template[]);
        }

        if (isOnline) {
          const response = await fetch('/api/templates');
          if (response.ok) {
            const data = await response.json();
            setTemplates(data);
            for (const template of data) {
              await updateTemplate(template);
            }
          }
        }
      } catch (error) {
        console.error('Error loading templates:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadTemplates();
  }, [isOnline]);

  const calculateTotal = (template: Template) => {
    return template.items.reduce((sum, item) => sum + item.unit_price * item.quantity, 0);
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pb-20">
      <div className="max-w-2xl mx-auto p-4">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Templates</h1>
          {!isOnline && (
            <span className="text-sm text-yellow-600 dark:text-yellow-400 flex items-center gap-2">
              <OfflineIcon className="h-4 w-4" />
              Offline
            </span>
          )}
        </div>

        {!isOnline && (
          <div className="mb-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
            <p className="text-sm text-yellow-800 dark:text-yellow-200 flex items-center gap-2">
              <OfflineIcon className="h-4 w-4" />
              You are offline. Showing cached templates.
            </p>
          </div>
        )}

        <button
          onClick={() => router.push('/templates/new')}
          className="w-full mb-6 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
        >
          + Create Template
        </button>

        {isLoading ? (
          <div className="text-center py-12">
            <div className="text-gray-600 dark:text-gray-400">Loading templates...</div>
          </div>
        ) : templates.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-600 dark:text-gray-400 mb-4">No templates yet</p>
            <p className="text-sm text-gray-500 dark:text-gray-500">
              Create your first template to reuse common job items
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {templates.map((template) => (
              <div
                key={template.id}
                onClick={() => router.push(`/templates/${template.id}`)}
                className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 cursor-pointer hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-900 dark:text-white">{template.name}</h3>
                    {template.description && (
                      <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 line-clamp-2">
                        {template.description}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center justify-between text-sm text-gray-500 dark:text-gray-400 mt-3">
                  <span>{template.items.length} items</span>
                  <span className="font-medium text-gray-900 dark:text-white">
                    ${calculateTotal(template).toLocaleString()}
                  </span>
                </div>
                <div className="text-xs text-gray-400 dark:text-gray-500 mt-2">
                  Updated {formatDateTime(template.updated_at)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <BottomNav />
    </div>
  );
}
