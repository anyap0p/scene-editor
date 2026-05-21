import type { Project } from './types';
import { newId } from './types';
import { normalizeProject } from './groups';

const DB_NAME = 'scene-editor';
const DB_VERSION = 1;
const STORE = 'projects';
const ACTIVE_KEY = 'scene-editor-active-project';

export interface StoredProjectMeta {
  id: string;
  name: string;
  updatedAt: number;
  createdAt: number;
}

export interface StoredProject extends StoredProjectMeta {
  project: Project;
}

interface ProjectRow {
  id: string;
  project: Project;
  createdAt: number;
  updatedAt: number;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error ?? new Error('Failed to open IndexedDB'));
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('updatedAt', 'updatedAt', { unique: false });
      }
    };
  });
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'));
  });
}

function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
  });
}

/** Run a read/write transaction; waits for commit before resolving. */
async function withTransaction<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => Promise<T>,
): Promise<T> {
  const db = await openDb();
  const tx = db.transaction(STORE, mode);
  const store = tx.objectStore(STORE);
  try {
    const result = await run(store);
    await transactionDone(tx);
    return result;
  } finally {
    db.close();
  }
}

/** Plain object safe for IndexedDB (Svelte $state proxies cannot be structuredClone'd). */
export function cloneProject(project: Project): Project {
  return JSON.parse(JSON.stringify(project));
}

export function defaultProject(name = 'Untitled scene'): Project {
  return {
    name,
    duration: 10,
    canvasWidth: 800,
    canvasHeight: 600,
    elements: [],
    groups: [],
  };
}

export function projectId(): string {
  return `proj_${newId().slice(3)}`;
}

export function getActiveId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_KEY);
  } catch {
    return null;
  }
}

export function setActiveId(id: string): void {
  try {
    localStorage.setItem(ACTIVE_KEY, id);
  } catch {
    /* ignore */
  }
}

export async function listProjectMetas(): Promise<StoredProjectMeta[]> {
  const rows = await withTransaction('readonly', (store) => request(store.getAll()));
  return rows
    .map((row) => ({
      id: row.id,
      name: row.project.name,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getProject(id: string): Promise<StoredProject | null> {
  const row = await withTransaction('readonly', (store) => request(store.get(id)));
  if (!row) return null;
  return {
    id: row.id,
    name: row.project.name,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    project: normalizeProject(cloneProject(row.project)),
  };
}

export async function putProject(id: string, project: Project): Promise<void> {
  const data = cloneProject(project);
  await withTransaction('readwrite', async (store) => {
    const existing = await request<ProjectRow | undefined>(store.get(id));
    const now = Date.now();
    const row: ProjectRow = {
      id,
      project: data,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    await request(store.put(row));
  });
}

export async function createProject(project?: Project): Promise<string> {
  const id = projectId();
  const data = project ?? defaultProject();
  await putProject(id, data);
  return id;
}

export async function deleteProject(id: string): Promise<void> {
  await withTransaction('readwrite', (store) => request(store.delete(id)));
}

/** Ensure at least one project exists; return the active project id. */
export async function ensureProjects(): Promise<string> {
  const metas = await listProjectMetas();
  if (metas.length === 0) {
    const id = await createProject();
    setActiveId(id);
    return id;
  }

  const active = getActiveId();
  if (active && metas.some((m) => m.id === active)) return active;

  const id = metas[0].id;
  setActiveId(id);
  return id;
}
