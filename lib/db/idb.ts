import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { IDB_STORES } from '../config';

type CacheRecord = Record<string, unknown>;

interface RelayKitDB extends DBSchema {
  [IDB_STORES.JOBS_CACHE]: {
    key: string;
    value: CacheRecord;
    indexes: { 'by-updated': string };
  };
  [IDB_STORES.JOB_DRAFTS]: {
    key: string;
    value: CacheRecord;
  };
  [IDB_STORES.TEMPLATES_CACHE]: {
    key: string;
    value: CacheRecord;
  };
  [IDB_STORES.PACKAGES_CACHE]: {
    key: string;
    value: CacheRecord;
  };
  [IDB_STORES.SYNC_QUEUE]: {
    key: number;
    value: {
      id?: number;
      type: 'create' | 'update' | 'delete';
      entity: string;
      data: CacheRecord;
      timestamp: number;
      retries: number;
    };
    indexes: { 'by-timestamp': number };
  };
  [IDB_STORES.UPLOAD_QUEUE]: {
    key: number;
    value: {
      id?: number;
      jobId: string;
      jobItemId: string;
      blob: Blob;
      filename: string;
      mimeType: string;
      timestamp: number;
      retries: number;
      status: 'queued' | 'uploading' | 'uploaded' | 'failed';
    };
    indexes: { 'by-status': string };
  };
}

let dbInstance: IDBPDatabase<RelayKitDB> | null = null;

export async function getDB(): Promise<IDBPDatabase<RelayKitDB>> {
  if (dbInstance) return dbInstance;

  dbInstance = await openDB<RelayKitDB>('relaykit-db', 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(IDB_STORES.JOBS_CACHE)) {
        const jobsStore = db.createObjectStore(IDB_STORES.JOBS_CACHE, { keyPath: 'id' });
        jobsStore.createIndex('by-updated', 'updated_at');
      }

      if (!db.objectStoreNames.contains(IDB_STORES.JOB_DRAFTS)) {
        db.createObjectStore(IDB_STORES.JOB_DRAFTS, { keyPath: 'id' });
      }

      if (!db.objectStoreNames.contains(IDB_STORES.TEMPLATES_CACHE)) {
        db.createObjectStore(IDB_STORES.TEMPLATES_CACHE, { keyPath: 'id' });
      }

      if (!db.objectStoreNames.contains(IDB_STORES.PACKAGES_CACHE)) {
        db.createObjectStore(IDB_STORES.PACKAGES_CACHE, { keyPath: 'public_slug' });
      }

      if (!db.objectStoreNames.contains(IDB_STORES.SYNC_QUEUE)) {
        const syncStore = db.createObjectStore(IDB_STORES.SYNC_QUEUE, {
          keyPath: 'id',
          autoIncrement: true,
        });
        syncStore.createIndex('by-timestamp', 'timestamp');
      }

      if (!db.objectStoreNames.contains(IDB_STORES.UPLOAD_QUEUE)) {
        const uploadStore = db.createObjectStore(IDB_STORES.UPLOAD_QUEUE, {
          keyPath: 'id',
          autoIncrement: true,
        });
        uploadStore.createIndex('by-status', 'status');
      }
    },
  });

  return dbInstance;
}

export async function cacheJobs(jobs: CacheRecord[]) {
  const db = await getDB();
  const tx = db.transaction(IDB_STORES.JOBS_CACHE, 'readwrite');
  await Promise.all(jobs.map((job) => tx.store.put(job)));
  await tx.done;
}

export async function createJob(job: CacheRecord) {
  const db = await getDB();
  await db.put(IDB_STORES.JOBS_CACHE, job);
}

export async function getJob(id: string): Promise<CacheRecord | undefined> {
  return getCachedJob(id);
}

export async function updateJob(job: CacheRecord) {
  const db = await getDB();
  await db.put(IDB_STORES.JOBS_CACHE, job);
}

export async function deleteJob(id: string) {
  const db = await getDB();
  await db.delete(IDB_STORES.JOBS_CACHE, id);
}

export async function getCachedJobs(): Promise<CacheRecord[]> {
  const db = await getDB();
  return db.getAllFromIndex(IDB_STORES.JOBS_CACHE, 'by-updated');
}

export async function getCachedJob(id: string): Promise<CacheRecord | undefined> {
  const db = await getDB();
  return db.get(IDB_STORES.JOBS_CACHE, id);
}

export async function saveDraft(draft: CacheRecord) {
  const db = await getDB();
  await db.put(IDB_STORES.JOB_DRAFTS, draft);
}

export async function addJobDraft(draft: CacheRecord) {
  return saveDraft(draft);
}

export async function getDraft(id: string): Promise<CacheRecord | undefined> {
  const db = await getDB();
  return db.get(IDB_STORES.JOB_DRAFTS, id);
}

export async function getJobDraft(id: string): Promise<CacheRecord | undefined> {
  return getDraft(id);
}

export async function deleteDraft(id: string) {
  const db = await getDB();
  await db.delete(IDB_STORES.JOB_DRAFTS, id);
}

export async function deleteJobDraft(id: string) {
  return deleteDraft(id);
}

export async function cacheTemplates(templates: CacheRecord[]) {
  const db = await getDB();
  const tx = db.transaction(IDB_STORES.TEMPLATES_CACHE, 'readwrite');
  await Promise.all(templates.map((template) => tx.store.put(template)));
  await tx.done;
}

export async function createTemplate(template: CacheRecord) {
  const db = await getDB();
  await db.put(IDB_STORES.TEMPLATES_CACHE, template);
}

export async function getTemplate(id: string): Promise<CacheRecord | undefined> {
  const db = await getDB();
  return db.get(IDB_STORES.TEMPLATES_CACHE, id);
}

export async function updateTemplate(template: CacheRecord) {
  const db = await getDB();
  await db.put(IDB_STORES.TEMPLATES_CACHE, template);
}

export async function deleteTemplate(id: string) {
  const db = await getDB();
  await db.delete(IDB_STORES.TEMPLATES_CACHE, id);
}

export async function getCachedTemplates(): Promise<CacheRecord[]> {
  const db = await getDB();
  return db.getAll(IDB_STORES.TEMPLATES_CACHE);
}

export async function cachePackage(pkg: CacheRecord) {
  const db = await getDB();
  await db.put(IDB_STORES.PACKAGES_CACHE, pkg);
}

export async function getCachedPackage(slug: string): Promise<CacheRecord | undefined> {
  const db = await getDB();
  return db.get(IDB_STORES.PACKAGES_CACHE, slug);
}

export async function enqueueSyncOperation(operation: {
  type: 'create' | 'update' | 'delete';
  entity: string;
  data: CacheRecord;
}) {
  const db = await getDB();
  await db.add(IDB_STORES.SYNC_QUEUE, {
    ...operation,
    timestamp: Date.now(),
    retries: 0,
  });
}

export async function getSyncQueue() {
  const db = await getDB();
  return db.getAllFromIndex(IDB_STORES.SYNC_QUEUE, 'by-timestamp');
}

export async function removeSyncOperation(id: number) {
  const db = await getDB();
  await db.delete(IDB_STORES.SYNC_QUEUE, id);
}

export async function updateSyncOperation(id: number, updates: Partial<CacheRecord>) {
  const db = await getDB();
  const item = await db.get(IDB_STORES.SYNC_QUEUE, id);
  if (item) {
    await db.put(IDB_STORES.SYNC_QUEUE, { ...item, ...updates });
  }
}

export async function enqueueUpload(upload: {
  jobId: string;
  jobItemId: string;
  blob: Blob;
  filename: string;
  mimeType: string;
}) {
  const db = await getDB();
  await db.add(IDB_STORES.UPLOAD_QUEUE, {
    ...upload,
    timestamp: Date.now(),
    retries: 0,
    status: 'queued',
  });
}

export async function getUploadQueue() {
  const db = await getDB();
  return db.getAll(IDB_STORES.UPLOAD_QUEUE);
}

export async function updateUploadStatus(
  id: number,
  status: 'queued' | 'uploading' | 'uploaded' | 'failed',
  retries?: number
) {
  const db = await getDB();
  const item = await db.get(IDB_STORES.UPLOAD_QUEUE, id);
  if (item) {
    await db.put(IDB_STORES.UPLOAD_QUEUE, {
      ...item,
      status,
      retries: retries !== undefined ? retries : item.retries,
    });
  }
}

export async function removeUpload(id: number) {
  const db = await getDB();
  await db.delete(IDB_STORES.UPLOAD_QUEUE, id);
}
