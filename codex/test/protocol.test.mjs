import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

test('built standalone server advertises a .canvas editor and serves its bundled UI', async () => {
  const server = fileURLToPath(new URL('../dist/plugin/dist/server.mjs', import.meta.url));
  const transport = new StdioClientTransport({ command: process.execPath, args: [server], cwd: '/tmp', stderr: 'pipe' });
  const client = new Client({ name: 'paperstream-protocol-test', version: '1.0.0' });
  let stderr = '';
  transport.stderr?.on('data', data => { stderr += data; });
  try {
    await client.connect(transport);
    const { tools } = await client.listTools();
    const tool = tools.find(tool => tool.name === 'paperstream.canvas');
    assert.ok(tool);
    assert.deepEqual(tool._meta['openai/ui'].entrypoints, [{ type: 'file', extensions: ['.canvas'] }]);
    assert.deepEqual(tool._meta.ui.visibility, ['app']);
    const result = await client.callTool({ name: tool.name, arguments: { file: { name: 'example.canvas', resourceUri: 'resource://opaque/1' } } });
    assert.equal(result.isError, undefined);
    const { contents } = await client.readResource({ uri: tool._meta.ui.resourceUri });
    assert.equal(contents[0].mimeType, 'text/html;profile=mcp-app');
    assert.match(contents[0].text, /<!doctype html>/);
    assert.match(contents[0].text, /Paperstream/);
    assert.doesNotMatch(contents[0].text, /<script[^>]+src=/i);
    assert.doesNotMatch(contents[0].text, /<link[^>]+stylesheet/i);
    assert.deepEqual(contents[0]._meta.ui.csp, { connectDomains: [], resourceDomains: [] });
    const manifest = JSON.parse(await readFile(new URL('../dist/plugin/.codex-plugin/plugin.json', import.meta.url), 'utf8'));
    assert.equal(manifest.name, 'paperstream');
  } catch (error) {
    error.message += `\nServer stderr: ${stderr}`;
    throw error;
  } finally { await client.close(); }
});
