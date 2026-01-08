export const SIGNED_URL_TTL_SECONDS = parseInt(
  process.env.SIGNED_URL_TTL_SECONDS || '3600',
  10
);

export const APP_BASE_URL = process.env.APP_BASE_URL || 'http://localhost:3000';

export const INVITE_TOKEN_PEPPER = process.env.INVITE_TOKEN_PEPPER || '';

export const DRAFT_DEBOUNCE_MS = 1000;

// Override with one of the URLs below for local testing if needed.
// const N8N_WEBHOOK_URL_OVERRIDE = 'https://n8n.gforcstudio.com/webhook-test/e50ff17e-aa51-4faa-a720-0d6683be96fd';
// const N8N_WEBHOOK_URL_OVERRIDE = 'https://n8n.gforcstudio.com/webhook/e50ff17e-aa51-4faa-a720-0d6683be96fd';
const N8N_WEBHOOK_URL_OVERRIDE = '';
export const N8N_WEBHOOK_URL =
  N8N_WEBHOOK_URL_OVERRIDE || process.env.NEXT_PUBLIC_N8N_WEBHOOK_URL || '';

export const CACHE_NAMES = {
  APP_SHELL: 'relaykit-app-shell-v1',
  PACKAGES: 'relaykit-packages-v1',
  IMAGES: 'relaykit-images-v1',
};

export const IDB_STORES = {
  JOBS_CACHE: 'jobs_cache',
  JOB_DRAFTS: 'job_drafts',
  TEMPLATES_CACHE: 'templates_cache',
  PACKAGES_CACHE: 'packages_cache',
  SYNC_QUEUE: 'sync_queue',
  UPLOAD_QUEUE: 'upload_queue',
};

export const SYNC_RETRY_DELAYS = [1000, 2000, 5000, 10000, 30000];

export const MAX_OFFLINE_CACHE_SIZE = 50;
