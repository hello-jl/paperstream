import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, realpath, rename, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { PythonCanvasStore } from '../src/python-bridge.ts';
import { UI_URI, parseArguments } from '../src/server.ts';

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const python = process.env.PAPERSTREAM_TEST_PYTHON ?? 'python3';
const fixture = fileURLToPath(new URL('./backend-fixture.mjs', import.meta.url));
const worker = join(root, 'paperstream/mcp_bridge.py');
async function files(t) {
  const dir = await realpath(await mkdtemp(join(tmpdir(), 'paperstream-mcp-')));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const path = join(dir, 'selected.canvas');
  const result = spawnSync(python, ['-c', `
import json, sys
from paperstream import CanvasGraph
graph = CanvasGraph.create(sys.argv[1])
graph.add_node('First', 'Original', node_id='first', year=2020)
graph.add_node('Second', 'Keep second', node_id='second')
graph.add_edge('first', 'second', '', edge_id='link')
data = graph.to_dict()
fields = json.loads(data['nodes'][0]['text'][8:-3])
fields['figure'] = {'src': 'data:image/png;base64,should-not-reach-model', 'width': 120}
fence = chr(96) * 3
data['nodes'][0]['text'] = fence + 'json\\n' + json.dumps(fields) + '\\n' + fence
data['nodes'][0]['unknown'] = {'keep': [1, True, None]}
data['nodes'][0]['paper'] = {'src': 'ordinary metadata', 'keep': True}
data['nodes'].append({'id': 'note', 'type': 'text', 'text': 'Ordinary note', 'x': 20, 'y': 400, 'width': 200, 'height': 120})
data['future'] = {'keep': 'document'}
graph.set_document(data)
graph.save()
`, path], { cwd: root, encoding: 'utf8', env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' } });
  assert.equal(result.status, 0, result.stderr);
  return { dir, path };
}
async function connect(t, path, args = []) {
  const transport = new StdioClientTransport({ command: process.execPath,
    args: ['--experimental-strip-types', fixture, '--file', path, '--python', python, ...args],
    cwd: root, env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' }, stderr: 'pipe' });
  let stderr = '';
  transport.stderr?.on('data', chunk => { stderr += chunk.toString(); });
  const client = new Client({ name: 'paperstream-backend-test', version: '1' }, { capabilities: {} });
  t.after(async () => { await client.close(); });
  try { await client.connect(transport); } catch (error) { assert.fail(`${error.message}\n${stderr}`); }
  return client;
}
async function call(client, name, args = {}) {
  return await client.callTool({ name, arguments: args });
}
async function identity(client) {
  const listed = await call(client, 'paperstream_list_canvases');
  assert.equal(listed.isError, undefined);
  assert.equal(listed.structuredContent.canvases.length, 1);
  return listed.structuredContent.canvases[0];
}

test('startup requires explicit files and parses repeatable selections', async () => {
  assert.deepEqual(parseArguments(['--file', '/a.canvas', '--file', '/b.canvas', '--read-only', '--python', 'python3']),
    { files: ['/a.canvas', '/b.canvas'], readOnly: true, python: 'python3' });
  assert.throws(() => parseArguments(['--directory', '/']), /Usage/);
  await assert.rejects(PythonCanvasStore.create({ files: [], workerPath: worker }), /No Canvas files are authorized/);
  const result = spawnSync(process.execPath, ['--experimental-strip-types', fixture], { encoding: 'utf8', cwd: root });
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /No Canvas files are authorized/);
});

test('real stdio exposes standard UI metadata, resource CSP, and semantic tools', async t => {
  const { path } = await files(t);
  const client = await connect(t, path);
  const tools = (await client.listTools()).tools;
  assert.deepEqual(tools.map(tool => tool.name).sort(), ['paperstream_apply_changes', 'paperstream_list_canvases', 'paperstream_open_canvas',
    'paperstream_read_canvas', 'paperstream_read_graph', 'paperstream_write_canvas']);
  assert.deepEqual(tools.find(tool => tool.name === 'paperstream_read_canvas')._meta.ui.visibility, ['app']);
  assert.deepEqual(tools.find(tool => tool.name === 'paperstream_read_graph')._meta.ui.visibility, ['model']);
  assert.equal(tools.find(tool => tool.name === 'paperstream_open_canvas')._meta.ui.resourceUri, UI_URI);
  assert.ok(!JSON.stringify(tools).includes('openai/resource'));
  const resource = (await client.readResource({ uri: UI_URI })).contents[0];
  assert.equal(resource.mimeType, 'text/html;profile=mcp-app');
  assert.deepEqual(resource._meta.ui.csp, { connectDomains: [], resourceDomains: [], frameDomains: [] });
  const { fileId } = await identity(client);
  const opened = (await call(client, 'paperstream_open_canvas', { fileId })).structuredContent;
  assert.equal(opened.fileId, fileId);
  assert.equal(opened.name, 'selected.canvas');
  assert.equal(opened.writable, true);
  assert.match(opened.revision, /^[a-f0-9]{64}$/);
  assert.ok(!('text' in opened));
});

test('graph reading omits image sources and targeted batch preserves unknown fields', async t => {
  const { path } = await files(t);
  const client = await connect(t, path);
  const { fileId } = await identity(client);
  const graph = (await call(client, 'paperstream_read_graph', { fileId })).structuredContent;
  assert.equal(graph.graph.nodes[2].text, 'Ordinary note');
  assert.equal(graph.graph.nodes[2].y, 400);
  assert.equal(JSON.parse(graph.graph.nodes[0].text.slice(8, -3)).figure.src, '[image source omitted]');
  assert.deepEqual(graph.graph.nodes[0].paper, { src: 'ordinary metadata', keep: true });
  assert.ok(!JSON.stringify(graph).includes('should-not-reach-model'));
  const before = JSON.parse(await readFile(path, 'utf8'));
  const updated = await call(client, 'paperstream_apply_changes', { fileId, expectedRevision: graph.revision, changes: [
    { op: 'update_node', node_id: 'first', alias: 'Literal $(echo no) `ticks`' },
    { op: 'update_edge', edge_id: 'link', relation: 'Connects' },
    { op: 'move_node', node_id: 'note', x: 200, y: 300 },
  ] });
  assert.equal(updated.isError, undefined);
  assert.equal(updated.structuredContent.outcome, 'saved');
  const after = JSON.parse(await readFile(path, 'utf8'));
  assert.equal(after.nodes[1].text, before.nodes[1].text);
  assert.deepEqual(after.nodes[0].unknown, before.nodes[0].unknown);
  assert.deepEqual(after.future, before.future);
  assert.equal(JSON.parse(after.nodes[0].text.slice(8, -3)).figure.src, 'data:image/png;base64,should-not-reach-model');
  assert.deepEqual(after.nodes.map(row => row.id), before.nodes.map(row => row.id));
});

test('model conflicts are errors, editor conflicts preserve draft, and neither silently retries', async t => {
  const { path } = await files(t);
  const client = await connect(t, path);
  const { fileId } = await identity(client);
  const original = (await call(client, 'paperstream_read_canvas', { fileId })).structuredContent;
  const first = await call(client, 'paperstream_apply_changes', { fileId, expectedRevision: original.revision,
    changes: [{ op: 'update_node', node_id: 'second', alias: 'External change' }] });
  const saved = await readFile(path, 'utf8');
  for (let index = 0; index < 2; index++) {
    const stale = await call(client, 'paperstream_apply_changes', { fileId, expectedRevision: original.revision,
      changes: [{ op: 'update_node', node_id: 'first', alias: 'Stale' }] });
    assert.equal(stale.isError, true);
    assert.equal(stale.structuredContent.code, 'conflict');
    assert.equal(stale.structuredContent.revision, first.structuredContent.revision);
    const editor = await call(client, 'paperstream_write_canvas', { fileId, expectedRevision: original.revision, text: original.text });
    assert.equal(editor.isError, undefined);
    assert.equal(editor.structuredContent.fileId, fileId);
    assert.equal(editor.structuredContent.outcome, 'conflict');
    assert.equal(await readFile(path, 'utf8'), saved);
  }
});

test('batch failure leaves original bytes intact and UI saves validated full JSON', async t => {
  const { path } = await files(t);
  const client = await connect(t, path);
  const { fileId } = await identity(client);
  const original = (await call(client, 'paperstream_read_canvas', { fileId })).structuredContent;
  const before = await readFile(path, 'utf8');
  const failed = await call(client, 'paperstream_apply_changes', { fileId, expectedRevision: original.revision, changes: [
    { op: 'update_node', node_id: 'first', alias: 'Must not save' },
    { op: 'add_edge', source: 'first', target: 'missing', relation: '' },
  ] });
  assert.equal(failed.isError, true);
  assert.equal(await readFile(path, 'utf8'), before);
  const draft = JSON.parse(original.text);
  draft.nodes[2].text = 'Saved editor note';
  const save = await call(client, 'paperstream_write_canvas', { fileId, expectedRevision: original.revision, text: JSON.stringify(draft) });
  assert.equal(save.structuredContent.outcome, 'saved');
  assert.equal(save.structuredContent.fileId, fileId);
  assert.equal(JSON.parse(await readFile(path, 'utf8')).nodes[2].text, 'Saved editor note');
});

test('read-only mode rejects model and editor writes', async t => {
  const { path } = await files(t);
  const client = await connect(t, path, ['--read-only']);
  const { fileId, writable } = await identity(client);
  assert.equal(writable, false);
  const original = (await call(client, 'paperstream_read_canvas', { fileId })).structuredContent;
  for (const [name, args] of [
    ['paperstream_apply_changes', { changes: [{ op: 'update_node', node_id: 'first', alias: 'No' }] }],
    ['paperstream_write_canvas', { text: original.text }],
  ]) {
    const reply = await call(client, name, { fileId, expectedRevision: original.revision, ...args });
    assert.equal(reply.isError, true);
    assert.equal(reply.structuredContent.code, 'read_only');
  }
  assert.equal((await call(client, 'paperstream_read_canvas', { fileId })).structuredContent.revision, original.revision);
});

test('unknown IDs cannot select filesystem paths, IDs are stable, startup refuses symlinks', async t => {
  const { path, dir } = await files(t);
  const store = await PythonCanvasStore.create({ files: [path], python, workerPath: worker });
  const again = await PythonCanvasStore.create({ files: [path, path], python, workerPath: worker });
  assert.deepEqual(again.listCanvases(), store.listCanvases());
  assert.ok(!JSON.stringify(store.listCanvases()).includes(dir));
  for (const fileId of ['../selected.canvas', path, '/etc/passwd']) {
    await assert.rejects(store.readCanvas(fileId), error => error.code === 'unknown_file');
  }
  const linked = join(dir, 'linked.canvas');
  await symlink(path, linked);
  await assert.rejects(PythonCanvasStore.create({ files: [linked], python, workerPath: worker }), error => error.code === 'unsafe_path');
});

test('a symlink replacing an authorized file is refused during an actual stdio call', async t => {
  const { path, dir } = await files(t);
  const client = await connect(t, path);
  const { fileId } = await identity(client);
  const moved = join(dir, 'moved.canvas');
  const original = await readFile(path, 'utf8');
  await rename(path, moved);
  await symlink(moved, path);
  const refused = await call(client, 'paperstream_read_canvas', { fileId });
  assert.equal(refused.isError, true);
  assert.equal(refused.structuredContent.code, 'unsafe_path');
  assert.equal(await readFile(moved, 'utf8'), original);
});
