/** Durable browser workspace recovery. It never writes an opened Canvas file. */
import type { LocalFileHandle } from './files.ts';

export interface WorkspaceState { ids: string[]; active: string }
export interface FileBinding { handle: LocalFileHandle; snapshot: string; bindingId?: string }
export interface DraftFileState { saved: string; fileName: string; fileBindingId: string | null }
export interface SavedFileState extends DraftFileState { fileBindingId: string; binding: FileBinding & { bindingId: string } }
export interface DraftSession {
  persistDraft(value: unknown): Promise<void>;
  /** A different document/association invalidates saves started before it. */
  setFileState(value: DraftFileState): void;
  beginSave(): { complete(binding: Omit<FileBinding, 'bindingId'>): Promise<SavedFileState | null> };
  /** Cache the final input synchronously before another instance can mount. */
  dispose(finalDraft?: unknown): Promise<void>;
}
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
function workspaceTimestamp(value: unknown): number {
  const timestamp = value && typeof value === 'object' ? (value as { _workspaceUpdatedAt?: unknown })._workspaceUpdatedAt : undefined;
  return typeof timestamp === 'number' && Number.isSafeInteger(timestamp) && timestamp >= 0 ? timestamp : 0;
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
    async get(key) { const text = storage.getItem(keyFor(key)); return text === null ? undefined : JSON.parse(text); },
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
  type DraftOwner = {
    state: DraftFileState;
    onSaved?: (state: SavedFileState) => void;
    released: boolean;
    checkpoint?: { previousBindingId: string | null; previousFileName: string; saved: SavedFileState };
  };
  // One small owner/checkpoint per tab; no previous Canvas, form or history is
  // retained here. A new instance invalidates the old instance's draft writer.
  const draftOwners = new Map<string, DraftOwner>();
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
  function readLegacy(key: string, preserveMalformed = false): unknown {
    const text = legacy?.getItem(key);
    if (text === null || text === undefined) return undefined;
    try { return JSON.parse(text); }
    catch {
      // A damaged draft can still contain recoverable user text. Let the
      // editor quarantine the original string instead of replacing it with a
      // fresh document. A damaged tab list cannot safely identify its drafts.
      if (preserveMalformed) return text;
      throw new Error('原工作区页签记录无法读取，已暂停覆盖它。');
    }
  }
  const api = {
    openDraftSession(key: string, initialState: DraftFileState, onSaved?: (state: SavedFileState) => void): DraftSession {
      const previous = draftOwners.get(key);
      const checkpoint = previous?.checkpoint;
      const caughtUp = checkpoint && (initialState.fileBindingId === checkpoint.saved.fileBindingId
        || (initialState.fileBindingId === checkpoint.previousBindingId && initialState.fileName === checkpoint.previousFileName));
      const state = caughtUp ? checkpoint.saved : initialState;
      const owner: DraftOwner = { state: { saved: state.saved, fileName: state.fileName, fileBindingId: state.fileBindingId },
        released: false, onSaved, ...(caughtUp ? { checkpoint } : {}) };
      if (previous) { previous.released = true; previous.onSaved = undefined; }
      draftOwners.set(key, owner);
      if (caughtUp && (initialState.saved !== state.saved || initialState.fileBindingId !== state.fileBindingId || initialState.fileName !== state.fileName)) {
        queueMicrotask(() => {
          if (!owner.released && draftOwners.get(key) === owner && owner.checkpoint === checkpoint
            && owner.state.fileBindingId === checkpoint.saved.fileBindingId) owner.onSaved?.(checkpoint.saved);
        });
      }
      const persist = (value: unknown) => {
        if (draftOwners.get(key) !== owner || removed.has(key)) return Promise.resolve();
        // The snapshot may have been captured before a completed save's React
        // update. Its contents stay intact; only file metadata catches up.
        const next = value && typeof value === 'object' && !Array.isArray(value) ? { ...value, ...owner.state } : value;
        return api.persistDraft(key, next);
      };
      let disposed: Promise<void> | undefined;
      return {
        persistDraft: persist,
        setFileState(value) {
          if (owner.released || draftOwners.get(key) !== owner || removed.has(key)) return;
          owner.state = { saved: value.saved, fileName: value.fileName, fileBindingId: value.fileBindingId };
          owner.checkpoint = undefined;
        },
        beginSave() {
          const expectedBindingId = owner.state.fileBindingId, expectedFileName = owner.state.fileName;
          let completed: Promise<SavedFileState | null> | undefined;
          return { complete(binding) {
            if (completed) return completed;
            completed = (async () => {
              if (removed.has(key)) return null;
              const current = draftOwners.get(key), latest = drafts.get(key) as Record<string, unknown> | undefined;
              if (!current || current.state.fileBindingId !== expectedBindingId || current.state.fileName !== expectedFileName) return null;
              const nextBinding = { ...binding, bindingId: crypto.randomUUID() };
              const next: SavedFileState = { saved: binding.snapshot, fileName: binding.handle.name, fileBindingId: nextBinding.bindingId, binding: nextBinding };
              current.state = { saved: next.saved, fileName: next.fileName, fileBindingId: next.fileBindingId };
              current.checkpoint = { previousBindingId: expectedBindingId, previousFileName: expectedFileName, saved: next };
              // Cache records before publishing when recovery storage allows
              // it. Even a paused recovery must acknowledge the actual file
              // save to the active editor, without replacing old rescue data.
              const pending = [api.persistFileBinding(key, nextBinding)];
              if (latest && typeof latest === 'object' && !Array.isArray(latest) && latest.fileBindingId === expectedBindingId) {
                pending.push(api.persistDraft(key, { ...latest, ...current.state }));
              } else {
                pending.push(Promise.reject(new Error('文件已保存，但工作区草稿的文件关联无法核对；原恢复记录已保留。')));
              }
              if (!current.released) current.onSaved?.(next);
              await Promise.all(pending);
              return next;
            })();
            return completed;
          } };
        },
        dispose(finalDraft) {
          if (disposed) return disposed;
          owner.released = true;
          owner.onSaved = undefined;
          disposed = finalDraft === undefined ? Promise.resolve() : persist(finalDraft);
          return disposed;
        },
      };
    },
    async hydrateWorkspace(baseKey: string, fallback: WorkspaceState = { ids: ['initial'], active: 'initial' }): Promise<WorkspaceState> {
      let loading = hydrated.get(baseKey);
      if (!loading) {
        loading = (async () => {
          const storedTabs = await storage.get(`tabs:${baseKey}`);
          const persisted = workspaceState(storedTabs);
          if (storedTabs !== undefined && !persisted) throw new Error('原工作区页签清单无效，已暂停覆盖它。');
          // The session copy is written synchronously before the durable
          // transaction. A failed/unfinished tab-list write must not hide a
          // newly-created tab whose draft is already recoverable there.
          let legacyTabs: unknown;
          try { legacyTabs = readLegacy(`${baseKey}:tabs`); }
          catch (error) { if (!persisted) throw error; }
          const legacyState = workspaceState(legacyTabs);
          if (!persisted && legacyTabs !== undefined && !legacyState) throw new Error('原工作区页签清单无效，已暂停覆盖它。');
          const durableTime = workspaceTimestamp(storedTabs), sessionTime = legacyState ? workspaceTimestamp(legacyTabs) : 0;
          lastTimestamp = Math.max(lastTimestamp, durableTime, sessionTime);
          const preferSession = Boolean(legacyState && (!persisted || sessionTime > durableTime));
          const next = preferSession ? legacyState! : persisted ?? workspaceState(fallback)!;
          await Promise.all(next.ids.map(async id => {
            const key = tabDraftKey(baseKey, id);
            const durable = storedDraft(await storage.get(`draft:${key}`));
            const session = readLegacy(key, true) as { _workspaceUpdatedAt?: unknown } | undefined;
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
          if (!persisted || preferSession) await storage.set(`tabs:${baseKey}`, { ...next, _workspaceUpdatedAt: sessionTime || timestamp() });
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
      const record = { ...snapshot, _workspaceUpdatedAt: timestamp() };
      try { legacy?.setItem?.(`${baseKey}:tabs`, JSON.stringify(record)); } catch { /* Durable persistence still proceeds. */ }
      return enqueue(`tabs:${baseKey}`, () => storage.set(`tabs:${baseKey}`, record));
    },
    async deleteDraft(key: string): Promise<void> {
      ensureReadable(key);
      removed.add(key); drafts.delete(key); bindings.delete(key);
      const owner = draftOwners.get(key);
      if (owner) { owner.released = true; owner.onSaved = undefined; }
      draftOwners.delete(key);
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
  persistWorkspace, deleteDraft, subscribeWorkspaceStatus, getWorkspaceStatus, openDraftSession } = store;
