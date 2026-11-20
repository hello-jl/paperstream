import type { HostResources } from '../resource-session.ts';
import { parseCanvas, serializeCanvas } from '../canvas.ts';

export const LOCAL_RESOURCE_URI = 'resource://paperstream-local/canvas';
type Envelope = { name: string; text: string; etag: string; writable: boolean };

function envelope(value: unknown): Envelope {
  if (!value || typeof value !== 'object') throw new Error('本地服务没有返回有效的画布。');
  const row = value as Record<string, unknown>;
  if (typeof row.name !== 'string' || typeof row.text !== 'string' || typeof row.etag !== 'string' || !row.etag
    || typeof row.writable !== 'boolean') throw new Error('本地服务没有返回完整的文件版本信息。');
  return row as Envelope;
}

async function failure(response: Response): Promise<Error> {
  try {
    const value = await response.json();
    if (typeof value.message === 'string') return new Error(value.message);
  } catch { /* Non-JSON transport errors still report their status. */ }
  return new Error(`本地文件服务请求失败（${response.status}）。`);
}

/** Adapt only this server's single document to the existing resource session.
 * No client-supplied path is ever sent to the local filesystem bridge. */
export function createHttpResources(token: string, request: typeof fetch = fetch) {
  if (!token) throw new Error('请从启动命令给出的完整本机链接打开画布。');
  let name = '';
  const headers = { Authorization: `Bearer ${token}` };
  const checkUri = (uri: string) => {
    if (uri !== LOCAL_RESOURCE_URI) throw new Error('此服务只允许编辑启动时指定的画布。');
  };
  const resources: HostResources = {
    async read({ uri }) {
      checkUri(uri);
      const response = await request('/api/canvas', { headers, cache: 'no-store', credentials: 'omit', redirect: 'error' });
      if (!response.ok) throw await failure(response);
      const value = envelope(await response.json());
      name = value.name;
      // Python and JS spell some JSON numbers differently (1e-07 vs 1e-7).
      // Compare canonical editor text, while retaining the exact disk ETag.
      const text = serializeCanvas(parseCanvas(value.text));
      return { contents: [{ uri, text, openaiMetadata: { etag: value.etag, writable: value.writable } }] };
    },
    async write(uri, value) {
      checkUri(uri);
      const response = await request('/api/canvas', { method: 'PUT',
        headers: { ...headers, 'Content-Type': 'application/json', 'If-Match': value.ifMatch }, body: value.text,
        credentials: 'omit', redirect: 'error', cache: 'no-store' });
      if (response.status === 409) {
        const result = await response.json();
        if (typeof result.etag !== 'string' || !result.etag) throw new Error('文件冲突，当前修改已保留，请重新载入后检查。');
        return { outcome: 'conflict', etag: result.etag };
      }
      if (response.status === 413) {
        const result = await response.json();
        return { outcome: 'too-large', maxBytes: typeof result.maxBytes === 'number' ? result.maxBytes : 64 * 1024 * 1024 };
      }
      if (!response.ok) throw await failure(response);
      const result = envelope(await response.json());
      return { outcome: 'saved', etag: result.etag };
    },
  };
  return { resources, fileName: () => name };
}

/** Fragment tokens stay out of HTTP paths and referrers. Keep a tab-scoped
 * copy for reloads; if storage is unavailable, retain the fragment instead. */
export function localToken(fragment: string, storage: Pick<Storage, 'getItem' | 'setItem'> | undefined) {
  const supplied = new URLSearchParams(fragment.replace(/^#/, '')).get('token');
  if (supplied) {
    let persisted = false;
    try { storage?.setItem('paperstream-local-token-v1', supplied); persisted = Boolean(storage); } catch { /* Keep fragment. */ }
    return { token: supplied, clearFragment: persisted };
  }
  let token = '';
  try { token = storage?.getItem('paperstream-local-token-v1') ?? ''; } catch { /* Show missing-token guidance. */ }
  return { token, clearFragment: false };
}
