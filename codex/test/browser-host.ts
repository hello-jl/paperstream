// Development-only MCP Apps host simulation. This file is never packaged in
// the plugin and never writes a user document. The visible label is deliberate:
// passing this harness does not prove ChatGPT desktop integration.
import { AppBridge, PostMessageTransport } from '@modelcontextprotocol/ext-apps/app-bridge';
import { SubscribeRequestSchema, UnsubscribeRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { OpenAIResourceWriteParamsSchema } from '@openai/mcp-extensions/app';
import { z } from 'zod';

const uri = 'resource://paperstream-test/canvas';
let text = await (await fetch('/fixture')).text();
let revision = 1;
let writable = true;
let saved = 0;
let bridge: AppBridge;
let conflictNext = false;
const status = document.getElementById('status')!;
function report(detail: string) { status.textContent = `version=${revision} saved=${saved} writable=${writable} · ${detail}`; }
async function mount() {
  if (bridge) await bridge.close();
  const previous = document.querySelector('iframe');
  previous?.remove();
  const iframe = document.createElement('iframe');
  iframe.title = 'Paperstream MCP Apps test';
  iframe.style.cssText = 'width:100%;height:calc(100vh - 90px);border:0;display:block';
  document.body.append(iframe);
  bridge = new AppBridge(null, { name: 'Paperstream test host (not ChatGPT)', version: '0.1.0' }, {
    openLinks: {}, serverResources: {}, experimental: { 'openai/resource': {} },
  }, { hostContext: { theme: 'light', displayMode: 'fullscreen' } });
  bridge.onreadresource = async ({ uri: requested }) => {
    if (requested !== uri) throw new Error('Unknown test URI');
    report('resource read');
    return { contents: [{ uri, text, mimeType: 'application/json', _meta: { 'openai/resource': { etag: String(revision), writable } } }] };
  };
  bridge.setRequestHandler(SubscribeRequestSchema, async () => { report('subscribed'); return {}; });
  bridge.setRequestHandler(UnsubscribeRequestSchema, async () => ({}));
  bridge.setRequestHandler(z.object({ method: z.literal('openai/resources/write'), params: OpenAIResourceWriteParamsSchema }), async ({ params }) => {
    if (!writable) throw new Error('Read-only test resource');
    if (conflictNext) { revision++; conflictNext = false; }
    if (params.ifMatch !== String(revision)) {
      report('CONFLICT preserved');
      return { outcome: 'conflict', etag: String(revision) };
    }
    if (!('text' in params) || typeof params.text !== 'string') throw new Error('Expected text');
    JSON.parse(params.text);
    text = params.text;
    revision++;
    saved++;
    report('SAVED in test memory only');
    return { outcome: 'saved', etag: String(revision) };
  });
  bridge.onopenlink = async ({ url }) => { report(`open link: ${url}`); return {}; };
  bridge.oninitialized = () => { void bridge.sendToolInput({ arguments: { file: { name: 'resnet.canvas', resourceUri: uri } } }); };
  await bridge.connect(new PostMessageTransport(iframe.contentWindow!, iframe.contentWindow!));
  iframe.src = '/app.html';
}
document.getElementById('external')!.onclick = async () => {
  const document = JSON.parse(text);
  document.testExternalRevision = ++revision;
  text = JSON.stringify(document);
  report('external update');
  await bridge.notification({ method: 'notifications/resources/updated', params: { uri } });
};
document.getElementById('conflict')!.onclick = () => { conflictNext = true; report('next save will conflict'); };
document.getElementById('readonly')!.onclick = async () => { writable = !writable; report('remounting with changed permission'); await mount(); };
document.getElementById('inspect')!.onclick = () => {
  const output = document.getElementById('content')!;
  output.textContent = text;
  (output.parentElement as HTMLDetailsElement).open = true;
};
await mount();
