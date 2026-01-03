'use client';

import { useEffect, useState } from 'react';
import { getCachedJobs, cacheJobs } from '@/lib/db/idb';
import Link from 'next/link';
import { formatDate } from '@/lib/utils';

export function HomeContent({ workspaceId }: { workspaceId: string }) {
  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [online, setOnline] = useState(true);

  useEffect(() => {
    loadJobs();

    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const loadJobs = async () => {
    try {
      const cached = await getCachedJobs();
      if (cached.length > 0) {
        setJobs(cached);
        setLoading(false);
      }

      if (navigator.onLine) {
        const response = await fetch('/api/jobs');
        if (response.ok) {
          const data = await response.json();
          setJobs(data.jobs);
          await cacheJobs(data.jobs);
        }
      }
    } catch (error) {
      console.error('Failed to load jobs:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <main className="p-4 space-y-4">
      {!online && (
        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3 text-sm text-yellow-700 dark:text-yellow-300">
          📡 You're offline. Showing cached data.
        </div>
      )}

      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Recent Jobs</h2>
        <Link
          href="/jobs/new"
          className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90"
        >
          + New Job
        </Link>
      </div>

      {jobs.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground mb-4">No jobs yet</p>
          <Link
            href="/jobs/new"
            className="inline-block px-6 py-3 bg-primary text-primary-foreground rounded-lg font-medium hover:opacity-90"
          >
            Create Your First Job
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {jobs.map((job) => (
            <Link
              key={job.id}
              href={`/jobs/${job.id}`}
              className="block bg-card border border-border rounded-lg p-4 hover:border-primary transition-colors"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h3 className="font-semibold text-lg">{job.title}</h3>
                  {job.client_name && (
                    <p className="text-sm text-muted-foreground mt-1">
                      Client: {job.client_name}
                    </p>
                  )}
                  <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                    <span className="capitalize">{job.status}</span>
                    {job.due_date && <span>Due: {formatDate(job.due_date)}</span>}
                  </div>
                </div>
                <div className="text-2xl">📋</div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
