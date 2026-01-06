'use client';

import { useEffect } from 'react';
import { processSyncQueue } from '@/lib/db/sync';
import { processUploadQueue } from '@/lib/db/upload';

const THEME_STORAGE_KEY = 'relaykit-theme';

type ThemePreference = 'light' | 'dark' | 'system';

function resolveTheme(preference: ThemePreference) {
  if (preference === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return preference;
}

function applyTheme(preference: ThemePreference) {
  const resolved = resolveTheme(preference);
  document.documentElement.classList.toggle('dark', resolved === 'dark');
  document.documentElement.style.colorScheme = resolved;
}

function getStoredTheme(): ThemePreference {
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (stored === 'light' || stored === 'dark' || stored === 'system') {
    return stored;
  }
  return 'system';
}

export function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const preference = getStoredTheme();
      applyTheme(preference);

      const media = window.matchMedia('(prefers-color-scheme: dark)');
      const handleMediaChange = () => {
        if (getStoredTheme() === 'system') {
          applyTheme('system');
        }
      };
      const handleStorage = (event: StorageEvent) => {
        if (event.key === THEME_STORAGE_KEY) {
          applyTheme(getStoredTheme());
        }
      };

      media.addEventListener('change', handleMediaChange);
      window.addEventListener('storage', handleStorage);

      processSyncQueue();
      processUploadQueue();

      const interval = setInterval(() => {
        processSyncQueue();
        processUploadQueue();
      }, 30000);

      return () => {
        clearInterval(interval);
        media.removeEventListener('change', handleMediaChange);
        window.removeEventListener('storage', handleStorage);
      };
    }
  }, []);

  return <>{children}</>;
}
