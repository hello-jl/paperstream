import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createIndexedDbStorage, createLocalStorageFallback, createWorkspaceStore, recoverFileBinding, tabDraftKey } from './workspace-store.ts';
import type { WorkspaceStorage } from './workspace-store.ts';
import { writeFile } from './files.ts';
import type { LocalFileHandle } from './files.ts';
import { restoreEditorDraft } from './draft-recovery.ts';

function memory() {
  const records = new Map<string, unknown>();
  const adapter: WorkspaceStorage = {
    get: async key => records.get(key),
    set: async (key, value) => { records.set(key, value); },
    delete: async key => { records.delete(key); },
  };
  return { records, adapter };
}
function legacyMemory() {
  const records = new Map<string, string>();
  return { records, getItem: (key: string) => records.get(key) ?? null,
    setItem: (key: string, value: string) => { records.set(key, value); }, removeItem: (key: string) => { records.delete(key); } };
}
function file(permission: PermissionState = 'granted') {
  const state = { permission, requested: 0, queried: 0, reads: 0, writers: 0, text: 'original' };
  const handle: LocalFileHandle = {
    name: 'papers.canvas',
    queryPermission: async options => { assert.equal(options.mode, 'readwrite'); state.queried++; return state.permission; },
    requestPermission: async options => { assert.equal(options.mode, 'readwrite'); state.requested++; state.permission = 'granted'; return 'granted'; },
    async getFile() { state.reads++; return { text: async () => state.text }; },
    async createWritable() { state.writers++; return { async write(text) { state.text = text; }, async close() {}, async abort() {} }; },
  };
  return { state, handle };
}

test('reopening a workspace restores active tabs, drafts and exact file snapshots without sessionStorage', async () => {
  const { adapter } = memory(), first = createWorkspaceStore(adapter);
  const binding = file();
  await first.hydrateWorkspace('project');
  const tabs = { ids: ['initial', 'other'], active: 'other' };
  const draft = { canvas: { nodes: [{ text: '中文草稿' }], edges: [] }, saved: 'original', fileName: 'papers.canvas', form: { alias: '未完成字段' }, past: [{ huge: true }] };
  await first.persistWorkspace('project', tabs);
  await first.persistDraft('project:other', draft);
  await first.persistFileBinding('project:other', { handle: binding.handle, snapshot: 'original\r\n' });
  draft.canvas.nodes[0].text = 'caller mutation';
  const reopened = createWorkspaceStore(adapter);
  assert.deepEqual(await reopened.hydrateWorkspace('project'), tabs);
  const recovered = reopened.getRestoredDraft('project:other') as typeof draft;
  assert.equal(recovered.canvas.nodes[0].text, '中文草稿');
  assert.equal(recovered.form.alias, '未完成字段');
  assert.ok(!Object.hasOwn(recovered, 'past'));
  assert.equal(reopened.getRestoredFileBinding('project:other')?.snapshot, 'original\r\n');
  assert.equal(binding.state.reads, 0);
});

test('legacy drafts migrate once and a newer session copy wins over an older completed durable write', async () => {
  const { adapter, records } = memory(), session = legacyMemory();
  session.setItem('project:tabs', JSON.stringify({ ids: ['initial'], active: 'initial' }));
  session.setItem('project', JSON.stringify({ canvas: { nodes: [], edges: [] }, fileName: 'legacy.canvas', formDirty: true }));
  const first = createWorkspaceStore(adapter, session);
  await first.hydrateWorkspace('project');
  assert.equal((first.getRestoredDraft('project') as { fileName: string }).fileName, 'legacy.canvas');
  assert.ok(records.has('draft:project'));
  session.setItem('project', JSON.stringify({ canvas: { nodes: [], edges: [] }, fileName: 'newer.canvas', _workspaceUpdatedAt: Number.MAX_SAFE_INTEGER }));
  const reopened = createWorkspaceStore(adapter, session);
  await reopened.hydrateWorkspace('project');
  assert.equal((reopened.getRestoredDraft('project') as { fileName: string }).fileName, 'newer.canvas');
  assert.ok(!Object.hasOwn(reopened.getRestoredDraft('project') as object, '_workspaceUpdatedAt'));
});

test('newer session tab manifest restores a tab after its durable manifest write fails', async () => {
  const { adapter, records } = memory(), session = legacyMemory();
  const first = createWorkspaceStore(adapter, session);
  await first.hydrateWorkspace('project');
  const originalSet = adapter.set;
  adapter.set = async (key, value) => {
    if (key === 'tabs:project') throw new Error('manifest transaction aborted');
    await originalSet(key, value);
  };
  const next = { ids: ['initial', 'new-paper'], active: 'new-paper' };
  await assert.rejects(first.persistWorkspace('project', next), /transaction aborted/);
  await first.persistDraft('project:new-paper', { form: { takeaway: 'new tab precious text' } });
  assert.deepEqual((records.get('tabs:project') as { ids: string[] }).ids, ['initial']);
  adapter.set = originalSet;

  const reopened = createWorkspaceStore(adapter, session);
  assert.deepEqual(await reopened.hydrateWorkspace('project'), next);
  assert.deepEqual(reopened.getRestoredDraft('project:new-paper'), { form: { takeaway: 'new tab precious text' } });
  const durableOnly = createWorkspaceStore(adapter);
  assert.deepEqual(await durableOnly.hydrateWorkspace('project'), next, 'successful recovery repairs the older durable manifest');
});

test('newer session tab deletion does not resurrect a closed tab after an interrupted manifest write', async () => {
  const { adapter } = memory(), session = legacyMemory(), first = createWorkspaceStore(adapter, session);
  const original = { ids: ['initial', 'closed'], active: 'closed' };
  await first.hydrateWorkspace('project');
  await first.persistWorkspace('project', original);
  await first.persistDraft('project:closed', { form: { text: 'closed intentionally' } });
  const originalSet = adapter.set;
  adapter.set = async (key, value) => { if (key === 'tabs:project') throw new Error('interrupted'); await originalSet(key, value); };
  await assert.rejects(first.persistWorkspace('project', { ids: ['initial'], active: 'initial' }), /interrupted/);
  await first.deleteDraft('project:closed');
  adapter.set = originalSet;
  const reopened = createWorkspaceStore(adapter, session);
  assert.deepEqual(await reopened.hydrateWorkspace('project'), { ids: ['initial'], active: 'initial' });
});

test('a newer durable tab manifest wins over a stale session, including future writes after recovery', async () => {
  const { adapter, records } = memory(), session = legacyMemory();
  const future = Date.now() + 60_000;
  records.set('tabs:project', { ids: ['durable'], active: 'durable', _workspaceUpdatedAt: future });
  session.setItem('project:tabs', JSON.stringify({ ids: ['stale'], active: 'stale', _workspaceUpdatedAt: future - 1 }));
  const restored = createWorkspaceStore(adapter, session);
  assert.deepEqual(await restored.hydrateWorkspace('project'), { ids: ['durable'], active: 'durable' });
  await restored.persistWorkspace('project', { ids: ['durable', 'next'], active: 'next' });
  assert.ok((records.get('tabs:project') as { _workspaceUpdatedAt: number })._workspaceUpdatedAt > future);
  const reopened = createWorkspaceStore(adapter, session);
  assert.deepEqual(await reopened.hydrateWorkspace('project'), { ids: ['durable', 'next'], active: 'next' });
});

test('file binding identity survives reopening while legacy records stay identifiable as unpaired', async () => {
  const { adapter } = memory(), first = createWorkspaceStore(adapter), binding = file();
  await first.hydrateWorkspace('project');
  await first.persistWorkspace('project', { ids: ['initial', 'legacy'], active: 'initial' });
  await first.persistDraft('project', { saved: 'original', fileBindingId: 'binding-generation-2' });
  await first.persistFileBinding('project', { handle: binding.handle, snapshot: 'original', bindingId: 'binding-generation-2' });
  await first.persistFileBinding('project:legacy', { handle: binding.handle, snapshot: 'original' });
  const reopened = createWorkspaceStore(adapter);
  await reopened.hydrateWorkspace('project');
  const recovered = reopened.getRestoredFileBinding('project');
  assert.equal(recovered?.bindingId, 'binding-generation-2');
  assert.equal((reopened.getRestoredDraft('project') as { fileBindingId: string }).fileBindingId, recovered?.bindingId);
  assert.equal(reopened.getRestoredFileBinding('project:legacy')?.bindingId, undefined);
  assert.equal(reopened.getRestoredFileBinding('project:legacy')?.snapshot, 'original');
  assert.equal((await recoverFileBinding(recovered)).binding?.bindingId, 'binding-generation-2');
});

test('rapid writes coalesce to the latest draft and closing a tab prevents late asynchronous resurrection', async () => {
  const { adapter, records } = memory();
  let release: (() => void) | undefined, writes = 0;
  const originalSet = adapter.set;
  adapter.set = async (key, value) => {
    if (key.startsWith('draft:')) {
      writes++;
      if (writes === 1) await new Promise<void>(resolve => { release = resolve; });
    }
    await originalSet(key, value);
  };
  const store = createWorkspaceStore(adapter);
  await store.hydrateWorkspace('project');
  const first = store.persistDraft('project', { text: 'first' });
  await new Promise(resolve => setTimeout(resolve, 0));
  const second = store.persistDraft('project', { text: 'second' });
  const third = store.persistDraft('project', { text: 'third' });
  release!(); await Promise.all([first, second, third]);
  assert.equal(writes, 2);
  const reopened = createWorkspaceStore(adapter); await reopened.hydrateWorkspace('project');
  assert.deepEqual(reopened.getRestoredDraft('project'), { text: 'third' });
  const deleting = store.deleteDraft('project');
  await store.persistDraft('project', { text: 'late upload' });
  await deleting;
  assert.equal(records.has('draft:project'), false);
  assert.equal(store.getRestoredDraft('project'), undefined);
});

test('recovery failure cannot overwrite unreadable existing workspace records', async () => {
  const { adapter, records } = memory();
  records.set('tabs:project', { ids: ['precious'], active: 'precious' });
  adapter.get = async () => { throw new Error('storage read denied'); };
  const store = createWorkspaceStore(adapter), statuses: string[] = [];
  store.subscribeWorkspaceStatus(value => statuses.push(value.state));
  await assert.rejects(store.hydrateWorkspace('project'), /read denied/);
  await assert.rejects(store.persistWorkspace('project', { ids: ['initial'], active: 'initial' }), /暂停覆盖/);
  await assert.rejects(store.persistDraft('project', { canvas: { nodes: [], edges: [] } }), /暂停覆盖/);
  assert.deepEqual(records.get('tabs:project'), { ids: ['precious'], active: 'precious' });
  assert.ok(statuses.includes('error'));
});

test('damaged legacy draft JSON remains recoverable and quarantined instead of becoming a fresh document', async () => {
  const { adapter, records } = memory(), session = legacyMemory();
  const original = '{"canvas":{"nodes":[],"edges":[]},"form":{"takeaway":"precious unfinished text';
  session.setItem('project', original);
  const store = createWorkspaceStore(adapter, session);
  await store.hydrateWorkspace('project');
  assert.equal(store.getRestoredDraft('project'), original);
  assert.match(restoreEditorDraft(store.getRestoredDraft('project')).recoveryError, /暂停覆盖/);
  assert.equal(session.getItem('project'), original, 'migration leaves the original rescue copy intact');
  assert.equal((records.get('draft:project') as { value: unknown }).value, original);

  const reopened = createWorkspaceStore(adapter);
  await reopened.hydrateWorkspace('project');
  assert.equal(reopened.getRestoredDraft('project'), original);
  assert.match(restoreEditorDraft(reopened.getRestoredDraft('project')).recoveryError, /暂停覆盖/);
});

test('invalid durable tab manifests are not replaced by an empty workspace', async () => {
  for (const manifest of [null, {}, { ids: [], active: 'precious' }, { ids: ['precious', 4], active: 'precious' }]) {
    const { adapter, records } = memory();
    records.set('tabs:project', manifest);
    records.set('draft:project:precious', { value: 'unread but valuable draft' });
    const store = createWorkspaceStore(adapter);
    await assert.rejects(store.hydrateWorkspace('project'), /页签清单无效/);
    await assert.rejects(store.persistWorkspace('project', { ids: ['initial'], active: 'initial' }), /暂停覆盖/);
    await assert.rejects(store.persistDraft('project', { canvas: { nodes: [], edges: [] } }), /暂停覆盖/);
    assert.equal(records.get('tabs:project'), manifest);
    assert.deepEqual(records.get('draft:project:precious'), { value: 'unread but valuable draft' });
  }
});

test('invalid legacy tab manifests are protected while a valid durable manifest still takes precedence', async () => {
  for (const manifest of ['{broken', '{"ids":[]}']) {
    const { adapter, records } = memory(), session = legacyMemory();
    session.setItem('project:tabs', manifest);
    session.setItem('project:precious', '{valuable damaged draft');
    const store = createWorkspaceStore(adapter, session);
    await assert.rejects(store.hydrateWorkspace('project'), /页签/);
    await assert.rejects(store.persistWorkspace('project', { ids: ['initial'], active: 'initial' }), /暂停覆盖/);
    assert.equal(session.getItem('project:tabs'), manifest);
    assert.equal(session.getItem('project:precious'), '{valuable damaged draft');
    assert.equal(records.has('tabs:project'), false);

    records.set('tabs:project', { ids: ['initial'], active: 'initial' });
    const readable = createWorkspaceStore(adapter, session);
    assert.deepEqual(await readable.hydrateWorkspace('project'), { ids: ['initial'], active: 'initial' });
  }
});

test('unreadable session storage cannot be mistaken for an absent recovery record', async () => {
  const { adapter, records } = memory();
  const store = createWorkspaceStore(adapter, { getItem() { throw new Error('session storage denied'); } });
  await assert.rejects(store.hydrateWorkspace('project'), /session storage denied/);
  await assert.rejects(store.persistDraft('project', {}), /暂停覆盖/);
  assert.equal(records.size, 0);
});

test('paused recovery protects session copies and cached drafts and bindings before any mutation', async () => {
  const { adapter, records } = memory(), session = legacyMemory();
  const store = createWorkspaceStore(adapter, session), original = file();
  const draft = { canvas: { nodes: [], edges: [] }, note: 'precious unsaved work' };
  const binding = { handle: original.handle, snapshot: 'original', bindingId: 'original-binding' };
  await store.persistDraft('project', draft);
  await store.persistFileBinding('project', binding);
  const sessionBefore = session.getItem('project');
  const durableBefore = records.get('draft:project');
  const bindingBefore = records.get('file:project');
  const originalGet = adapter.get;
  adapter.get = async () => { throw new Error('temporary read failure'); };
  await assert.rejects(store.hydrateWorkspace('project'), /temporary read failure/);

  await assert.rejects(store.persistDraft('project', { note: 'replacement' }), /暂停覆盖/);
  await assert.rejects(store.persistFileBinding('project', null), /暂停覆盖/);
  await assert.rejects(store.persistFileBinding('project', { handle: file().handle, snapshot: 'different' }), /暂停覆盖/);
  await assert.rejects(store.deleteDraft('project'), /暂停覆盖/);
  assert.equal(session.getItem('project'), sessionBefore);
  assert.equal(records.get('draft:project'), durableBefore);
  assert.equal(records.get('file:project'), bindingBefore);
  assert.deepEqual(store.getRestoredDraft('project'), draft);
  assert.deepEqual(store.getRestoredFileBinding('project'), binding);

  // A refused deletion must not leave a tombstone that silently drops later
  // edits after recovery becomes readable again.
  adapter.get = originalGet;
  await store.hydrateWorkspace('project');
  await store.persistDraft('project', { note: 'legitimate later edit' });
  assert.deepEqual(store.getRestoredDraft('project'), { note: 'legitimate later edit' });
});

test('permission recovery never prompts during boot and never replaces the conflict snapshot with disk content', async () => {
  const { handle, state } = file('prompt');
  const binding = { handle, snapshot: 'original' };
  assert.equal((await recoverFileBinding(binding)).status, 'prompt');
  assert.equal(state.requested, 0); assert.equal(state.reads, 0);
  assert.equal((await recoverFileBinding(binding, true)).status, 'granted');
  assert.equal(state.requested, 1);
  state.text = 'external edit while browser was closed';
  await assert.rejects(writeFile(handle, binding.snapshot, 'user draft'), /其他程序/);
  assert.equal(state.writers, 0);
  assert.equal(state.text, 'external edit while browser was closed');
  state.permission = 'denied';
  assert.equal((await recoverFileBinding(binding)).status, 'denied');
  assert.equal(state.requested, 1);
});

test('JSON fallback restores drafts but explicitly refuses to claim file-handle persistence', async () => {
  const values = legacyMemory(), adapter = createLocalStorageFallback(values);
  await adapter.set('draft:project', { canvas: { nodes: [], edges: [] } });
  assert.deepEqual(await adapter.get('draft:project'), { canvas: { nodes: [], edges: [] } });
  await assert.rejects(adapter.set('file:project', { handle: file().handle, snapshot: 'original' }), /无法长期保存文件授权/);
  assert.equal(tabDraftKey('project', 'initial'), 'project');
  assert.equal(tabDraftKey('project', 'second'), 'project:second');
});

test('an empty existing fallback record fails recovery instead of being overwritten as absent', async () => {
  const values = legacyMemory();
  values.setItem('paperstream-workspace:tabs:project', '');
  const store = createWorkspaceStore(createLocalStorageFallback(values));
  await assert.rejects(store.hydrateWorkspace('project'), SyntaxError);
  await assert.rejects(store.persistWorkspace('project', { ids: ['initial'], active: 'initial' }), /暂停覆盖/);
  assert.equal(values.getItem('paperstream-workspace:tabs:project'), '');
});

test('IndexedDB request success is insufficient when the transaction later aborts', async () => {
  const failure = new Error('quota exceeded');
  let aborted = false;
  const tx = { error: failure, oncomplete: null as (() => void) | null, onabort: null as (() => void) | null, onerror: null as (() => void) | null,
    objectStore() { return { put() {
      const request = { result: undefined, error: null, onsuccess: null as (() => void) | null };
      queueMicrotask(() => { request.onsuccess?.(); aborted = true; tx.onabort?.(); });
      return request;
    } }; } };
  const db = { transaction: () => tx, close() {}, onversionchange: null };
  const factory = { open() {
    const request = { result: db, error: null, onsuccess: null as (() => void) | null, onerror: null, onblocked: null, onupgradeneeded: null };
    queueMicrotask(() => request.onsuccess?.()); return request;
  } } as unknown as IDBFactory;
  await assert.rejects(createIndexedDbStorage(factory).set('draft:project', {}), /quota exceeded/);
  assert.equal(aborted, true);
});
