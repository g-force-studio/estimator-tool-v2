import { getUploadQueue, updateUploadStatus, removeUpload } from './idb';
import { SYNC_RETRY_DELAYS } from '../config';

let isProcessing = false;

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

async function uploadFile(item: any) {
  const formData = new FormData();
  formData.append('file', item.blob, item.filename);
  formData.append('jobId', item.jobId);
  formData.append('jobItemId', item.jobItemId);
  formData.append('mimeType', item.mimeType);

  const response = await fetch('/api/uploads', {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`Upload failed: ${response.statusText}`);
  }

  return response.json();
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    processUploadQueue();
  });
}
