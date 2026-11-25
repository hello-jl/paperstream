import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { McpServer } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { OpenAIExtensions, OpenAIFileEntrypointInputSchema } from '@openai/mcp-extensions/server';

export const UI_URI = 'ui://paperstream/canvas-v1';

export function createServer(html: string) {
  const server = new McpServer({ name: 'paperstream', title: 'Paperstream', version: '0.1.2' });
  new OpenAIExtensions(server);
  server.registerResource('paperstream-canvas', UI_URI, { mimeType: 'text/html;profile=mcp-app' }, async () => ({
    contents: [{
      uri: UI_URI,
      mimeType: 'text/html;profile=mcp-app',
      text: html,
      _meta: {
        ui: { csp: { connectDomains: [], resourceDomains: [] } },
        'openai/ui': { preferredDisplayMode: 'fullscreen', availableDisplayModes: ['fullscreen'] },
      },
    }],
  }));
  server.registerTool('paperstream.canvas', {
    title: 'Paperstream Canvas',
    description: 'Open the selected .canvas file in the Paperstream graph editor.',
    inputSchema: OpenAIFileEntrypointInputSchema,
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    _meta: {
      ui: { resourceUri: UI_URI, visibility: ['app'] },
      'openai/ui': { entrypoints: [{ type: 'file', extensions: ['.canvas'] }] },
    },
  }, async () => ({ content: [] }));
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const html = await readFile(new URL('./app.html', import.meta.url), 'utf8');
  serveStdio(() => createServer(html));
}
