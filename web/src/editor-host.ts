import { parseCanvas, serializeCanvas } from './canvas.ts';
import type { JSONCanvasDocument } from './canvas.ts';
import { restoreEditorDraft } from './draft-recovery.ts';

/** A host owns resource identity, permissions and optimistic concurrency.
 * The editor never interprets a host URI as a local filesystem path. */
export interface EditorHost {
  document: JSONCanvasDocument;
  fileName: string;
  readOnly?: boolean;
  onSave: (document: JSONCanvasDocument) => Promise<void>;
  onDirtyChange?: (dirty: boolean) => void;
  onDocumentChange?: (document: JSONCanvasDocument) => void;
  /** Include incomplete form text that has not yet become valid Canvas data. */
  onInputChange?: (form: Readonly<Record<string, string>>) => void;
}

/** Do not hydrate browser drafts over a resource supplied by another host. */
export function initialHostDraft(host: Pick<EditorHost, 'document' | 'fileName'>) {
  const saved = serializeCanvas(host.document);
  return { ...restoreEditorDraft(undefined), canvas: parseCanvas(saved), saved, fileName: host.fileName };
}
