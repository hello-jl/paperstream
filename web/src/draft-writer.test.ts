import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createDraftWriter } from './draft-writer.ts';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

test('rapid typing creates only the final snapshot when the debounce expires', async () => {
  const saved = deferred(), writes: number[] = [];
  let reads = 0;
  const writer = createDraftWriter<number>(async value => { writes.push(value); saved.resolve(); }, { delayMs: 5 });
  for (let value = 0; value < 20; value++) writer.schedule(() => { reads++; return value; });
  assert.equal(reads, 0, 'scheduling does not create or serialize snapshots');
  await saved.promise;
  await writer.flush();
  assert.equal(reads, 1);
  assert.deepEqual(writes, [19]);
  await writer.dispose();
});

test('flush immediately writes the latest snapshot without waiting for the timer', async () => {
  const writes: string[] = [];
  const writer = createDraftWriter<string>(async value => { writes.push(value); });
  let current = 'before';
  writer.schedule(() => current);
  current = 'latest';
  await writer.flush();
  assert.deepEqual(writes, ['latest']);
  await writer.flush();
  assert.equal(writes.length, 1);
});

test('an in-flight write drains only the newest queued value and concurrent flush waits for it', async () => {
  const firstStarted = deferred(), releaseFirst = deferred(), secondStarted = deferred(), releaseSecond = deferred();
  const writes: number[] = [];
  let queuedReads = 0;
  const writer = createDraftWriter<number>(async value => {
    writes.push(value);
    if (value === 1) { firstStarted.resolve(); await releaseFirst.promise; }
    else { secondStarted.resolve(); await releaseSecond.promise; }
  });
  writer.schedule(() => 1);
  const firstFlush = writer.flush();
  await firstStarted.promise;
  writer.schedule(() => { queuedReads++; return 2; });
  writer.schedule(() => { queuedReads++; return 3; });
  let finished = false;
  const latestFlush = writer.flush().then(() => { finished = true; });
  releaseFirst.resolve();
  await secondStarted.promise;
  assert.equal(finished, false);
  assert.equal(queuedReads, 1);
  releaseSecond.resolve();
  await Promise.all([firstFlush, latestFlush]);
  assert.deepEqual(writes, [1, 3]);
});

test('unmount disposal flushes pending input and ignores later scheduling', async () => {
  const writes: string[] = [];
  const writer = createDraftWriter<string>(async value => { writes.push(value); });
  writer.schedule(() => 'last keystroke');
  await writer.dispose({ flush: true });
  writer.schedule(() => 'late callback');
  await writer.flush();
  assert.deepEqual(writes, ['last keystroke']);
});

test('failed persistence remains retryable and does not replace a newer pending edit', async () => {
  const started = deferred(), release = deferred();
  const writes: string[] = [];
  let fail = true;
  const writer = createDraftWriter<string>(async value => {
    writes.push(value);
    if (fail) { started.resolve(); await release.promise; throw new Error('quota exceeded'); }
  });
  writer.schedule(() => 'older');
  const failed = assert.rejects(writer.flush(), /quota exceeded/);
  await started.promise;
  writer.schedule(() => 'newest');
  release.resolve();
  await failed;
  fail = false;
  await writer.flush();
  assert.deepEqual(writes, ['older', 'newest']);
});

test('a failed snapshot can be retried and background failures are reported', async () => {
  const reported = deferred(), errors: unknown[] = [], writes: number[] = [];
  let fail = true;
  const writer = createDraftWriter<number>(async value => { writes.push(value); }, {
    delayMs: 5,
    onError: error => { errors.push(error); reported.resolve(); },
  });
  writer.schedule(() => { if (fail) throw new Error('snapshot unavailable'); return 7; });
  await reported.promise;
  assert.match(String(errors[0]), /snapshot unavailable/);
  assert.deepEqual(writes, []);
  fail = false;
  await writer.flush();
  assert.deepEqual(writes, [7]);
});

test('discarding pending work does not resurrect it when an older in-flight write fails', async () => {
  const started = deferred(), release = deferred();
  const writes: number[] = [];
  const writer = createDraftWriter<number>(async value => {
    writes.push(value); started.resolve(); await release.promise; throw new Error('write failed');
  });
  writer.schedule(() => 1);
  const failed = assert.rejects(writer.flush(), /write failed/);
  await started.promise;
  writer.schedule(() => 2);
  const disposed = assert.rejects(writer.dispose(), /write failed/);
  release.resolve();
  await Promise.all([failed, disposed]);
  await writer.flush();
  assert.deepEqual(writes, [1]);
});
