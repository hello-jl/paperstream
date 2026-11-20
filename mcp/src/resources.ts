import type { HostResources } from '../../web/src/resource-session.ts';
import { parseCanvas, serializeCanvas } from '../../web/src/canvas.ts';

export type CallServerTool = (params: { name: string; arguments: Record<string, unknown> }) => Promise<unknown>;
export type CanvasFile = { fileId: string; name: string };
export type ListedCanvas = CanvasFile & { writable: boolean };

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function nonempty(value: unknown): value is string { return typeof value === 'string' && value.trim().length > 0; }

/** The server's opaque ID is not a browser URL or a local filesystem path. */
export function canvasUri(fileId: string): string {
  if (!nonempty(fileId)) throw new Error('缺少画布文件 ID。');
  return `resource://paperstream-mcp/${encodeURIComponent(fileId)}`;
}

function structured(result: unknown): Record<string, unknown> {
  const envelope = record(result);
  if (!envelope) throw new Error('画布工具没有返回有效结果。');
  if (envelope.isError === true) {
    const data = record(envelope.structuredContent);
    const content = Array.isArray(envelope.content) ? envelope.content : [];
    const explanation = content.map(record).find(item => typeof item?.text === 'string');
    throw new Error(nonempty(data?.message) ? data.message : nonempty(explanation?.text) ? explanation.text : '画布工具执行失败。');
  }
  const data = record(envelope.structuredContent);
  if (!data) throw new Error('画布工具没有返回结构化文件信息。');
  return data;
}

function identity(data: Record<string, unknown>, expected?: string): CanvasFile {
  if (!nonempty(data.fileId) || !nonempty(data.name)) throw new Error('画布工具缺少文件 ID 或文件名。');
  if (expected !== undefined && data.fileId !== expected) throw new Error('画布工具返回了另一个文件；已拒绝读取。');
  return { fileId: data.fileId, name: data.name };
}

export async function listCanvases(call: CallServerTool): Promise<ListedCanvas[]> {
  const data = structured(await call({ name: 'paperstream_list_canvases', arguments: {} }));
  if (!Array.isArray(data.canvases)) throw new Error('画布工具没有返回文件列表。');
  const ids = new Set<string>();
  return data.canvases.map(value => {
    const row = record(value);
    if (!row) throw new Error('画布文件列表包含无效条目。');
    const file = identity(row);
    if (typeof row.writable !== 'boolean' || ids.has(file.fileId)) throw new Error('画布文件列表缺少权限或包含重复 ID。');
    ids.add(file.fileId);
    return { ...file, writable: row.writable };
  });
}

export function fileFromToolInput(args: unknown): CanvasFile | undefined {
  const row = record(args);
  if (!nonempty(row?.fileId)) return undefined;
  return { fileId: row.fileId, name: nonempty(row.name) ? row.name : 'Canvas' };
}

export function fileFromToolResult(result: unknown): CanvasFile | undefined {
  const row = record(result);
  if (!row || row.isError === true) return undefined;
  const data = record(row.structuredContent);
  if (!nonempty(data?.fileId)) return undefined;
  return { fileId: data.fileId, name: nonempty(data.name) ? data.name : 'Canvas' };
}

/** Standard MCP tools are the only transport. Revision strings remain opaque.
 * `openaiMetadata` is the historical internal ResourceSession field name, not
 * an OpenAI host capability, protocol or runtime dependency. */
export function createMcpResources(call: CallServerTool, fileId: string, onFile?: (file: CanvasFile) => void): HostResources {
  const uri = canvasUri(fileId);
  let mayWrite = false;
  const checkUri = (requested: string) => {
    if (requested !== uri) throw new Error('此会话只能编辑已打开的画布。');
  };
  return {
    async read({ uri: requested, representation }) {
      checkUri(requested);
      if (representation !== 'text') throw new Error('画布只支持文本表示。');
      // Any failed permission/version check revokes the last write grant. A
      // stale UI session must not reuse an earlier successful read's grant.
      mayWrite = false;
      const data = structured(await call({ name: 'paperstream_read_canvas', arguments: { fileId } }));
      const file = identity(data, fileId);
      if (typeof data.text !== 'string' || !nonempty(data.revision) || typeof data.writable !== 'boolean') {
        throw new Error('画布工具缺少文本、版本或权限信息，当前不能安全保存。');
      }
      // Normalize number spelling only for editor comparisons; never derive a
      // new revision from this text or overwrite the server's revision token.
      const text = serializeCanvas(parseCanvas(data.text));
      mayWrite = data.writable;
      onFile?.(file);
      return { contents: [{ uri, text, openaiMetadata: { etag: data.revision, writable: data.writable } }] };
    },
    async write(requested, value) {
      checkUri(requested);
      if (!mayWrite || !nonempty(value.ifMatch)) throw new Error('当前画布缺少有效写入权限或版本，请重新读取后保存。');
      const data = structured(await call({ name: 'paperstream_write_canvas', arguments: { fileId, expectedRevision: value.ifMatch, text: value.text } }));
      if (data.fileId !== fileId) throw new Error('保存结果的文件 ID 不匹配，当前修改已保留。');
      if ((data.outcome !== 'saved' && data.outcome !== 'conflict') || !nonempty(data.revision)) {
        throw new Error('保存结果缺少有效版本，当前修改已保留。');
      }
      return { outcome: data.outcome, etag: data.revision };
    },
  };
}
