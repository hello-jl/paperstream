// Development-only standard MCP Apps host. The HTTP page is a test harness;
// the distributed adapter itself uses stdio MCP and has no local HTTP service.
import { createServer } from 'node:http';
import { mkdtemp, readFile, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const repository = dirname(root);
const requireWeb = createRequire(join(repository, 'web/package.json'));
const { build } = requireWeb('esbuild');
const temporary = await mkdtemp(join(await realpath(tmpdir()), 'paperstream-mcp-host-'));
const files = [join(temporary, 'standard-mcp-test.canvas'), join(temporary, 'second-test.canvas')];
const created = spawnSync(process.env.PAPERSTREAM_PYTHON ?? 'python3', ['-c', `
import sys
from paperstream import CanvasGraph
for path in sys.argv[1:]:
    graph = CanvasGraph.create(path)
    graph.add_node('LeNet', '卷积、共享权重与下采样。', node_id='demo_lenet', name='Gradient-Based Learning Applied to Document Recognition', year=1998, url='http://yann.lecun.com/exdb/publis/pdf/lecun-98.pdf')
    graph.add_node('AlexNet', '更深的网络、GPU 与大规模数据。', node_id='demo_alexnet', name='ImageNet Classification with Deep Convolutional Neural Networks', year=2012, url='https://papers.nips.cc/paper_files/paper/2012/hash/c399862d3b9d6b76c8436e924a68c45b-Abstract.html')
    graph.add_node('ResNet', '- 残差连接改善优化' + chr(10) + '- 深度可以继续增加', node_id='demo_resnet', name='Deep Residual Learning for Image Recognition', year=2016, url='https://arxiv.org/abs/1512.03385')
    graph.add_edge('demo_lenet', 'demo_alexnet', 'deepen')
    graph.add_edge('demo_alexnet', 'demo_resnet', 'stabilize')
    graph.validate()
    graph.save()
`, ...files], { cwd: repository, encoding: 'utf8' });
if (created.status !== 0) throw new Error(created.stderr || 'Could not create temporary test Canvas through CanvasGraph.');

const transport = new StdioClientTransport({ command: process.execPath,
  args: [join(root, 'dist/server.mjs'), ...files.flatMap(file => ['--file', file]), ...(process.env.PAPERSTREAM_PREVIEW_READONLY === '1' ? ['--read-only'] : [])],
  cwd: repository, stderr: 'inherit' });
const client = new Client({ name: 'paperstream-standard-ui-test-host', version: '0.1.0' });
await client.connect(transport);
const listed = await client.callTool({ name: 'paperstream_list_canvases', arguments: {} });
if (listed.isError || !Array.isArray(listed.structuredContent?.canvases)) throw new Error('Backend did not list the temporary test files.');
const canvases = listed.structuredContent.canvases;

const browserCode = String.raw`
import { AppBridge, PostMessageTransport } from '@modelcontextprotocol/ext-apps/app-bridge';
let bridge, saves = 0, reads = 0, conflictNext = false, holdRead = false, holdWrite = false, changes = 0;
const pending = [], status = document.getElementById('status');
const canvases = await (await fetch('/canvases')).json();
let currentFile = canvases[0];
function report(detail) { status.textContent = 'reads=' + reads + ' saves=' + saves + ' · ' + detail; }
async function call(params) {
  const response = await fetch('/tool', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Paperstream-Test-Host': '1' }, body: JSON.stringify(params) });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}
async function external(notify = true) {
  const read = await call({ name: 'paperstream_read_canvas', arguments: { fileId: currentFile.fileId } });
  if (read.isError) throw new Error(JSON.stringify(read.structuredContent));
  const changed = await call({ name: 'paperstream_apply_changes', arguments: { fileId: currentFile.fileId, expectedRevision: read.structuredContent.revision,
    changes: [{ op: 'update_node', node_id: 'demo_resnet', alias: 'ResNet · external ' + (++changes) }] } });
  report(changed.isError ? 'external edit failed' : 'external edit committed through real Python API');
  if (notify) await bridge.sendToolResult(changed);
}
async function pause(kind) {
  const held = kind === 'read' ? holdRead : holdWrite;
  if (!held) return;
  if (kind === 'read') holdRead = false; else holdWrite = false;
  report(kind + ' paused; click Release');
  await new Promise(resolve => pending.push(resolve));
}
const iframe = document.createElement('iframe');
iframe.title = 'Paperstream standard MCP Apps editor';
iframe.style.cssText = 'width:100%;height:calc(100vh - 106px);border:0;display:block';
document.body.append(iframe);
bridge = new AppBridge(null, { name: 'Standard MCP Apps test host (not Claude)', version: '0.1.0' }, {
  openLinks: {}, serverTools: {},
}, { hostContext: { theme: 'light', displayMode: 'fullscreen' } });
bridge.oncalltool = async params => {
  const reading = params.name === 'paperstream_read_canvas', writing = params.name === 'paperstream_write_canvas';
  if (reading) { reads++; await pause('read'); }
  if (writing) {
    await pause('write');
    if (conflictNext) { conflictNext = false; await external(false); }
  }
  const result = await call(params);
  if (reading && !result.isError) {
    const accepted = canvases.find(file => file.fileId === result.structuredContent?.fileId);
    if (accepted) currentFile = accepted;
  }
  if (writing && result.structuredContent?.outcome === 'saved') saves++;
  report(params.name + (result.isError ? ' ERROR' : result.structuredContent?.outcome ? ' ' + result.structuredContent.outcome : ' OK'));
  return result;
};
bridge.onopenlink = async ({ url }) => { report('openLink requested: ' + url); return {}; };
bridge.oninitialized = async () => {
  await bridge.sendToolInput({ arguments: { fileId: currentFile.fileId } });
  const result = await call({ name: 'paperstream_open_canvas', arguments: { fileId: currentFile.fileId } });
  await bridge.sendToolResult(result);
};
document.getElementById('external').onclick = () => void external().catch(error => report(error.message));
document.getElementById('conflict').onclick = () => { conflictNext = true; report('next write will race a real API update'); };
document.getElementById('hold-read').onclick = () => { holdRead = true; report('next read will pause'); };
document.getElementById('hold-write').onclick = () => { holdWrite = true; report('next write will pause'); };
document.getElementById('release').onclick = () => { pending.splice(0).forEach(resolve => resolve()); report('released'); };
document.getElementById('inspect').onclick = async () => {
  const result = await call({ name: 'paperstream_read_canvas', arguments: { fileId: currentFile.fileId } });
  const output = document.getElementById('content');
  output.textContent = result.structuredContent?.text ?? JSON.stringify(result);
  output.parentElement.open = true;
};
document.getElementById('switch').onclick = async () => {
  const next = canvases.find(file => file.fileId !== currentFile.fileId);
  const result = await call({ name: 'paperstream_open_canvas', arguments: { fileId: next.fileId } });
  await bridge.sendToolResult(result);
  report('switch requested; editor must preserve an unsaved draft');
};
await bridge.connect(new PostMessageTransport(iframe.contentWindow, iframe.contentWindow));
iframe.src = '/app.html';
`;
const bundle = await build({ stdin: { contents: browserCode, resolveDir: root, sourcefile: 'standard-browser-host.js' },
  bundle: true, write: false, format: 'esm', platform: 'browser', target: 'es2022' });
const html = '<!doctype html><html><head><meta charset="utf-8"><title>Paperstream Standard MCP Apps Test Host</title></head><body style="margin:0;font:13px system-ui;background:#f4f6f3"><header style="padding:8px;background:#fff0ca;min-height:90px;box-sizing:border-box"><strong>Standard MCP Apps test host — not Claude; edits only temporary API-created files</strong><br><button id="external">External API update</button> <button id="conflict">Conflict next save</button> <button id="hold-read">Pause next read</button> <button id="hold-write">Pause next write</button> <button id="release">Release</button> <button id="switch">Switch file</button> <button id="inspect">Inspect actual saved file</button><p id="status" style="margin:4px 0"></p><details><summary>Saved JSON</summary><pre id="content" style="max-height:160px;overflow:auto"></pre></details></header><script type="module" src="/host.js"></script></body></html>';
let origin;
const server = createServer(async (request, response) => {
  const send = (status, type, content) => response.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' }).end(content);
  try {
    if (request.method === 'GET' && request.url === '/') return send(200, 'text/html', html);
    if (request.method === 'GET' && request.url === '/host.js') return send(200, 'text/javascript', bundle.outputFiles[0].text);
    if (request.method === 'GET' && request.url === '/app.html') return send(200, 'text/html', await readFile(join(root, 'dist/app.html')));
    if (request.method === 'GET' && request.url === '/canvases') return send(200, 'application/json', JSON.stringify(canvases));
    if (request.method !== 'POST' || request.url !== '/tool') return send(404, 'text/plain', 'Not found');
    if (request.headers['x-paperstream-test-host'] !== '1' || (request.headers.origin && request.headers.origin !== origin)) return send(403, 'text/plain', 'Test host origin required');
    const chunks = [];
    let length = 0;
    for await (const chunk of request) {
      length += chunk.length;
      if (length > 64 * 1024 * 1024) return send(413, 'text/plain', 'Test request too large');
      chunks.push(chunk);
    }
    const params = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!params || typeof params.name !== 'string' || typeof params.arguments !== 'object') return send(400, 'text/plain', 'Expected MCP tool call');
    const result = await client.callTool(params);
    return send(200, 'application/json', JSON.stringify(result));
  } catch (error) { return send(500, 'text/plain', error instanceof Error ? error.message : String(error)); }
});
server.listen(Number(process.env.PAPERSTREAM_PREVIEW_PORT ?? 4320), '127.0.0.1', () => {
  origin = `http://127.0.0.1:${server.address().port}`;
  console.log(`Standard MCP Apps test host (not Claude): ${origin}`);
  console.log(`Real stdio backend; temporary Canvas allowlist: ${temporary}`);
});
let closing = false;
const close = async () => {
  if (closing) return;
  closing = true;
  server.close();
  await client.close();
  await rm(temporary, { recursive: true, force: true });
};
process.once('SIGINT', () => { void close().finally(() => process.exit(0)); });
process.once('SIGTERM', () => { void close().finally(() => process.exit(0)); });
