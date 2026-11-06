/** Recover editor state without reading storage or overwriting the source draft. */
import { addEdge, addNode, CanvasError, createCanvas, createEdge, createPaperNode, parseCanvas, readPaper, serializeCanvas } from './canvas.ts';
import type { CanvasEdge, JSONCanvasDocument } from './canvas.ts';

export type RecoveredSelection = { kind: 'node' | 'edge'; id: string } | null;
export type RecoveredInlineField = 'alias' | 'takeaway' | 'relation' | 'text' | 'label';
export interface RecoveredEditorDraft {
  canvas: JSONCanvasDocument;
  fileName: string;
  saved: string;
  selection: RecoveredSelection;
  form: Record<string, string>;
  formDirty: boolean;
  inlineField: RecoveredInlineField | null;
  fileBindingId: string | null;
  restored: boolean;
  recoveryError: string;
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function freshEditorDraft(): RecoveredEditorDraft {
  const canvas = { ...createCanvas(), paperstreamLayout: 'vertical' };
  return { canvas, fileName: 'papers.canvas', saved: serializeCanvas(canvas), selection: null, form: {}, formDirty: false,
    inlineField: null, fileBindingId: null, restored: false, recoveryError: '' };
}
function connectionSide(value: unknown): CanvasEdge['fromSide'] {
  if (value === undefined) return undefined;
  if (value === 'top' || value === 'right' || value === 'bottom' || value === 'left') return value;
  throw new CanvasError('恢复草稿的连接端点方向无效。');
}

/**
 * Accept an IndexedDB value or a legacy sessionStorage JSON string. Only an
 * absent value is a new document. Errors quarantine the old record: callers
 * must not persist the returned fallback while recoveryError is non-empty.
 */
export function restoreEditorDraft(draft: unknown): RecoveredEditorDraft {
  const fallback = freshEditorDraft();
  if (draft === undefined) return fallback;
  try {
    const source: unknown = typeof draft === 'string' ? JSON.parse(draft) : draft;
    if (!record(source)) throw new CanvasError('恢复草稿不是有效对象。');
    // Validate before stringify so undefined, NaN and unsupported unknown data
    // cannot silently disappear. Parse also gives the editor its own copy.
    let canvas = parseCanvas(serializeCanvas(source.canvas as JSONCanvasDocument));
    if (source.form !== undefined && (!record(source.form) || !Object.values(source.form).every(value => typeof value === 'string'))) {
      throw new CanvasError('恢复草稿的输入字段不是文本。');
    }
    const form = { ...(source.form ?? {}) } as Record<string, string>;
    const candidate = record(source.selection) ? source.selection : null;
    let selection: RecoveredSelection = null;
    if (candidate?.kind === 'new') {
      const node = createPaperNode({ alias: form.alias ?? '', takeaway: form.takeaway ?? '' }, { x: 0, y: 0, width: 360, height: 180 });
      canvas = addNode(canvas, node);
      selection = { kind: 'node', id: node.id };
    } else if (candidate?.kind === 'connection') {
      const fromNode = form.source ?? candidate.source, toNode = form.target ?? candidate.target;
      if (typeof fromNode !== 'string' || typeof toNode !== 'string'
        || !canvas.nodes.some(node => node.id === fromNode) || !canvas.nodes.some(node => node.id === toNode)) {
        throw new CanvasError('恢复草稿的连接起点或终点已不存在。');
      }
      const edge = createEdge(fromNode, toNode, form.relation ?? '');
      const fromSide = connectionSide(candidate.fromSide), toSide = connectionSide(candidate.toSide);
      if (fromSide !== undefined) edge.fromSide = fromSide;
      if (toSide !== undefined) edge.toSide = toSide;
      canvas = addEdge(canvas, edge);
      delete form.source; delete form.target;
      selection = { kind: 'edge', id: edge.id };
    } else if (candidate?.kind === 'node' && typeof candidate.id === 'string' && canvas.nodes.some(node => node.id === candidate.id)) {
      selection = { kind: 'node', id: candidate.id };
    } else if (candidate?.kind === 'edge' && typeof candidate.id === 'string' && canvas.edges.some(edge => edge.id === candidate.id)) {
      selection = { kind: 'edge', id: candidate.id };
    }
    const selectedNode = selection?.kind === 'node' ? canvas.nodes.find(node => node.id === selection.id) : undefined;
    let inlineField: RecoveredInlineField | null = null;
    if (selectedNode) {
      if (readPaper(selectedNode) && (source.inlineField === 'alias' || source.inlineField === 'takeaway')) inlineField = source.inlineField;
      else if (!readPaper(selectedNode) && selectedNode.type === 'text' && (source.inlineField === 'text' || source.inlineField === 'label')) inlineField = source.inlineField;
    } else if (selection?.kind === 'edge' && source.inlineField === 'relation') inlineField = 'relation';
    return { ...fallback, canvas, fileName: typeof source.fileName === 'string' ? source.fileName : fallback.fileName,
      saved: typeof source.saved === 'string' ? source.saved : fallback.saved, selection, form,
      formDirty: Boolean(selection && source.formDirty), inlineField,
      fileBindingId: typeof source.fileBindingId === 'string' ? source.fileBindingId : null, restored: true };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { ...fallback, recoveryError: `原恢复草稿无法读取，已暂停覆盖它；请打开文件或在新页签继续。${reason}` };
  }
}
