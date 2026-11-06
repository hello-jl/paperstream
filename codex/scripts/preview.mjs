import { build } from 'esbuild';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

const bundle = await build({
  entryPoints: [new URL('../test/browser-host.ts', import.meta.url).pathname],
  bundle: true, write: false, format: 'esm', platform: 'browser', target: 'es2022',
});
const html = '<!doctype html><html><head><meta charset="utf-8"><title>Paperstream MCP Apps Test Host</title></head><body style="margin:0;font:13px system-ui"><header style="padding:8px;background:#fff0ca"><strong>MCP Apps test host — simulation, not ChatGPT; changes stay in memory</strong><br><button id="external">External update</button> <button id="conflict">Conflict next save</button> <button id="readonly">Toggle read-only and reload</button> <button id="inspect">Inspect saved data</button> <span id="status"></span><details><summary>Resource text</summary><pre id="content" style="max-height:220px;overflow:auto"></pre></details></header><script type="module" src="/host.js"></script></body></html>';
const fixture = await readFile(new URL('../../examples/resnet.canvas', import.meta.url));
const routes = {
  '/': ['text/html', html], '/host.js': ['text/javascript', bundle.outputFiles[0].text],
  '/fixture': ['application/json', fixture],
};
const server = createServer(async (request, response) => {
  if (request.url === '/app.html') {
    try {
      const app = await readFile(new URL('../dist/app.html', import.meta.url));
      response.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' }).end(app);
    } catch { response.writeHead(503).end('Build the adapter first.'); }
    return;
  }
  const route = routes[request.url];
  if (!route) { response.writeHead(404).end(); return; }
  response.writeHead(200, { 'Content-Type': route[0], 'Cache-Control': 'no-store' }).end(route[1]);
});
server.listen(Number(process.env.PAPERSTREAM_PREVIEW_PORT ?? 4318), '127.0.0.1', () => {
  console.log(`MCP Apps test host (not ChatGPT): http://127.0.0.1:${server.address().port}`);
});
