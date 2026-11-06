import { CanvasError, patchEdge, patchNode, readPaper, updatePaper } from './canvas.ts';
import type { JSONCanvasDocument, PaperFields } from './canvas.ts';
import { readNodeStyle, readEdgeStyle, updateNodeStyle, updateEdgeStyle } from './appearance.ts';
import { directionPatch, readEdgeDirection } from './edge-direction.ts';
import type { EdgeDirection } from './edge-direction.ts';

export type LiveSelection = { kind: 'node' | 'edge'; id: string };
/** Apply only the changed field, so editing one input never overwrites another. */
export function editField(document: JSONCanvasDocument, selected: LiveSelection, key: string, value: string): JSONCanvasDocument {
  if (selected.kind === 'node') {
    const node = document.nodes.find(item => item.id === selected.id);
    if (!node) throw new CanvasError('卡片不存在。');
    const paper = readPaper(node);
    if (paper && ['alias', 'takeaway', 'name', 'url', 'year'].includes(key)) {
      const nextValue = key === 'year' ? (value === '' ? null : Number(value)) : key === 'name' || key === 'url' ? value || null : value;
      if (paper[key as keyof typeof paper] === nextValue) return document;
      return updatePaper(document, node.id, { [key]: nextValue } as Partial<PaperFields>);
    }
    if (key === 'text' || key === 'label') return node[key] === value ? document : patchNode(document, node.id, { [key]: value });
    if (key === 'strokeWidth' || key === 'heightMode') {
      const old = readNodeStyle(node);
      if (key === 'strokeWidth' && value !== '' && old.strokeWidth === Number(value) || key === 'heightMode' && old.heightMode === value) return document;
      if (key === 'strokeWidth' && value === '') throw new CanvasError('请输入 0.5–8 之间的线重。');
      const { id, ...patch } = updateNodeStyle(node, key === 'strokeWidth' ? { strokeWidth: Number(value) } : { heightMode: value as 'auto' | 'manual' });
      return patchNode(document, id, patch);
    }
    throw new CanvasError('此卡片字段不可编辑。');
  }
  const edge = document.edges.find(item => item.id === selected.id);
  if (!edge) throw new CanvasError('关系不存在。');
  if (key === 'relation') return (edge.label ?? '') === value ? document : patchEdge(document, edge.id, { label: value });
  if (key === 'direction') return readEdgeDirection(edge) === value ? document : patchEdge(document, edge.id, directionPatch(value as EdgeDirection));
  if (key === 'strokeWidth') {
    if (value === '') throw new CanvasError('请输入 0.5–8 之间的线重。');
    if (readEdgeStyle(edge).strokeWidth === Number(value)) return document;
    const { id, ...patch } = updateEdgeStyle(edge, { strokeWidth: Number(value) });
    return patchEdge(document, id, patch);
  }
  const choices: Record<string, readonly string[]> = { lineStyle: ['solid', 'dashed', 'dotted'], arrowShape: ['triangle', 'open', 'diamond', 'circle'] };
  if (choices[key] && !choices[key].includes(value)) throw new CanvasError('无效的连线样式。');
  if (!choices[key] && !['weight'].includes(key)) throw new CanvasError('此关系字段不可编辑。');
  const style = edge.paperstreamStyle;
  if (style !== undefined && (style === null || typeof style !== 'object' || Array.isArray(style))) throw new CanvasError('外观数据格式无效，原数据已保留。');
  const next = key === 'weight' ? Number(value) : value;
  if (key === 'weight' && (value === '' || !Number.isInteger(next) || Number(next) < 1 || Number(next) > 5)) throw new CanvasError('关系权重应为 1–5 的整数。');
  const current = style as Record<string, unknown> | undefined;
  if (current?.[key] === next) return document;
  return patchEdge(document, edge.id, { paperstreamStyle: { ...current, [key]: next } });
}
