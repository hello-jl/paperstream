import assert from 'node:assert/strict';
import test from 'node:test';
import { ResourceSubscriptions } from '../src/resource-subscriptions.ts';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

test('reopening a resource waits for its old unsubscribe before subscribing again', async () => {
  const queue = new ResourceSubscriptions();
  const remote = new Set<string>();
  const calls: string[] = [];
  const oldUnsubscribe = deferred();
  const started = deferred();
  const host = {
    async subscribe({ uri }: { uri: string }) { calls.push(`subscribe:${uri}`); remote.add(uri); },
    async unsubscribe({ uri }: { uri: string }) {
      calls.push(`unsubscribe:${uri}`);
      if (uri === 'A') { started.resolve(); await oldUnsubscribe.promise; }
      remote.delete(uri);
    },
  };
  const first = queue.open(host, 'A');
  await first.ready;
  const closing = first.close();
  await started.promise;
  const between = queue.open(host, 'B');
  const betweenClosing = between.close(); // Closed before its queued subscribe starts.
  const reopened = queue.open(host, 'A');
  assert.deepEqual(calls, ['subscribe:A', 'unsubscribe:A']);
  oldUnsubscribe.resolve();
  await Promise.all([closing, between.ready, betweenClosing, reopened.ready]);
  assert.deepEqual(calls, ['subscribe:A', 'unsubscribe:A', 'subscribe:A']);
  assert.deepEqual([...remote], ['A'], 'the active resource still receives host updates');
  await reopened.close();
  assert.equal(remote.size, 0);
});

test('closing during subscription waits for its confirmation and disposes exactly once', async () => {
  const queue = new ResourceSubscriptions();
  const confirmation = deferred(), started = deferred();
  const calls: string[] = [];
  const host = {
    async subscribe() { calls.push('subscribe'); started.resolve(); await confirmation.promise; },
    async unsubscribe() { calls.push('unsubscribe'); },
  };
  const resource = queue.open(host, 'A');
  await started.promise;
  const closing = resource.close();
  assert.equal(resource.close(), closing);
  assert.deepEqual(calls, ['subscribe']);
  confirmation.resolve();
  await Promise.all([resource.ready, closing]);
  assert.deepEqual(calls, ['subscribe', 'unsubscribe']);
});

test('a failed host operation reaches its caller without poisoning later file subscriptions', async () => {
  const queue = new ResourceSubscriptions();
  const calls: string[] = [];
  const host = {
    async subscribe({ uri }: { uri: string }) {
      calls.push(`subscribe:${uri}`);
      if (uri === 'failed') throw new Error('subscribe failed');
    },
    async unsubscribe({ uri }: { uri: string }) {
      calls.push(`unsubscribe:${uri}`);
      if (uri === 'A') throw new Error('unsubscribe failed');
    },
  };
  const failed = queue.open(host, 'failed');
  await assert.rejects(failed.ready, /subscribe failed/);
  await failed.close();
  const first = queue.open(host, 'A');
  await first.ready;
  await assert.rejects(first.close(), /unsubscribe failed/);
  const next = queue.open(host, 'B');
  await next.ready;
  await next.close();
  assert.deepEqual(calls, ['subscribe:failed', 'subscribe:A', 'unsubscribe:A', 'subscribe:B', 'unsubscribe:B']);
});
