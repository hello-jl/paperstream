import { parseCanvas, serializeCanvas } from '../../web/src/canvas.ts';
import type { JSONCanvasDocument } from '../../web/src/canvas.ts';

export interface HostResources {
  read(params: { uri: string; representation: 'text' }): Promise<{ contents: Array<{
    uri: string; text?: string; blob?: string; openaiMetadata?: { etag?: string; writable?: boolean };
  }> }>;
  write(uri: string, value: { text: string; ifMatch: string }): Promise<
    { outcome: 'saved' | 'conflict'; etag: string } | { outcome: 'too-large'; maxBytes: number }
  >;
}

export interface ResourceSnapshot {
  document: JSONCanvasDocument;
  revision: number;
  readOnly: boolean;
  dirty: boolean;
  saving: boolean;
  externalChange: boolean;
  notice: string;
}

// The URI belongs to the host. It is never decoded into a filesystem path.
export class ResourceSession {
  private resources: HostResources;
  readonly uri: string;
  private changed: (snapshot: ResourceSnapshot) => void;
  private baseline = '';
  private etag: string | undefined;
  private writable = false;
  private dirty = false;
  private saving = false;
  private revision = 0;
  private request = 0;
  private disposed = false;
  private externalChange = false;
  private document: JSONCanvasDocument | undefined;
  private notice = '';

  constructor(
    resources: HostResources,
    uri: string,
    changed: (snapshot: ResourceSnapshot) => void,
  ) { this.resources = resources; this.uri = uri; this.changed = changed; }

  private publish() {
    if (!this.disposed && this.document) this.changed({
      document: this.document, revision: this.revision,
      readOnly: !this.writable || !this.etag, dirty: this.dirty, saving: this.saving,
      externalChange: this.externalChange, notice: this.notice,
    });
  }

  setDirty(value: boolean) {
    if (this.dirty === value) return;
    this.dirty = value;
    this.publish();
    if (!value && this.externalChange && !this.saving) {
      void this.refresh().catch(error => {
        this.notice = `读取外部更新失败：${error instanceof Error ? error.message : String(error)}`;
        this.publish();
      });
    }
  }

  async refresh(discard = false) {
    if (this.disposed) return;
    if (this.saving) {
      if (discard) throw new Error('正在保存，请等待保存完成后重新载入。');
      // A successful save always reads again after the write settles. Avoid
      // racing a host notification (including our own write) against that write.
      return;
    }
    const request = ++this.request;
    const result = await this.resources.read({ uri: this.uri, representation: 'text' });
    if (this.disposed || request !== this.request) return;
    const content = result.contents.find(item => item.uri === this.uri);
    if (!content || typeof content.text !== 'string') throw new Error('宿主没有返回此 Canvas 的文本内容。');
    // Validate before accepting any new version or changing the save baseline.
    const document = parseCanvas(content.text);
    const etag = content.openaiMetadata?.etag;
    this.writable = content.openaiMetadata?.writable === true;
    const changed = this.document && (etag !== this.etag || content.text !== this.baseline);
    if (changed && (this.dirty || this.saving) && !discard) {
      this.externalChange = true;
      this.notice = '文件已在其他地方更新；当前修改已保留。请先导出备份，再重新载入文件。';
      this.publish();
      return;
    }
    if (!this.document || changed || discard) {
      this.document = document;
      this.baseline = content.text;
      this.etag = etag;
      this.dirty = false;
      this.revision += 1;
    }
    this.externalChange = false;
    this.notice = !this.writable ? '宿主将此文件标记为只读。'
      : !this.etag ? '宿主未提供文件版本标记；为避免覆盖其他修改，当前只读。' : '';
    this.publish();
  }

  async save(document: JSONCanvasDocument) {
    if (this.disposed) throw new Error('文件会话已经关闭。');
    if (this.saving) throw new Error('正在保存，请稍后重试。');
    if (!this.writable || !this.etag) throw new Error('当前宿主资源不可安全写入。');
    const text = serializeCanvas(document);
    // A read started before this write must never reintroduce an old etag or
    // document after the write has completed, even if it was a discard reload.
    this.request += 1;
    this.saving = true;
    this.publish();
    try {
      const result = await this.resources.write(this.uri, { text, ifMatch: this.etag });
      if (result.outcome === 'conflict') {
        // Never adopt the conflicting etag: doing so would make the next click
        // overwrite somebody else's version with this stale document.
        this.externalChange = true;
        this.notice = '保存冲突：原文件已更新，当前修改仍在编辑器中。';
        this.publish();
        throw new Error(this.notice);
      }
      if (result.outcome === 'too-large') throw new Error(`文件超过宿主写入限制（${result.maxBytes} 字节）。`);
      this.etag = result.etag;
      this.baseline = text;
      this.document = document;
      this.externalChange = false;
      this.notice = '';
      this.publish();
    } finally {
      this.saving = false;
      this.publish();
    }
    // Catch an external edit that landed just after our write. Until Editor
    // acknowledges the save via setDirty(false), a newer version is retained as
    // a pending update rather than remounting the still-saving editor.
    try { await this.refresh(); }
    catch (error) {
      this.notice = `已保存，但重新读取文件失败：${error instanceof Error ? error.message : String(error)}`;
      this.publish();
    }
  }

  dispose() { this.disposed = true; this.request += 1; }
}
