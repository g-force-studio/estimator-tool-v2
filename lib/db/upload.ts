import {
  getUploadQueue,
  updateUploadStatus,
  removeUpload,
  enqueueUpload,
} from './idb';
import { SYNC_RETRY_DELAYS } from '../config';
import { createClient as createBrowserClient } from '@/lib/supabase/client';

let isProcessing = false;

type UploadQueueItem = {
  id?: number;
  jobId: string;
  jobItemId: string;
  blob: Blob;
  filename: string;
  mimeType: string;
  retries: number;
  status: 'queued' | 'uploading' | 'uploaded' | 'failed';
};

type UploadPayload = {
  file?: File;
  job_id?: string;
  jobId?: string;
  job_item_id?: string;
  jobItemId?: string;
  blob?: Blob;
  filename?: string;
  mimeType?: string;
};

type SignedUploadResponse = {
  signed_url: string;
  token: string;
  path: string;
  bucket: string;
};

export async function processUploadQueue() {
  if (isProcessing || !navigator.onLine) return;

  isProcessing = true;

  try {
    const queue = await getUploadQueue();
    const pending = queue.filter((item) => item.status === 'queued' || item.status === 'failed');

    for (const item of pending) {
      try {
        await updateUploadStatus(item.id!, 'uploading');
        await uploadFile(item);
        await updateUploadStatus(item.id!, 'uploaded');
        await removeUpload(item.id!);
      } catch (error) {
        console.error('Upload failed:', error);

        const nextRetry = item.retries + 1;
        if (nextRetry < SYNC_RETRY_DELAYS.length) {
          await updateUploadStatus(item.id!, 'failed', nextRetry);
          setTimeout(() => processUploadQueue(), SYNC_RETRY_DELAYS[nextRetry]);
        } else {
          await updateUploadStatus(item.id!, 'failed', nextRetry);
          console.error('Max retries reached for upload:', item);
        }
      }
    }
  } finally {
    isProcessing = false;
  }
}

export async function addToUploadQueue(payload: UploadPayload) {
  if (payload.file instanceof File) {
    return enqueueUpload({
      jobId: payload.job_id || payload.jobId || '',
      jobItemId: payload.job_item_id || payload.jobItemId || 'general',
      blob: payload.file,
      filename: payload.file.name,
      mimeType: payload.file.type,
    });
  }

  return enqueueUpload({
    jobId: payload.jobId || '',
    jobItemId: payload.jobItemId || 'general',
    blob: payload.blob as Blob,
    filename: payload.filename || 'upload',
    mimeType: payload.mimeType || '',
  });
}

async function requestSignedUpload(payload: {
  jobId: string;
  jobItemId: string;
  filename?: string;
  mimeType?: string;
}) {
  const response = await fetch('/api/uploads/signed', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.error || 'Failed to create signed upload');
  }

  return (await response.json()) as SignedUploadResponse;
}

async function recordUploadedFile(payload: { jobId: string; storagePath: string; kind?: string }) {
  const response = await fetch('/api/uploads/record', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.error || 'Failed to record upload');
  }

  return response.json();
}

export async function uploadJobPhoto(payload: {
  jobId: string;
  jobItemId?: string;
  file: Blob;
  filename?: string;
  mimeType?: string;
}) {
  const signed = await requestSignedUpload({
    jobId: payload.jobId,
    jobItemId: payload.jobItemId || 'general',
    filename: payload.filename,
    mimeType: payload.mimeType,
  });

  const supabase = createBrowserClient();
  const { error } = await supabase.storage
    .from(signed.bucket)
    .uploadToSignedUrl(signed.path, signed.token, payload.file, {
      contentType: payload.mimeType,
      upsert: false,
    });

  if (error) {
    throw error;
  }

  await recordUploadedFile({
    jobId: payload.jobId,
    storagePath: signed.path,
    kind: 'image',
  });

  return signed;
}

async function uploadFile(item: UploadQueueItem) {
  return uploadJobPhoto({
    jobId: item.jobId,
    jobItemId: item.jobItemId,
    file: item.blob,
    filename: item.filename,
    mimeType: item.mimeType,
  });
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    processUploadQueue();
  });
}
