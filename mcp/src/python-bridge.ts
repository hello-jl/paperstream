import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { access, lstat } from 'node:fs/promises';
import { basename, dirname, extname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export type CanvasIdentity = { fileId: string; name: string; writable: boolean };
export type CanvasEnvelope = CanvasIdentity & { revision: string; text: string };
export type WriteOutcome = { fileId: string; outcome: 'saved' | 'conflict'; revision: string };
type Guard = { path: string; dev: string; ino: string };
type Entry = CanvasIdentity & { path: string; guards: Guard[] };
type WorkerResult = { ok: boolean; code?: string; message?: string; [key: string]: unknown };

export class CanvasBridgeError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'CanvasBridgeError';
    this.code = code;
  }
}

async function defaultWorkerPath(): Promise<string> {
  // The distribution keeps its Python package next to dist; a source build
  // uses the repository package two levels above dist/server.mjs.
  for (const relative of ['../paperstream/mcp_bridge.py', '../../paperstream/mcp_bridge.py']) {
    const candidate = fileURLToPath(new URL(relative, import.meta.url));
    try { await access(candidate); return candidate; } catch { /* Try source layout. */ }
  }
  throw new CanvasBridgeError('missing_runtime', 'The bundled Python runtime was not found; rebuild the MCP package.');
}

async function selectedFile(path: string, readOnly: boolean): Promise<Entry> {
  if (!isAbsolute(path) || extname(path).toLowerCase() !== '.canvas') {
    throw new CanvasBridgeError('unsafe_path', '--file requires an absolute path to an existing .canvas file.');
  }
  const normalized = resolve(path);
  if (normalized !== path) throw new CanvasBridgeError('unsafe_path', 'Use a normalized absolute Canvas path without traversal or redundant separators.');
  const parents: string[] = [];
  let parent = dirname(normalized);
  while (true) {
    parents.push(parent);
    const next = dirname(parent);
    if (next === parent) break;
    parent = next;
  }
  const guards: Guard[] = [];
  try {
    const info = await lstat(normalized, { bigint: true });
    if (!info.isFile()) throw new CanvasBridgeError('unsafe_path', 'Selected Canvas files must be regular files, not symlinks.');
    for (const path of parents) {
      const directory = await lstat(path, { bigint: true });
      if (!directory.isDirectory()) throw new CanvasBridgeError('unsafe_path', 'Selected Canvas parent directories must not be symlinks.');
      guards.push({ path, dev: String(directory.dev), ino: String(directory.ino) });
    }
  } catch (error) {
    if (error instanceof CanvasBridgeError) throw error;
    throw new CanvasBridgeError('unsafe_path', 'A selected Canvas file could not be opened.');
  }
  return {
    path: normalized, guards,
    // Stable across restarts for the same selected path, without disclosing it
    // as an argument that a model could turn into filesystem traversal.
    fileId: `canvas_${createHash('sha256').update(normalized).digest('hex').slice(0, 24)}`,
    name: basename(normalized), writable: !readOnly,
  };
}

export class PythonCanvasStore {
  private entries = new Map<string, Entry>();
  private python: string;
  private workerPath: string;

  private constructor(python: string, workerPath: string, entries: Entry[]) {
    this.python = python;
    this.workerPath = workerPath;
    for (const entry of entries) this.entries.set(entry.fileId, entry);
  }

  static async create(options: { files: string[]; readOnly?: boolean; python?: string; workerPath?: string }): Promise<PythonCanvasStore> {
    if (!options.files.length) throw new CanvasBridgeError('no_files', 'No Canvas files are authorized. Pass --file /absolute/path/example.canvas (repeat for more files).');
    const entries = await Promise.all(options.files.map(path => selectedFile(path, options.readOnly ?? false)));
    const store = new PythonCanvasStore(options.python ?? 'python3', options.workerPath ?? await defaultWorkerPath(), entries);
    // Startup verifies Python availability and each selected document without
    // sending the document text into protocol stdout or logs.
    for (const entry of store.entries.values()) await store.worker(entry, 'read_canvas');
    return store;
  }

  listCanvases(): CanvasIdentity[] {
    return Array.from(this.entries.values(), ({ fileId, name, writable }) => ({ fileId, name, writable }));
  }

  private entry(fileId: string): Entry {
    const entry = this.entries.get(fileId);
    if (!entry) throw new CanvasBridgeError('unknown_file', 'Unknown fileId. Choose one returned by paperstream_list_canvases.');
    return entry;
  }

  private async worker(entry: Entry, action: string, fields: Record<string, unknown> = {}): Promise<WorkerResult> {
    const request = JSON.stringify({ ...fields, action, path: entry.path, guards: entry.guards, readOnly: !entry.writable });
    if (Buffer.byteLength(request) > 72 * 1024 * 1024) throw new CanvasBridgeError('too_large', 'The Canvas request exceeds its size limit.');
    return await new Promise<WorkerResult>((resolveResult, reject) => {
      const child = spawn(this.python, [this.workerPath], { shell: false, stdio: ['pipe', 'pipe', 'pipe'] });
      const chunks: Buffer[] = [];
      let size = 0;
      let finished = false;
      const finish = (error?: Error, result?: WorkerResult) => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        if (error) reject(error); else resolveResult(result!);
      };
      const timer = setTimeout(() => {
        child.kill();
        finish(new CanvasBridgeError('worker_timeout', 'The Canvas operation timed out. Read the file again before attempting another edit.'));
      }, 30_000);
      child.on('error', () => finish(new CanvasBridgeError('python_unavailable', 'Could not start Python. Configure --python with a Python 3.10+ executable.')));
      child.stdin.on('error', () => { /* Report process failure on close, not an unhandled EPIPE. */ });
      child.stdout.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > 96 * 1024 * 1024) {
          child.kill();
          finish(new CanvasBridgeError('too_large', 'The Canvas worker response exceeds its size limit.'));
        } else chunks.push(chunk);
      });
      // Do not relay Python exceptions, file paths, or Canvas content to MCP's
      // stdout. Drain stderr so a failing child cannot block on a full pipe.
      child.stderr.resume();
      child.on('close', code => {
        if (finished) return;
        try {
          const result: WorkerResult = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          if (!result || typeof result !== 'object' || typeof result.ok !== 'boolean') throw new Error();
          if (!result.ok) finish(new CanvasBridgeError(result.code ?? 'worker_error', result.message ?? 'The Canvas operation failed.'));
          else if (code !== 0) throw new Error();
          else finish(undefined, result);
        } catch {
          finish(new CanvasBridgeError('worker_error', 'The Canvas worker did not return a valid result.'));
        }
      });
      child.stdin.end(request);
    });
  }

  async readCanvas(fileId: string): Promise<CanvasEnvelope> {
    const entry = this.entry(fileId);
    const result = await this.worker(entry, 'read_canvas');
    return { fileId, name: entry.name, writable: entry.writable, revision: result.revision as string, text: result.text as string };
  }

  async readGraph(fileId: string): Promise<Record<string, unknown>> {
    const entry = this.entry(fileId);
    const { ok: _ok, ...result } = await this.worker(entry, 'read_graph');
    return { fileId, name: entry.name, writable: entry.writable, ...result };
  }

  async writeCanvas(fileId: string, expectedRevision: string, text: string): Promise<WriteOutcome> {
    const entry = this.entry(fileId);
    if (!entry.writable) throw new CanvasBridgeError('read_only', 'This Canvas was opened read-only.');
    const result = await this.worker(entry, 'write_canvas', { expectedRevision, text });
    return { fileId, outcome: result.outcome as 'saved' | 'conflict', revision: result.revision as string };
  }

  async applyChanges(fileId: string, expectedRevision: string, changes: unknown[]): Promise<Record<string, unknown>> {
    const entry = this.entry(fileId);
    if (!entry.writable) throw new CanvasBridgeError('read_only', 'This Canvas was opened read-only.');
    const { ok: _ok, ...result } = await this.worker(entry, 'apply_changes', { expectedRevision, changes });
    return { fileId, ...result };
  }
}
