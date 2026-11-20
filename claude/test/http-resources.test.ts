import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHttpResources, LOCAL_RESOURCE_URI, localToken } from '../../web/src/local-bridge/http-resources.ts';
import { ResourceSession } from '../../web/src/resource-session.ts';
import { createCanvas, serializeCanvas } from '../../web/src/canvas.ts';

const text = serializeCanvas(createCanvas());
const document = { name: '论文.canvas', text, etag: '"version-1"', writable: true };
const response = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });

test('single-document reads and writes carry authorization and exact If-Match without exposing paths', async () => {
  const calls: Array<{ url: string; options?: RequestInit }> = [];
  const request = (async (url, options) => {
    calls.push({ url: String(url), options });
    return response({ ...document, etag: options?.method === 'PUT' ? '"version-2"' : document.etag });
  }) as typeof fetch;
  const adapter = createHttpResources('local-secret', request);
  const result = await adapter.resources.read({ uri: LOCAL_RESOURCE_URI, representation: 'text' });
  assert.equal(adapter.fileName(), '论文.canvas');
  assert.equal(result.contents[0].text, text);
  assert.deepEqual(result.contents[0].openaiMetadata, { etag: '"version-1"', writable: true });
  assert.deepEqual(await adapter.resources.write(LOCAL_RESOURCE_URI, { text, ifMatch: '"version-1"' }), { outcome: 'saved', etag: '"version-2"' });
  assert.ok(calls.every(call => call.url === '/api/canvas' && call.options?.redirect === 'error' && call.options.credentials === 'omit'));
  assert.equal(new Headers(calls[0].options?.headers).get('Authorization'), 'Bearer local-secret');
  assert.equal(new Headers(calls[1].options?.headers).get('If-Match'), '"version-1"');
  assert.equal(calls[1].options?.body, text);
  const before = calls.length;
  await assert.rejects(adapter.resources.read({ uri: 'file:///etc/passwd', representation: 'text' }), /只允许/);
  await assert.rejects(adapter.resources.write('resource://another-file', { text, ifMatch: 'anything' }), /只允许/);
  assert.equal(calls.length, before);
});

test('conflicts never adopt a newer version for another save attempt', async () => {
  const tokens: string[] = [];
  const adapter = createHttpResources('token', (async (_url, options) => {
    if (options?.method !== 'PUT') return response(document);
    tokens.push(new Headers(options.headers).get('If-Match')!);
    return response({ error: 'conflict', message: 'changed elsewhere', etag: '"external-version"' }, 409);
  }) as typeof fetch);
  const session = new ResourceSession(adapter.resources, LOCAL_RESOURCE_URI, () => {});
  await session.refresh(); session.setDirty(true);
  await assert.rejects(session.save(createCanvas()), /保存冲突/);
  await assert.rejects(session.save(createCanvas()), /保存冲突/);
  assert.deepEqual(tokens, ['"version-1"', '"version-1"']);
});

test('read-only, malformed metadata and transport failures cannot masquerade as safe writes', async () => {
  for (const value of [{ ...document, etag: '' }, { ...document, writable: undefined }, { ...document, text: undefined }]) {
    const adapter = createHttpResources('token', (async () => response(value)) as typeof fetch);
    await assert.rejects(adapter.resources.read({ uri: LOCAL_RESOURCE_URI, representation: 'text' }), /文件版本信息/);
  }
  const readOnly = createHttpResources('token', (async () => response({ ...document, writable: false })) as typeof fetch);
  const session = new ResourceSession(readOnly.resources, LOCAL_RESOURCE_URI, () => {});
  await session.refresh();
  await assert.rejects(session.save(createCanvas()), /不可安全写入/);
  const forbidden = createHttpResources('token', (async () => response({ message: 'Wrong local token' }, 403)) as typeof fetch);
  await assert.rejects(forbidden.resources.read({ uri: LOCAL_RESOURCE_URI, representation: 'text' }), /Wrong local token/);
  const oversized = createHttpResources('token', (async () => response({ maxBytes: 1024 }, 413)) as typeof fetch);
  assert.deepEqual(await oversized.resources.write(LOCAL_RESOURCE_URI, { text, ifMatch: '"v1"' }), { outcome: 'too-large', maxBytes: 1024 });
});

test('fragment credentials survive a tab reload without being required in request URLs', () => {
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
  assert.deepEqual(localToken('#token=abc-_123', storage), { token: 'abc-_123', clearFragment: true });
  assert.deepEqual(localToken('', storage), { token: 'abc-_123', clearFragment: false });
  assert.deepEqual(localToken('#token=fresh', { ...storage, setItem() { throw new Error('blocked'); } }), { token: 'fresh', clearFragment: false });
  assert.deepEqual(localToken('#token=fragment-only', undefined), { token: 'fragment-only', clearFragment: false });
  assert.throws(() => createHttpResources(''), /完整本机链接/);
});

test('Python number formatting does not turn a successful save into a false external update', async () => {
  let source = '{"nodes":[],"edges":[],"future":{"small":1e-07,"whole":1.0}}';
  let etag = '"original"';
  const snapshots = [];
  const adapter = createHttpResources('token', (async (_url, options) => {
    if (options?.method === 'PUT') {
      source = String(options.body).replace('1e-7', '1e-07'); etag = '"saved"';
    }
    return response({ ...document, text: source, etag });
  }) as typeof fetch);
  const session = new ResourceSession(adapter.resources, LOCAL_RESOURCE_URI, snapshot => snapshots.push(snapshot));
  await session.refresh();
  const first = snapshots.at(-1);
  session.setDirty(true);
  await session.save({ ...first.document, retained: 'edit' });
  session.setDirty(false);
  const last = snapshots.at(-1);
  assert.equal(last.revision, first.revision, 'no false remount after save acknowledgement');
  assert.equal(last.externalChange, false);
  assert.equal(last.notice, '');
  assert.equal(last.dirty, false);
});
