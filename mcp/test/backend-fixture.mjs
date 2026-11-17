// Source-mode stdio fixture: the actual server and Python store, with a tiny
// resource so protocol tests do not need to build the React editor first.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer, parseArguments } from '../src/server.ts';
import { PythonCanvasStore } from '../src/python-bridge.ts';

try {
  const store = await PythonCanvasStore.create(parseArguments(process.argv.slice(2)));
  const server = createServer('<!doctype html><title>Paperstream protocol fixture</title>', store);
  if (!(server instanceof McpServer)) throw new Error('Expected the standard SDK server.');
  await server.connect(new StdioServerTransport());
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
