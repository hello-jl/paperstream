import assert from 'node:assert/strict';
import test from 'node:test';
import { ResourceSession } from '../src/resource-session.ts';
import type { HostResources, ResourceSnapshot } from '../src/resource-session.ts';
import { createCanvas, serializeCanvas } from '../../web/src/canvas.ts';

const uri = 'resource://opaque/canvas?token=not-a-path';
function fixture(options: { writable?: boolean; etag?: string; omitMetadata?: boolean } = {}) {
  const initial = { ...createCanvas(), custom: { preserve: ['x', 2] } };
  let text = serializeCanvas(initial);
  let etag = options.etag ?? 'v1';
  const writes: Array<{ uri: string; text: string; ifMatch: string }> = [];
  const snapshots: ResourceSnapshot[] = [];
  let outcome: 'saved' | 'conflict' | 'too-large' | 'error' = 'saved';
  const resources: HostResources = {
    async read(params) {
      assert.deepEqual(params, { uri, representation: 'text' });
      return { contents: [{ uri, text, ...(!options.omitMetadata ? { openaiMetadata: { etag, writable: options.writable ?? true } } : {}) }] };
    },
    async write(target, value) {
      writes.push({ uri: target, ...value });
      if (outcome === 'error') throw new Error('transport failed');
      if (outcome === 'too-large') return { outcome, maxBytes: 64 };
      if (outcome === 'conflict' || value.ifMatch !== etag) return { outcome: 'conflict', etag };
      text = value.text;
      etag += '-saved';
      return { outcome: 'saved', etag };
    },
  };
  const session = new ResourceSession(resources, uri, snapshot => snapshots.push(snapshot));
  return {
    session, resources, writes, initial,
    snapshot: () => snapshots.at(-1)!,
    external: (next: string) => { text = next; etag += '-external'; },
    outcome: (value: typeof outcome) => { outcome = value; },
  };
}

test('reads opaque resource, preserves unknown fields and saves with current etag', async () => {
  const f = fixture();
  await f.session.refresh();
  assert.deepEqual(f.snapshot().document, f.initial);
  assert.equal(f.snapshot().readOnly, false);
  f.session.setDirty(true);
  await f.session.save({ ...f.initial, custom: { preserve: ['x', 2], edited: true } });
  assert.equal(f.writes[0].uri, uri);
  assert.equal(f.writes[0].ifMatch, 'v1');
  assert.deepEqual(JSON.parse(f.writes[0].text).custom, { preserve: ['x', 2], edited: true });
  await f.session.save(f.initial);
  assert.equal(f.writes[1].ifMatch, 'v1-saved');
});

test('clean external changes reload, dirty changes preserve local revision until explicit discard', async () => {
  const f = fixture();
  await f.session.refresh();
  const before = f.snapshot().revision;
  f.external(serializeCanvas({ ...f.initial, external: 1 }));
  await f.session.refresh();
  assert.equal(f.snapshot().document.external, 1);
  assert.equal(f.snapshot().revision, before + 1);
  f.session.setDirty(true);
  f.external(serializeCanvas({ ...f.initial, external: 2 }));
  await f.session.refresh();
  assert.equal(f.snapshot().document.external, 1);
  assert.equal(f.snapshot().revision, before + 1);
  assert.equal(f.snapshot().externalChange, true);
  await assert.rejects(f.session.save(f.initial), /冲突/);
  await assert.rejects(f.session.save(f.initial), /冲突/);
  assert.equal(f.writes[0].ifMatch, f.writes[1].ifMatch);
  await f.session.refresh(true);
  assert.equal(f.snapshot().document.external, 2);
  assert.equal(f.snapshot().dirty, false);
});

test('read-only, absent metadata and missing etag never write', async () => {
  for (const options of [{ writable: false }, { omitMetadata: true }, { etag: '' }]) {
    const f = fixture(options);
    await f.session.refresh();
    assert.equal(f.snapshot().readOnly, true);
    await assert.rejects(f.session.save(f.initial), /不可安全写入/);
    assert.equal(f.writes.length, 0);
  }
});

test('failed and too-large writes keep original baseline and dirty state', async () => {
  for (const outcome of ['error', 'too-large'] as const) {
    const f = fixture();
    await f.session.refresh();
    f.session.setDirty(true);
    f.outcome(outcome);
    await assert.rejects(f.session.save(f.initial));
    assert.equal(f.snapshot().dirty, true);
    f.outcome('saved');
    await f.session.save(f.initial);
    assert.equal(f.writes[1].ifMatch, 'v1');
  }
});

test('editing during an in-flight external read prevents replacing local graph', async () => {
  const f = fixture();
  await f.session.refresh();
  const original = f.resources.read;
  let resolve!: (value: Awaited<ReturnType<HostResources['read']>>) => void;
  f.resources.read = () => new Promise(done => { resolve = done; });
  const refresh = f.session.refresh();
  f.session.setDirty(true);
  f.external(serializeCanvas({ ...f.initial, external: true }));
  resolve(await original({ uri, representation: 'text' }));
  await refresh;
  assert.equal(f.snapshot().document.external, undefined);
  assert.equal(f.snapshot().externalChange, true);
});

test('invalid external document leaves the loaded version intact', async () => {
  const f = fixture();
  await f.session.refresh();
  f.external('{ invalid');
  await assert.rejects(f.session.refresh());
  assert.deepEqual(f.snapshot().document, f.initial);
});

test('discard reload is blocked while a write is in flight', async () => {
  const f = fixture();
  await f.session.refresh();
  f.session.setDirty(true);
  const original = f.resources.write;
  let release!: () => void;
  f.resources.write = async (...args) => {
    await new Promise<void>(done => { release = done; });
    return original(...args);
  };
  const save = f.session.save({ ...f.initial, local: 'saved' });
  assert.equal(f.snapshot().saving, true);
  await assert.rejects(f.session.refresh(true), /正在保存/);
  release();
  await save;
  assert.equal(f.snapshot().saving, false);
  assert.equal(f.snapshot().document.local, 'saved');
});

test('a read begun before save cannot restore its obsolete etag or document', async () => {
  const f = fixture();
  await f.session.refresh();
  const original = f.resources.read;
  const old = await original({ uri, representation: 'text' });
  let release!: (value: typeof old) => void;
  f.resources.read = () => new Promise(done => { release = done; });
  const reload = f.session.refresh(true);
  f.resources.read = original;
  f.session.setDirty(true);
  await f.session.save({ ...f.initial, local: 'saved' });
  f.session.setDirty(false);
  release(old);
  await reload;
  assert.equal(f.snapshot().document.local, 'saved');
  await f.session.save(f.initial);
  assert.equal(f.writes[1].ifMatch, 'v1-saved');
});

test('external change immediately after successful write is noticed and loaded after save acknowledgement', async () => {
  const f = fixture();
  await f.session.refresh();
  f.session.setDirty(true);
  const original = f.resources.write;
  f.resources.write = async (...args) => {
    const result = await original(...args);
    f.external(serializeCanvas({ ...f.initial, external: 'newer' }));
    await f.session.refresh(); // Host update notification while saving.
    return result;
  };
  await f.session.save({ ...f.initial, local: 'saved' });
  assert.equal(f.snapshot().externalChange, true);
  assert.equal(f.snapshot().document.local, 'saved');
  f.session.setDirty(false);
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(f.snapshot().document.external, 'newer');
  assert.equal(f.snapshot().externalChange, false);
});

test('discard reload cannot discard edits made after confirmation, even when already dirty', async () => {
  for (const initiallyDirty of [false, true]) {
    const f = fixture();
    await f.session.refresh();
    f.session.noteLocalDocument(f.initial); // Initial editor mount is not an edit.
    f.session.setDirty(initiallyDirty);
    if (initiallyDirty) f.session.noteLocalDocument({ ...f.initial, local: 'before confirmation' });
    const revision = f.snapshot().revision;
    const original = f.resources.read;
    f.external(serializeCanvas({ ...f.initial, external: 'newer' }));
    const incoming = await original({ uri, representation: 'text' });
    let resolve!: (value: typeof incoming) => void;
    f.resources.read = () => new Promise(done => { resolve = done; });
    const reload = f.session.refresh(true);
    f.session.setDirty(true);
    f.session.noteLocalDocument({ ...f.initial, local: 'typed while reading' });
    resolve(incoming);
    await reload;
    assert.equal(f.snapshot().revision, revision, 'do not remount the editor and erase new text');
    assert.equal(f.snapshot().dirty, true);
    assert.equal(f.snapshot().externalChange, true);
    assert.match(f.snapshot().notice, /新的修改.*已保留/);
    assert.equal(f.snapshot().document.external, undefined);
    // The etag still belongs to the version originally loaded, so saving the
    // retained local edit cannot overwrite the external revision either.
    await assert.rejects(f.session.save({ ...f.initial, local: 'typed while reading' }), /冲突/);
    assert.equal(f.writes[0].ifMatch, 'v1');
    f.resources.read = original;
    await f.session.refresh(true);
    assert.equal(f.snapshot().document.external, 'newer');
    assert.equal(f.snapshot().dirty, false);
  }
});

test('late failures of superseded or disposed reads cannot report errors for the active file', async () => {
  const f = fixture();
  await f.session.refresh();
  const original = f.resources.read;
  let reject!: (error: Error) => void;
  f.resources.read = () => new Promise((_resolve, fail) => { reject = fail; });
  const older = f.session.refresh();
  f.resources.read = original;
  f.external(serializeCanvas({ ...f.initial, external: 'current' }));
  await f.session.refresh();
  reject(new Error('old request failed'));
  await assert.doesNotReject(older);
  assert.equal(f.snapshot().document.external, 'current');

  f.resources.read = () => new Promise((_resolve, fail) => { reject = fail; });
  const closing = f.session.refresh();
  f.session.dispose();
  reject(new Error('closed file read failed'));
  await assert.doesNotReject(closing);

  // Current failures must still reach the caller instead of being suppressed.
  const current = fixture();
  current.resources.read = async () => { throw new Error('active file failed'); };
  await assert.rejects(current.session.refresh(), /active file failed/);
});

test('missing fresh version metadata revokes writes without adopting an external etag', async () => {
  for (const discardDuringEdit of [false, true]) {
    const f = fixture();
    await f.session.refresh();
    f.session.setDirty(true);
    f.session.noteLocalDocument({ ...f.initial, local: 'unsaved' });
    const revision = f.snapshot().revision;
    const original = f.resources.read;
    f.external(serializeCanvas({ ...f.initial, external: 'newer' }));
    const incoming = await original({ uri, representation: 'text' });
    incoming.contents[0].openaiMetadata = { writable: true }; // No fresh etag.
    let resolve!: (value: typeof incoming) => void;
    f.resources.read = () => new Promise(done => { resolve = done; });
    const refresh = f.session.refresh(discardDuringEdit);
    if (discardDuringEdit) f.session.noteLocalDocument({ ...f.initial, local: 'newer unsaved' });
    resolve(incoming);
    await refresh;
    assert.equal(f.snapshot().revision, revision);
    assert.equal(f.snapshot().dirty, true);
    assert.equal(f.snapshot().readOnly, true, 'an old baseline etag is not a current write grant');
    await assert.rejects(f.session.save({ ...f.initial, local: 'unsaved' }), /不可安全写入/);
    assert.equal(f.writes.length, 0);

    // A later read may restore safe-write evidence, but it must not authorize
    // overwriting the newer external document with a stale local graph.
    f.resources.read = original;
    await f.session.refresh();
    assert.equal(f.snapshot().readOnly, false);
    assert.equal(f.snapshot().dirty, true);
    await assert.rejects(f.session.save({ ...f.initial, local: 'unsaved' }), /冲突/);
    assert.equal(f.writes[0].ifMatch, 'v1', 'retain the original baseline token');
    await f.session.refresh(true);
    assert.equal(f.snapshot().dirty, false);
    await f.session.save(f.snapshot().document);
    assert.equal(f.writes[1].ifMatch, 'v1-external');
  }
});
