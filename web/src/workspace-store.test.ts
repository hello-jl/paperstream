import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createIndexedDbStorage, createLocalStorageFallback, createWorkspaceStore, recoverFileBinding, tabDraftKey } from './workspace-store.ts';
import type { DraftFileState, SavedFileState, WorkspaceStorage } from './workspace-store.ts';
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

function draftFixture() {
  const metadata: DraftFileState = { saved: 'original', fileName: 'papers.canvas', fileBindingId: 'binding-before-save' };
  const draft = { ...metadata, canvas: { nodes: [{ id: 'paper', text: 'current paper' }], edges: [] },
    selection: { kind: 'node', id: 'paper' }, form: { year: '202x' }, formDirty: true, unknown: { keep: ['metadata'] } };
  return { metadata, draft };
}

test('a save finishing after unmount updates the baseline without replacing the final draft or retaining its callback', async () => {
  const { adapter } = memory(), store = createWorkspaceStore(adapter), target = file(), { metadata, draft } = draftFixture();
  await store.persistDraft('project', draft);
  let notifications = 0;
  const session = store.openDraftSession('project', metadata, () => { notifications++; });
  const saving = session.beginSave();
  const finalDraft = { ...draft, form: { year: '202x last input' } };
  const disposing = session.dispose(finalDraft);
  assert.deepEqual(store.getRestoredDraft('project'), finalDraft, 'final input is cached before dispose returns its promise');
  await disposing;
  target.state.text = 'saved document';
  const saved = await saving.complete({ handle: target.handle, snapshot: target.state.text });
  assert.ok(saved);
  const recovered = store.getRestoredDraft('project') as typeof draft;
  assert.deepEqual(recovered.canvas, finalDraft.canvas); assert.deepEqual(recovered.form, finalDraft.form);
  assert.deepEqual(recovered.selection, finalDraft.selection); assert.deepEqual(recovered.unknown, finalDraft.unknown);
  assert.equal(recovered.saved, 'saved document'); assert.equal(recovered.fileBindingId, saved.fileBindingId);
  assert.equal(store.getRestoredFileBinding('project')?.bindingId, saved.fileBindingId);
  assert.equal(notifications, 0, 'the unmounted component callback is released');
  const binding = store.getRestoredFileBinding('project')!;
  target.handle.createWritable = async () => {
    let pending = target.state.text;
    return { async write(text) { pending = text; }, async close() { target.state.text = pending; }, async abort() {} };
  };
  await writeFile(binding.handle, binding.snapshot, 'next save');
  assert.equal(target.state.text, 'next save', 'the next save does not falsely conflict with our completed save');
});

test('late saves merge into the new instance without losing newer input and stale writers cannot roll metadata back', async () => {
  const { adapter } = memory(), store = createWorkspaceStore(adapter), target = file(), { metadata, draft } = draftFixture();
  const first = store.openDraftSession('project', metadata);
  await first.persistDraft(draft);
  const saving = first.beginSave();
  await first.dispose(draft);
  const notices: SavedFileState[] = [];
  const reopened = store.openDraftSession('project', metadata, value => notices.push(value));
  const newer = { ...draft, canvas: { ...draft.canvas, unknown: 'new document edit' }, form: { year: '202xy' }, selection: null };
  await reopened.persistDraft(newer);
  const saved = await saving.complete({ handle: target.handle, snapshot: 'saved older graph' });
  assert.ok(saved); assert.equal(notices.length, 1); assert.equal(notices[0].fileBindingId, saved.fileBindingId);
  await first.persistDraft({ ...draft, form: { year: 'obsolete unmount flush' } });
  await reopened.persistDraft({ ...newer, form: { year: 'newest input' } }); // Its React file state may still be the old generation.
  const recovered = store.getRestoredDraft('project') as typeof newer;
  assert.equal(recovered.canvas.unknown, 'new document edit'); assert.deepEqual(recovered.form, { year: 'newest input' });
  assert.equal(recovered.selection, null); assert.equal(recovered.saved, saved.saved); assert.equal(recovered.fileBindingId, saved.fileBindingId);
  assert.equal((await saving.complete({ handle: target.handle, snapshot: 'duplicate callback' }))?.fileBindingId, saved.fileBindingId);
});

test('a save cannot update an instance that has switched to another file or resurrect a closed tab', async () => {
  for (const remount of [false, true]) {
    const { adapter } = memory(), store = createWorkspaceStore(adapter), target = file(), { metadata, draft } = draftFixture();
    let notifications = 0;
    const first = store.openDraftSession('project', metadata, () => { notifications++; });
    await first.persistDraft(draft);
    const saving = first.beginSave();
    if (remount) await first.dispose(draft);
    const active = remount ? store.openDraftSession('project', metadata, () => { notifications++; }) : first;
    const other = { saved: 'other original', fileName: 'other.canvas', fileBindingId: 'other-binding' };
    active.setFileState(other);
    const next = { ...draft, ...other, form: { year: 'new file input' } };
    await active.persistDraft(next);
    assert.equal(await saving.complete({ handle: target.handle, snapshot: 'old saved text' }), null);
    assert.deepEqual(store.getRestoredDraft('project'), next); assert.equal(notifications, 0);
    assert.equal(store.getRestoredFileBinding('project'), null);

    const nextSave = active.beginSave();
    await store.deleteDraft('project');
    await active.dispose(next);
    assert.equal(await nextSave.complete({ handle: target.handle, snapshot: 'late closed-tab save' }), null);
    assert.equal(store.getRestoredDraft('project'), undefined); assert.equal(store.getRestoredFileBinding('project'), null);
  }
});

test('a new instance catches up if a save completes between reading its initial draft and mounting', async () => {
  const { adapter } = memory(), store = createWorkspaceStore(adapter), target = file(), { metadata, draft } = draftFixture();
  const first = store.openDraftSession('project', metadata);
  await first.persistDraft(draft);
  const saving = first.beginSave();
  await first.dispose(draft);
  const staleInitial = store.getRestoredDraft('project') as typeof draft;
  const saved = await saving.complete({ handle: target.handle, snapshot: 'completed before mount' });
  assert.ok(saved);
  const notices: SavedFileState[] = [];
  const reopened = store.openDraftSession('project', staleInitial, value => notices.push(value));
  await Promise.resolve();
  assert.equal(notices.length, 1); assert.equal(notices[0].saved, saved.saved);
  await reopened.persistDraft(staleInitial);
  assert.equal((store.getRestoredDraft('project') as typeof draft).fileBindingId, saved.fileBindingId);
});

test('queued save catch-up cannot reconnect a different file opened before its notification', async () => {
  const { adapter } = memory(), store = createWorkspaceStore(adapter), target = file(), { metadata, draft } = draftFixture();
  const first = store.openDraftSession('project', metadata);
  await first.persistDraft(draft);
  const saving = first.beginSave();
  await first.dispose(draft);
  const saved = await saving.complete({ handle: target.handle, snapshot: 'saved before remount' });
  assert.ok(saved);
  const notices: SavedFileState[] = [];
  const reopened = store.openDraftSession('project', metadata, value => notices.push(value));
  const other = { saved: 'other document', fileName: 'other.canvas', fileBindingId: 'other-generation' };
  reopened.setFileState(other);
  await reopened.persistDraft({ ...draft, ...other });
  await Promise.resolve();
  assert.deepEqual(notices, [], 'the queued old-file notification must be cancelled with its checkpoint');
  assert.equal((store.getRestoredDraft('project') as typeof draft).fileBindingId, other.fileBindingId);
});

test('successive saves keep only current metadata even when the current writer still holds an old React snapshot', async () => {
  const { adapter } = memory(), store = createWorkspaceStore(adapter), target = file(), { metadata, draft } = draftFixture();
  const session = store.openDraftSession('project', metadata);
  await session.persistDraft(draft);
  const first = await session.beginSave().complete({ handle: target.handle, snapshot: 'first save' });
  assert.ok(first);
  await session.persistDraft(draft);
  const second = await session.beginSave().complete({ handle: target.handle, snapshot: 'second save' });
  assert.ok(second); assert.notEqual(first.fileBindingId, second.fileBindingId);
  await session.dispose(draft);
  const recovered = store.getRestoredDraft('project') as typeof draft;
  assert.equal(recovered.saved, 'second save'); assert.equal(recovered.fileBindingId, second.fileBindingId);
  assert.equal(store.getRestoredFileBinding('project')?.snapshot, 'second save');
});

test('successful file saves update the active baseline even when workspace persistence fails', async () => {
  for (const unreadable of [false, true]) {
    const { adapter, records } = memory(), store = createWorkspaceStore(adapter), target = file(), { metadata, draft } = draftFixture();
    const notices: SavedFileState[] = [];
    const session = store.openDraftSession('project', metadata, value => notices.push(value));
    await session.persistDraft(draft);
    const before = records.get('draft:project'), saving = session.beginSave();
    if (unreadable) {
      adapter.get = async () => { throw new Error('read denied'); };
      await assert.rejects(store.hydrateWorkspace('project'), /read denied/);
    } else adapter.set = async () => { throw new Error('quota exceeded'); };
    await assert.rejects(saving.complete({ handle: target.handle, snapshot: 'saved despite recovery failure' }));
    assert.equal(notices.length, 1); assert.equal(notices[0].saved, 'saved despite recovery failure');
    assert.equal(notices[0].binding.snapshot, notices[0].saved);
    assert.equal(records.get('draft:project'), before, 'failed recovery writes do not replace the durable rescue record');
    assert.deepEqual((store.getRestoredDraft('project') as typeof draft).canvas, draft.canvas);
    if (unreadable) assert.deepEqual(store.getRestoredDraft('project'), draft, 'paused recovery preserves its old cached record too');
  }
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
