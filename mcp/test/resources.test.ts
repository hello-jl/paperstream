import assert from 'node:assert/strict';
import test from 'node:test';
import { canvasUri, createMcpResources, fileFromToolInput, fileFromToolResult, listCanvases } from '../src/resources.ts';
import type { CallServerTool } from '../src/resources.ts';
import { ResourceSession } from '../../codex/src/resource-session.ts';
import type { ResourceSnapshot } from '../../codex/src/resource-session.ts';
import { createCanvas, serializeCanvas } from '../../web/src/canvas.ts';

const fileId = 'opaque-id:with / spaces';
const uri = canvasUri(fileId);
const document = { ...createCanvas(), unknown: { preserved: [1, 'two'] } };
const text = serializeCanvas(document);
const read = () => ({ fileId, name: 'history.canvas', text, revision: 'W/"opaque revision 17"', writable: true });
const ok = (structuredContent: unknown) => ({ content: [], structuredContent });

function fixture() {
  let data: Record<string, unknown> = read();
  let saveResult: unknown = ok({ fileId, outcome: 'saved', revision: 'next opaque token' });
  const calls: Parameters<CallServerTool>[0][] = [];
  const call: CallServerTool = async params => {
    calls.push(params);
    if (params.name === 'paperstream_read_canvas') return ok(data);
    if (params.name === 'paperstream_write_canvas') return saveResult;
    throw new Error(`Unexpected tool: ${params.name}`);
  };
  const resources = createMcpResources(call, fileId);
  return { resources, calls, setRead: (next: typeof data) => { data = next; }, setWrite: (next: unknown) => { saveResult = next; } };
}

test('standard tools carry opaque IDs and revisions without path or hash interpretation', async () => {
  const f = fixture();
  const content = await f.resources.read({ uri, representation: 'text' });
  assert.deepEqual(content.contents[0], { uri, text, openaiMetadata: { etag: 'W/"opaque revision 17"', writable: true } });
  const saved = await f.resources.write(uri, { text, ifMatch: 'W/"opaque revision 17"' });
  assert.deepEqual(saved, { outcome: 'saved', etag: 'next opaque token' });
  assert.deepEqual(f.calls, [
    { name: 'paperstream_read_canvas', arguments: { fileId } },
    { name: 'paperstream_write_canvas', arguments: { fileId, expectedRevision: 'W/"opaque revision 17"', text } },
  ]);
});

test('failed tools report structured errors and never accept error content as a document', async () => {
  const call: CallServerTool = async () => ({ isError: true, structuredContent: { message: 'Permission denied' } });
  const resources = createMcpResources(call, fileId);
  await assert.rejects(resources.read({ uri, representation: 'text' }), /Permission denied/);
  const f = fixture();
  await f.resources.read({ uri, representation: 'text' });
  f.setWrite({ isError: true, structuredContent: { message: 'Locked by another writer' } });
  await assert.rejects(f.resources.write(uri, { text, ifMatch: 'old' }), /Locked by another writer/);
});

test('missing or invalid read permissions, revision, identity and text revoke safe writes', async () => {
  for (const change of [
    { revision: undefined }, { revision: '' }, { revision: 17 },
    { writable: undefined }, { writable: 'true' }, { fileId: 'other' },
    { fileId: undefined }, { name: '' }, { text: undefined }, { text: '{ broken' },
  ]) {
    const f = fixture();
    await f.resources.read({ uri, representation: 'text' });
    f.setRead({ ...read(), ...change });
    await assert.rejects(f.resources.read({ uri, representation: 'text' }));
    await assert.rejects(f.resources.write(uri, { text, ifMatch: 'old' }), /写入权限或版本/);
    assert.equal(f.calls.filter(row => row.name === 'paperstream_write_canvas').length, 0);
  }
});

test('read-only documents load while writes and unrecognized resource URIs are refused', async () => {
  const f = fixture();
  f.setRead({ ...read(), writable: false });
  assert.equal((await f.resources.read({ uri, representation: 'text' })).contents[0].openaiMetadata?.writable, false);
  await assert.rejects(f.resources.write(uri, { text, ifMatch: 'old' }));
  await assert.rejects(f.resources.read({ uri: 'file:///tmp/another.canvas', representation: 'text' }), /已打开/);
  await assert.rejects(f.resources.write('resource://another', { text, ifMatch: 'old' }), /已打开/);
});

test('incomplete or mismatched save results never acknowledge success', async () => {
  for (const change of [{ fileId: undefined }, { fileId: 'other' }, { revision: undefined }, { revision: '' }, { outcome: 'okay' }]) {
    const f = fixture();
    await f.resources.read({ uri, representation: 'text' });
    f.setWrite(ok({ fileId, outcome: 'saved', revision: 'new', ...change }));
    await assert.rejects(f.resources.write(uri, { text, ifMatch: 'old' }));
  }
});

test('repeated conflicts preserve the initial revision and local draft through ResourceSession', async () => {
  const f = fixture();
  let snapshot!: ResourceSnapshot;
  const session = new ResourceSession(f.resources, uri, value => { snapshot = value; });
  await session.refresh();
  session.setDirty(true);
  session.noteLocalInput({ year: '202x' });
  f.setWrite(ok({ fileId, outcome: 'conflict', revision: 'other writer version' }));
  await assert.rejects(session.save({ ...document, edited: true }), /冲突/);
  await assert.rejects(session.save({ ...document, edited: true }), /冲突/);
  assert.equal(snapshot.dirty, true);
  assert.equal(snapshot.externalChange, true);
  assert.deepEqual(f.calls.filter(row => row.name === 'paperstream_write_canvas').map(row => row.arguments.expectedRevision),
    ['W/"opaque revision 17"', 'W/"opaque revision 17"']);
  f.setRead({ ...read(), text: serializeCanvas({ ...document, external: true }), revision: 'other writer version' });
  await session.refresh();
  assert.equal(snapshot.document.external, undefined);
  assert.equal(snapshot.dirty, true);
  await session.refresh(true);
  assert.equal(snapshot.document.external, true);
  assert.equal(snapshot.dirty, false);
});

test('list and host tool notifications use only structured file IDs', async () => {
  const files = await listCanvases(async params => {
    assert.deepEqual(params, { name: 'paperstream_list_canvases', arguments: {} });
    return ok({ canvases: [{ fileId, name: 'history.canvas', writable: true }] });
  });
  assert.deepEqual(files, [{ fileId, name: 'history.canvas', writable: true }]);
  for (const invalid of [
    {}, { canvases: [{}] }, { canvases: [{ fileId, name: 'a.canvas' }] },
    { canvases: [{ fileId, name: 'a.canvas', writable: true }, { fileId, name: 'b.canvas', writable: true }] },
  ]) await assert.rejects(listCanvases(async () => ok(invalid)));
  assert.deepEqual(fileFromToolInput({ fileId }), { fileId, name: 'Canvas' });
  assert.deepEqual(fileFromToolResult(ok({ fileId, name: 'history.canvas' })), { fileId, name: 'history.canvas' });
  assert.equal(fileFromToolInput({ path: '/etc/passwd' }), undefined);
  assert.equal(fileFromToolResult({ content: [{ type: 'text', text: JSON.stringify({ fileId }) }] }), undefined);
  assert.equal(fileFromToolResult({ isError: true, structuredContent: { fileId } }), undefined);
});
