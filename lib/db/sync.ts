import { getSyncQueue, removeSyncOperation, updateSyncOperation } from './idb';
import { SYNC_RETRY_DELAYS } from '../config';

let isProcessing = false;

export async function processSyncQueue() {
  if (isProcessing || !navigator.onLine) return;

  isProcessing = true;

  try {
    const queue = await getSyncQueue();

    for (const item of queue) {
      try {
        await executeSyncOperation(item);
        await removeSyncOperation(item.id!);
      } catch (error) {
        console.error('Sync operation failed:', error);

        const nextRetry = item.retries + 1;
        if (nextRetry < SYNC_RETRY_DELAYS.length) {
          await updateSyncOperation(item.id!, { retries: nextRetry });
          setTimeout(() => processSyncQueue(), SYNC_RETRY_DELAYS[nextRetry]);
        } else {
          console.error('Max retries reached for sync operation:', item);
        }
      }
    }
  } finally {
    isProcessing = false;
  }
}

async function executeSyncOperation(operation: any) {
  const { type, entity, data } = operation;

  const endpoint = `/api/${entity}`;
  const method = type === 'create' ? 'POST' : type === 'update' ? 'PUT' : 'DELETE';

  const response = await fetch(endpoint, {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    throw new Error(`Sync failed: ${response.statusText}`);
  }

  return response.json();
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    processSyncQueue();
  });
}
