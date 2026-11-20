import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ResourceSession } from '../../web/src/resource-session.ts';
import type { HostResources, ResourceSnapshot } from '../../web/src/resource-session.ts';
import { createCanvas, serializeCanvas } from '../../web/src/canvas.ts';
import { createRefreshController } from '../../web/src/local-bridge/refresh-controller.ts';
import type { RefreshCallbacks } from '../../web/src/local-bridge/refresh-controller.ts';

const uri = 'resource://local/controller-test';
type ReadResult = Awaited<ReturnType<HostResources['read']>>;

function fixture() {
  let document = createCanvas();
  let etag = 'v1';
  let blocked = false;
  let reads = 0;
  const waiting: Array<{ accept: () => void; reject: (error: Error) => void }> = [];
  let snapshot: ResourceSnapshot | undefined;
  const resources: HostResources = {
    read() {
      reads += 1;
      const value: ReadResult = { contents: [{ uri, text: serializeCanvas(document), openaiMetadata: { etag, writable: true } }] };
      if (!blocked) return Promise.resolve(value);
      return new Promise((resolve, reject) => { waiting.push({ accept: () => resolve(value), reject }); });
    },
    async write() { throw new Error('The controller must not write documents.'); },
  };
  const session = new ResourceSession(resources, uri, value => { snapshot = value; });
  return {
    session, waiting,
    snapshot: () => snapshot!,
    reads: () => reads,
    block: () => { blocked = true; },
    external: () => { document = { ...createCanvas(), external: true }; etag = 'v2'; },
  };
}

function events() {
  const values: string[] = [];
  const callbacks: RefreshCallbacks = {
    onStart: discard => { values.push(`start:${discard}`); },
    onSuccess: discard => { values.push(`success:${discard}`); },
    onError: (error, discard) => { values.push(`error:${discard}:${String(error)}`); },
  };
  return { values, callbacks };
}

test('focus reads and repeated explicit reloads share the confirmed read instead of canceling it', async () => {
  const f = fixture(); await f.session.refresh();
  f.session.setDirty(true); f.external(); f.block();
  const log = events(); const controller = createRefreshController(f.session, log.callbacks);
  const reload = controller.refresh(true);
  assert.equal(controller.refresh(), reload);
  assert.equal(controller.refresh(true), reload);
  assert.equal(f.reads(), 2, 'one initial read and one explicit reload');
  f.waiting[0].accept(); await reload;
  assert.equal(f.snapshot().document.external, true);
  assert.equal(f.snapshot().dirty, false);
  assert.deepEqual(log.values, ['start:true', 'success:true']);
});

test('a confirmed reload replaces an older background read and only reports its own result', async () => {
  const f = fixture(); await f.session.refresh(); f.block();
  const log = events(); const controller = createRefreshController(f.session, log.callbacks);
  const background = controller.refresh();
  assert.equal(controller.refresh(), background, 'duplicate focus reads share one request');
  f.session.setDirty(true); f.external();
  const reload = controller.refresh(true);
  assert.notEqual(reload, background);
  assert.equal(controller.refresh(), reload);
  f.waiting[1].accept(); await reload;
  const revision = f.snapshot().revision;
  f.waiting[0].accept(); await background;
  assert.equal(f.snapshot().document.external, true);
  assert.equal(f.snapshot().revision, revision);
  assert.deepEqual(log.values, ['start:false', 'start:true', 'success:true']);
});

test('an obsolete failed read cannot clear the newer request error', async () => {
  const f = fixture(); await f.session.refresh(); f.block();
  const log = events(); const controller = createRefreshController(f.session, log.callbacks);
  const background = controller.refresh();
  const reload = controller.refresh(true);
  f.waiting[1].reject(new Error('latest failed'));
  await assert.rejects(reload, /latest failed/, 'the caller still receives the active failure');
  f.waiting[0].reject(new Error('obsolete failed'));
  await background; // ResourceSession intentionally ignores obsolete transport failures.
  assert.deepEqual(log.values, ['start:false', 'start:true', 'error:true:Error: latest failed']);
});

test('an initial failure can be retried and callbacks clear loading and stale errors', async () => {
  const f = fixture(); f.block();
  const state = { loading: false, error: '' };
  const controller = createRefreshController(f.session, {
    onStart: () => { state.loading = true; state.error = ''; },
    onSuccess: () => { state.loading = false; state.error = ''; },
    onError: error => { state.loading = false; state.error = String(error); },
  });
  const first = controller.refresh();
  f.waiting[0].reject(new Error('temporarily unavailable'));
  await assert.rejects(first, /temporarily unavailable/);
  assert.equal(state.loading, false);
  assert.match(state.error, /temporarily unavailable/);
  const retry = controller.refresh();
  assert.deepEqual(state, { loading: true, error: '' });
  f.waiting[1].accept(); await retry;
  assert.deepEqual(state, { loading: false, error: '' });
  assert.ok(f.snapshot());
});

test('discard reload still preserves input typed while the shared read is pending', async () => {
  const f = fixture(); await f.session.refresh();
  f.session.setDirty(true); f.external(); f.block();
  const revision = f.snapshot().revision;
  const controller = createRefreshController(f.session);
  const reload = controller.refresh(true);
  f.session.noteLocalInput({ year: '202x' });
  assert.equal(controller.refresh(), reload);
  f.waiting[0].accept(); await reload;
  assert.equal(f.snapshot().revision, revision);
  assert.equal(f.snapshot().dirty, true);
  assert.equal(f.snapshot().document.external, undefined);
  assert.match(f.snapshot().notice, /新的修改.*已保留/);
});

test('disposal suppresses late callbacks and starts no further reads', async () => {
  for (const fail of [false, true]) {
    const f = fixture(); f.block();
    const log = events(); const controller = createRefreshController(f.session, log.callbacks);
    const read = controller.refresh();
    controller.dispose();
    if (fail) {
      f.waiting[0].reject(new Error('closed view'));
      await assert.rejects(read, /closed view/);
    } else { f.waiting[0].accept(); await read; }
    await controller.refresh(true);
    assert.equal(f.reads(), 1);
    assert.deepEqual(log.values, ['start:false']);
  }
});
