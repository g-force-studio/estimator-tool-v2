'use client';

import { useEffect } from 'react';
import { processSyncQueue } from '@/lib/db/sync';
import { processUploadQueue } from '@/lib/db/upload';

export function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (typeof window !== 'undefined') {
      processSyncQueue();
      processUploadQueue();

      const interval = setInterval(() => {
        processSyncQueue();
        processUploadQueue();
      }, 30000);

      return () => clearInterval(interval);
    }
  }, []);

  return <>{children}</>;
}
