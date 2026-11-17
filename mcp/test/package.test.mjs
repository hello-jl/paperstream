import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, readdir, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const repository = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const packaged = join(repository, 'mcp/dist/package');
const python = process.env.PAPERSTREAM_TEST_PYTHON ?? 'python3';
const uiUri = 'ui://paperstream/standard-canvas-v1';

async function fileNames(directory) {
  const names = [];
  async function visit(path) {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      const child = join(path, entry.name);
      assert.equal(entry.isSymbolicLink(), false, `Distribution must not depend on symlinks: ${child}`);
      if (entry.isDirectory()) await visit(child);
      else { assert.equal(entry.isFile(), true); names.push(relative(directory, child)); }
    }
  }
  await visit(directory);
  return names.sort();
}

test('distribution includes byte-identical license and notice files', async () => {
  for (const name of ['LICENSE', 'THIRD_PARTY_NOTICES.md']) {
    assert.ok((await readFile(join(packaged, name))).equals(await readFile(join(repository, name))), `Distributed ${name} must match the source bytes.`);
  }
  const sources = await fileNames(join(repository, 'licenses'));
  assert.ok(sources.length > 0, 'Expected third-party license texts.');
  assert.deepEqual(await fileNames(join(packaged, 'licenses')), sources, 'All license files must be distributed.');
  for (const name of sources) {
    assert.ok((await readFile(join(packaged, 'licenses', name))).equals(await readFile(join(repository, 'licenses', name))), `Distributed license bytes differ: ${name}`);
  }
});

test('distributed editor is self-contained and has no OpenAI file-resource requirement', async () => {
  const html = await readFile(join(packaged, 'dist/app.html'), 'utf8');
  assert.match(html, /<!doctype html>/i);
  assert.match(html, /<div id="root"><\/div>/);
  assert.ok((html.match(/<script\b/gi) ?? []).length > 0, 'Expected the inline editor bundle.');
  assert.doesNotMatch(html, /<script\b[^>]*\bsrc\s*=/i, 'Scripts must be embedded in the distributed editor.');
  assert.doesNotMatch(html, /<link\b[^>]*\b(?:href|rel)\s*=/i, 'Styles must be embedded in the distributed editor.');
  assert.doesNotMatch(html, /openai\/resource|@openai\/mcp-extensions/, 'Standard MCP must not depend on OpenAI host file extensions.');
});

test('copied package runs real stdio without node_modules from an unrelated cwd and preserves complete Canvas data', { timeout: 60_000 }, async t => {
  const directory = await mkdtemp(join(await realpath(tmpdir()), 'paperstream portable package '));
  const relocated = join(directory, 'distribution with spaces');
  const working = join(directory, 'unrelated working directory');
  const canvas = join(directory, 'selected graph with spaces.canvas');
  let client;
  t.after(async () => {
    try { await client?.close(); }
    finally { await rm(directory, { recursive: true, force: true }); }
  });
  await cp(packaged, relocated, { recursive: true });
  await mkdir(working);
  assert.ok(!(await fileNames(relocated)).some(name => name.split(/[\\/]/).includes('node_modules')),
    'The copied package must not contain node_modules.');

  // Remove source-checkout resolution helpers. Fixture creation imports the
  // copied Python package, and the server/worker run from an unrelated cwd.
  const env = { ...process.env, PYTHONDONTWRITEBYTECODE: '1' };
  delete env.PYTHONPATH;
  delete env.NODE_PATH;
  delete env.NODE_OPTIONS;
  const created = spawnSync(python, ['-c', `
import json, sys
from paperstream import CanvasGraph
graph = CanvasGraph.create(sys.argv[1])
graph.add_node('First', 'Keep this paper', node_id='first', year=2020, x=17, y=29)
graph.add_node('Second', 'Keep this too', node_id='second', x=450, y=40)
graph.add_edge('first', 'second', '', edge_id='shared-relation')
data = graph.to_dict()
data['future'] = {'unicode': '完整保留', 'nested': [1, True, None, {'opaque': 'keep'}]}
data['nodes'][0]['unknown'] = {'values': ['node metadata', False, None]}
fence = chr(96) * 3
fields = json.loads(data['nodes'][0]['text'][8:-3])
fields['figure'] = {'src': 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZlN8AAAAASUVORK5CYII=', 'width': 108, 'frame': {'fit': 'contain', 'future': 7}}
fields['customPaperField'] = {'keep': True}
data['nodes'][0]['text'] = fence + 'json' + chr(10) + json.dumps(fields, ensure_ascii=False) + chr(10) + fence
data['nodes'].append({'id': 'ordinary-note', 'type': 'text', 'text': 'Original note', 'x': -70, 'y': 410, 'width': 250, 'height': 120, 'futureNote': {'keep': 'ordinary'}})
data['edges'][0]['futureEdge'] = {'weight': 0.375, 'style': ['future', 'values']}
graph.set_document(data)
graph.validate()
graph.save()
`, canvas], { cwd: relocated, env, encoding: 'utf8' });
  assert.equal(created.status, 0, created.stderr);
  const before = JSON.parse(await readFile(canvas, 'utf8'));

  const transport = new StdioClientTransport({ command: process.execPath,
    args: [join(relocated, 'dist/server.mjs'), '--file', canvas, '--python', python],
    cwd: working, env, stderr: 'pipe' });
  let stderr = '';
  transport.stderr?.on('data', chunk => { stderr += chunk.toString(); });
  client = new Client({ name: 'paperstream-distribution-test', version: '1' }, { capabilities: {} });
  try { await client.connect(transport); }
  catch (error) { assert.fail(`Copied package failed its stdio handshake: ${error.message}\n${stderr}`); }
  assert.equal(client.getServerVersion()?.name, 'paperstream-standard');
  const tools = (await client.listTools()).tools;
  assert.ok(tools.some(tool => tool.name === 'paperstream_apply_changes'));
  assert.equal(tools.find(tool => tool.name === 'paperstream_open_canvas')._meta.ui.resourceUri, uiUri);
  const resource = (await client.readResource({ uri: uiUri })).contents[0];
  assert.equal(resource.mimeType, 'text/html;profile=mcp-app');
  assert.equal(resource.text, await readFile(join(relocated, 'dist/app.html'), 'utf8'));

  const call = async (name, args = {}) => client.callTool({ name, arguments: args });
  const list = await call('paperstream_list_canvases');
  assert.equal(list.isError, undefined);
  assert.equal(list.structuredContent.canvases.length, 1);
  const { fileId, name, writable } = list.structuredContent.canvases[0];
  assert.equal(name, 'selected graph with spaces.canvas');
  assert.equal(writable, true);
  const opened = await call('paperstream_open_canvas', { fileId });
  assert.equal(opened.isError, undefined);
  const initial = await call('paperstream_read_canvas', { fileId });
  assert.equal(initial.isError, undefined);
  assert.equal(initial.structuredContent.fileId, fileId);
  assert.equal(initial.structuredContent.revision, opened.structuredContent.revision);
  assert.deepEqual(JSON.parse(initial.structuredContent.text), before);

  const targeted = await call('paperstream_apply_changes', { fileId, expectedRevision: initial.structuredContent.revision,
    changes: [{ op: 'update_node', node_id: 'first', alias: 'Portable targeted edit' }] });
  assert.equal(targeted.isError, undefined);
  assert.equal(targeted.structuredContent.outcome, 'saved');
  const updated = (await call('paperstream_read_canvas', { fileId })).structuredContent;
  const afterTargeted = JSON.parse(updated.text);
  const expected = structuredClone(before);
  const fields = JSON.parse(before.nodes[0].text.slice(8, -3));
  const actualFields = JSON.parse(afterTargeted.nodes[0].text.slice(8, -3));
  assert.deepEqual(actualFields, { ...fields, alias: 'Portable targeted edit' }, 'Paper edits preserve all unknown fields and the complete embedded image.');
  expected.nodes[0].text = afterTargeted.nodes[0].text;
  assert.deepEqual(afterTargeted, expected, 'Targeted API edits preserve every unrelated node, edge, field, geometry and array order.');

  const draft = structuredClone(afterTargeted);
  draft.nodes.find(node => node.id === 'ordinary-note').text = 'Editor saved from a relocated package';
  const saved = await call('paperstream_write_canvas', { fileId, expectedRevision: updated.revision, text: JSON.stringify(draft) });
  assert.equal(saved.isError, undefined);
  assert.equal(saved.structuredContent.fileId, fileId);
  assert.equal(saved.structuredContent.outcome, 'saved');
  assert.notEqual(saved.structuredContent.revision, updated.revision);
  const disk = await readFile(canvas, 'utf8');
  assert.deepEqual(JSON.parse(disk), draft, 'The complete editor draft reaches disk without losing unknown data.');
  const reread = (await call('paperstream_read_canvas', { fileId })).structuredContent;
  assert.equal(reread.revision, saved.structuredContent.revision);
  assert.deepEqual(JSON.parse(reread.text), draft);

  const stale = await call('paperstream_write_canvas', { fileId, expectedRevision: updated.revision, text: updated.text });
  assert.equal(stale.isError, undefined);
  assert.equal(stale.structuredContent.outcome, 'conflict');
  assert.equal(stale.structuredContent.revision, saved.structuredContent.revision);
  assert.equal(await readFile(canvas, 'utf8'), disk, 'A stale revision cannot overwrite the saved relocated document.');
});
