/** Durable browser workspace recovery. It never writes an opened Canvas file. */
import type { LocalFileHandle } from './files.ts';

export interface WorkspaceState { ids: string[]; active: string }
export interface FileBinding { handle: LocalFileHandle; snapshot: string; bindingId?: string }
export interface WorkspaceStatus { state: 'ready' | 'saving' | 'error'; message: string }
export interface WorkspaceStorage {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<void>;
}
interface LegacyStorage { getItem(key: string): string | null; setItem?(key: string, value: string): void; removeItem?(key: string): void }

export function tabDraftKey(baseKey: string, id: string): string { return id === 'initial' ? baseKey : `${baseKey}:${id}`; }

function workspaceState(value: unknown): WorkspaceState | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<WorkspaceState>;
  if (!Array.isArray(candidate.ids) || !candidate.ids.length || !candidate.ids.every(id => typeof id === 'string' && id.length > 0)) return null;
  const ids = [...new Set(candidate.ids)];
  return { ids, active: typeof candidate.active === 'string' && ids.includes(candidate.active) ? candidate.active : ids[0] };
}
function draftCopy(value: unknown): unknown {
  // History is deliberately session-local. Repeating embedded figures in an
  // unbounded undo stack would exhaust browser storage surprisingly quickly.
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const { past: _past, future: _future, _workspaceUpdatedAt: _updatedAt, ...draft } = value as Record<string, unknown>;
    return JSON.parse(JSON.stringify(draft));
  }
  return JSON.parse(JSON.stringify(value));
}
function bindingValue(value: unknown): FileBinding | null {
  if (!value || typeof value !== 'object') return null;
  const binding = value as Partial<FileBinding>;
  return typeof binding.snapshot === 'string' && binding.handle && typeof binding.handle.name === 'string'
    && typeof binding.handle.getFile === 'function' && typeof binding.handle.createWritable === 'function'
    ? { handle: binding.handle, snapshot: binding.snapshot,
      ...(typeof binding.bindingId === 'string' ? { bindingId: binding.bindingId } : {}) } : null;
}

/** Resolve only after transaction completion, not merely request success. */
export function createIndexedDbStorage(factory: IDBFactory = globalThis.indexedDB): WorkspaceStorage {
  let opening: Promise<IDBDatabase> | null = null;
  const database = () => {
    if (!factory) return Promise.reject(new Error('浏览器不支持持久工作区存储。'));
    if (!opening) {
      opening = new Promise<IDBDatabase>((resolve, reject) => {
        let abandoned = false;
        const request = factory.open('paperstream-workspaces-v1', 1);
        request.onupgradeneeded = () => {
          if (!request.result.objectStoreNames.contains('records')) request.result.createObjectStore('records');
        };
        request.onerror = () => reject(request.error ?? new Error('无法打开工作区存储。'));
        request.onblocked = () => { abandoned = true; reject(new Error('工作区存储被其他窗口阻塞，请关闭旧版本页面后重试。')); };
        request.onsuccess = () => {
          const db = request.result;
          if (abandoned) { db.close(); return; }
          db.onversionchange = () => { db.close(); opening = null; };
          resolve(db);
        };
      }).catch(error => { opening = null; throw error; });
    }
    return opening;
  };
  async function transaction(key: string, operation: 'get' | 'set' | 'delete', value?: unknown): Promise<unknown> {
    const db = await database();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('records', operation === 'get' ? 'readonly' : 'readwrite');
      const store = tx.objectStore('records');
      const request = operation === 'get' ? store.get(key) : operation === 'set' ? store.put(value, key) : store.delete(key);
      let result: unknown;
      request.onsuccess = () => { result = request.result; };
      tx.oncomplete = () => resolve(result);
      tx.onabort = tx.onerror = () => reject(tx.error ?? request.error ?? new Error('工作区存储未完成写入。'));
    });
  }
  return {
    get: key => transaction(key, 'get'),
    set: async (key, value) => { await transaction(key, 'set', value); },
    delete: async key => { await transaction(key, 'delete'); },
  };
}

/** No structured-cloned handles are claimed when IndexedDB is unavailable. */
export function createLocalStorageFallback(storage: LegacyStorage): WorkspaceStorage {
  const keyFor = (key: string) => `paperstream-workspace:${key}`;
  return {
    async get(key) { const text = storage.getItem(keyFor(key)); return text ? JSON.parse(text) : undefined; },
    async set(key, value) {
      if (key.startsWith('file:')) throw new Error('此浏览器只能恢复草稿，无法长期保存文件授权；请重新选择原文件。');
      if (!storage.setItem) throw new Error('浏览器持久存储不可写。');
      storage.setItem(keyFor(key), JSON.stringify(value));
    },
    async delete(key) { storage.removeItem?.(keyFor(key)); },
  };
}

export function createWorkspaceStore(storage: WorkspaceStorage, legacy?: LegacyStorage) {
  const drafts = new Map<string, unknown>();
  const bindings = new Map<string, FileBinding>();
  const hydrated = new Map<string, Promise<WorkspaceState>>();
  const removed = new Set<string>();
  const unreadableNamespaces = new Set<string>();
  const queues = new Map<string, Promise<void>>();
  const scheduledDrafts = new Map<string, { latest: unknown; promise: Promise<void> }>();
  const errors = new Map<string, string>();
  const listeners = new Set<(status: WorkspaceStatus) => void>();
  let pending = 0;
  let lastTimestamp = 0;
  function timestamp() { lastTimestamp = Math.max(Date.now(), lastTimestamp + 1); return lastTimestamp; }
  function ensureReadable(key: string) {
    if ([...unreadableNamespaces].some(base => key === base || key.startsWith(`${base}:`))) {
      throw new Error('工作区恢复失败，已暂停覆盖原恢复记录；当前内容仍可手动保存到文件。');
    }
  }
  function storedDraft(value: unknown): { value: unknown; updatedAt: number } {
    if (value && typeof value === 'object' && (value as { version?: unknown }).version === 1 && Object.hasOwn(value, 'value')) {
      const record = value as { value: unknown; updatedAt?: unknown };
      return { value: record.value, updatedAt: typeof record.updatedAt === 'number' ? record.updatedAt : 0 };
    }
    return { value, updatedAt: 0 };
  }
  function status(): WorkspaceStatus {
    return errors.size ? { state: 'error', message: [...errors.values()][0] }
      : pending ? { state: 'saving', message: '正在保留工作区…' } : { state: 'ready', message: '工作区已保留在本机浏览器。' };
  }
  function publish() { const next = status(); listeners.forEach(listener => listener(next)); }
  function report(key: string, error: unknown) { errors.set(key, error instanceof Error ? error.message : String(error)); publish(); }
  function enqueue(key: string, operation: () => Promise<void>): Promise<void> {
    pending++; publish();
    const result = (queues.get(key) ?? Promise.resolve()).catch(() => {}).then(operation);
    queues.set(key, result);
    return result.then(() => { errors.delete(key); }, error => { report(key, error); throw error; })
      .finally(() => { pending--; if (queues.get(key) === result) queues.delete(key); publish(); });
  }
  function readLegacy(key: string): unknown {
    try { const text = legacy?.getItem(key); return text ? JSON.parse(text) : undefined; } catch { return undefined; }
  }
  const api = {
    async hydrateWorkspace(baseKey: string, fallback: WorkspaceState = { ids: ['initial'], active: 'initial' }): Promise<WorkspaceState> {
      let loading = hydrated.get(baseKey);
      if (!loading) {
        loading = (async () => {
          const persisted = workspaceState(await storage.get(`tabs:${baseKey}`));
          const next = persisted ?? workspaceState(readLegacy(`${baseKey}:tabs`)) ?? workspaceState(fallback)!;
          await Promise.all(next.ids.map(async id => {
            const key = tabDraftKey(baseKey, id);
            const durable = storedDraft(await storage.get(`draft:${key}`));
            const session = readLegacy(key) as { _workspaceUpdatedAt?: unknown } | undefined;
            const sessionTime = typeof session?._workspaceUpdatedAt === 'number' ? session._workspaceUpdatedAt : 0;
            const preferSession = session !== undefined && (durable.value === undefined || sessionTime > durable.updatedAt);
            const previous = preferSession ? session : durable.value;
            if (previous !== undefined && !drafts.has(key)) {
              drafts.set(key, draftCopy(previous));
              // Legacy migration never removes the old session copy until a
              // durable write has succeeded; denied storage cannot eat a draft.
              if (preferSession) await storage.set(`draft:${key}`, { version: 1, updatedAt: sessionTime || timestamp(), value: draftCopy(previous) });
            }
            const binding = bindingValue(await storage.get(`file:${key}`));
            if (binding && !bindings.has(key)) bindings.set(key, binding);
          }));
          if (!persisted) await storage.set(`tabs:${baseKey}`, next);
          unreadableNamespaces.delete(baseKey); errors.delete(`hydrate:${baseKey}`); publish();
          return next;
        })().catch(error => { hydrated.delete(baseKey); unreadableNamespaces.add(baseKey); report(`hydrate:${baseKey}`, error); throw error; });
        hydrated.set(baseKey, loading);
      }
      return loading;
    },
    getRestoredDraft(key: string): unknown { const value = drafts.get(key); return value === undefined ? undefined : draftCopy(value); },
    getRestoredFileBinding(key: string): FileBinding | null { const value = bindings.get(key); return value ? { ...value } : null; },
    persistDraft(key: string, value: unknown): Promise<void> {
      if (removed.has(key)) return Promise.resolve();
      try { ensureReadable(key); } catch (error) { return Promise.reject(error); }
      const snapshot = draftCopy(value), updatedAt = timestamp(); drafts.set(key, snapshot);
      try { legacy?.setItem?.(key, JSON.stringify({ ...(snapshot as object), _workspaceUpdatedAt: updatedAt })); } catch { /* IndexedDB remains the durable source when session quota is small. */ }
      const record = { version: 1, updatedAt, value: snapshot };
      const previous = scheduledDrafts.get(key);
      if (previous) { previous.latest = record; return previous.promise; }
      const entry = { latest: record as unknown, promise: Promise.resolve() };
      scheduledDrafts.set(key, entry);
      entry.promise = enqueue(`draft:${key}`, async () => {
        // Coalesce rapid typing while one large image-bearing snapshot writes.
        // At most the in-flight value and the latest value are retained.
        try {
          while (entry.latest !== undefined) {
            const next = entry.latest; entry.latest = undefined;
            await storage.set(`draft:${key}`, next);
          }
        } finally { if (scheduledDrafts.get(key) === entry) scheduledDrafts.delete(key); }
      });
      return entry.promise;
    },
    persistFileBinding(key: string, binding: FileBinding | null): Promise<void> {
      if (removed.has(key)) return Promise.resolve();
      try { ensureReadable(key); } catch (error) { return Promise.reject(error); }
      const snapshot = binding ? { ...binding } : null;
      if (snapshot) bindings.set(key, snapshot); else bindings.delete(key);
      return enqueue(`file:${key}`, () => snapshot ? storage.set(`file:${key}`, snapshot) : storage.delete(`file:${key}`));
    },
    persistWorkspace(baseKey: string, state: WorkspaceState): Promise<void> {
      const snapshot = workspaceState(state);
      if (!snapshot) return Promise.reject(new Error('无法保存无效的页签清单。'));
      try { ensureReadable(baseKey); } catch (error) { return Promise.reject(error); }
      hydrated.set(baseKey, Promise.resolve(snapshot));
      try { legacy?.setItem?.(`${baseKey}:tabs`, JSON.stringify(snapshot)); } catch { /* Durable persistence still proceeds. */ }
      return enqueue(`tabs:${baseKey}`, () => storage.set(`tabs:${baseKey}`, snapshot));
    },
    async deleteDraft(key: string): Promise<void> {
      ensureReadable(key);
      removed.add(key); drafts.delete(key); bindings.delete(key);
      await Promise.all([
        enqueue(`draft:${key}`, () => storage.delete(`draft:${key}`)),
        enqueue(`file:${key}`, () => storage.delete(`file:${key}`)),
      ]);
    },
    subscribeWorkspaceStatus(listener: (value: WorkspaceStatus) => void): () => void {
      listeners.add(listener); listener(status()); return () => { listeners.delete(listener); };
    },
    getWorkspaceStatus: status,
  };
  return api;
}

export async function recoverFileBinding(binding: FileBinding | null, requestPermission = false): Promise<{
  status: 'granted' | 'prompt' | 'denied' | 'unavailable'; binding: FileBinding | null;
}> {
  if (!binding || !bindingValue(binding)) return { status: 'unavailable', binding: null };
  const handle = binding.handle;
  if (!handle.queryPermission && !(requestPermission && handle.requestPermission)) return { status: 'unavailable', binding };
  try {
    // Only the explicit button path requests permission. Boot never prompts.
    // Request directly on that path, preserving the button's user activation.
    const permission = requestPermission && handle.requestPermission ? await handle.requestPermission({ mode: 'readwrite' })
      : await handle.queryPermission!({ mode: 'readwrite' });
    return { status: permission === 'granted' || permission === 'prompt' || permission === 'denied' ? permission : 'unavailable', binding };
  } catch { return { status: 'unavailable', binding }; }
}

function browserLegacy(): Storage | undefined { try { return globalThis.sessionStorage; } catch { return undefined; } }
function browserStorage(): WorkspaceStorage {
  if (globalThis.indexedDB) return createIndexedDbStorage();
  try { if (typeof window !== 'undefined' && globalThis.localStorage) return createLocalStorageFallback(globalThis.localStorage); } catch { /* Show an explicit failure below. */ }
  return { get: async () => undefined, set: async () => { throw new Error('浏览器无法持久保存工作区，请及时保存文件。'); }, delete: async () => {} };
}
const store = createWorkspaceStore(browserStorage(), browserLegacy());
export const { hydrateWorkspace, getRestoredDraft, getRestoredFileBinding, persistDraft, persistFileBinding,
  persistWorkspace, deleteDraft, subscribeWorkspaceStatus, getWorkspaceStatus } = store;
