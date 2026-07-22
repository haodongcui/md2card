import type { LayoutConfig } from '../domain/document';

const DB_NAME = 'md2card';
const STORE = 'drafts';
const KEY = 'current';

export interface Draft {
  markdown: string;
  config: LayoutConfig;
  titleOverride?: string;
  sourceFileName?: string;
  images?: LocalImage[];
  imageBindingOverrides?: Record<string, string>;
  updatedAt: number;
}

export interface LocalImage {
  /** Stable within a draft; old saved images may not have one yet. */
  id?: string;
  name: string;
  /** Original path supplied by a directory picker, relative to its root. */
  paths?: string[];
  blob: Blob;
}

function database(name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readFromDatabase(name: string): Promise<Draft | undefined> {
  const db = await database(name);
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE, 'readonly').objectStore(STORE).get(KEY);
    request.onsuccess = () => resolve(request.result as Draft | undefined);
    request.onerror = () => reject(request.error);
  });
}

export async function readDraft(): Promise<Draft | undefined> {
  return readFromDatabase(DB_NAME);
}

export async function saveDraft(draft: Draft): Promise<void> {
  const db = await database(DB_NAME);
  await new Promise<void>((resolve, reject) => {
    const request = db.transaction(STORE, 'readwrite').objectStore(STORE).put(draft, KEY);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}
