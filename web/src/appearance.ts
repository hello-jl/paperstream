/** Optional presentation metadata, kept outside a paper's semantic JSON. */
import { CanvasError } from './canvas.ts';
import type { CanvasEdge, CanvasNode } from './canvas.ts';

export type HeightMode = 'auto' | 'manual';
export interface NodeAppearancePatch { strokeWidth?: number; heightMode?: HeightMode }
export interface EdgeAppearancePatch { strokeWidth?: number }

export const MIN_STROKE_WIDTH = 0.5;
export const MAX_STROKE_WIDTH = 8;
export const DEFAULT_NODE_STROKE_WIDTH = 1;
export const DEFAULT_EDGE_STROKE_WIDTH = 1.8;

type StyledItem = CanvasNode | CanvasEdge;

function isObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function validWidth(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
    && value >= MIN_STROKE_WIDTH && value <= MAX_STROKE_WIDTH;
}

function readStyle(item: StyledItem): Record<string, unknown> | null {
  return isObject(item.paperstreamStyle) ? item.paperstreamStyle : null;
}

/** Invalid extensions remain in the document; rendering uses safe defaults. */
export function getNodeStrokeWidth(node: CanvasNode): number {
  const width = readStyle(node)?.strokeWidth;
  return validWidth(width) ? width : DEFAULT_NODE_STROKE_WIDTH;
}

export function getEdgeStrokeWidth(edge: CanvasEdge): number {
  const width = readStyle(edge)?.strokeWidth;
  return validWidth(width) ? width : DEFAULT_EDGE_STROKE_WIDTH;
}

/** The caller decides which node types support automatic content height. */
export function getHeightMode(node: CanvasNode): HeightMode {
  return readStyle(node)?.heightMode === 'manual' ? 'manual' : 'auto';
}

function setAppearance<T extends StyledItem>(item: T, patch: NodeAppearancePatch, defaultWidth: number): T {
  const widthChanged = Object.hasOwn(patch, 'strokeWidth');
  const heightChanged = Object.hasOwn(patch, 'heightMode');
  if (!widthChanged && !heightChanged) return item;
  if (widthChanged && !validWidth(patch.strokeWidth)) {
    throw new CanvasError('线宽必须是 0.5 到 8 之间的有限数字。');
  }
  if (heightChanged && patch.heightMode !== 'auto' && patch.heightMode !== 'manual') {
    throw new CanvasError('卡片高度模式必须是 auto 或 manual。');
  }
  const hadStyle = Object.hasOwn(item, 'paperstreamStyle');
  if (hadStyle && !isObject(item.paperstreamStyle)) {
    throw new CanvasError('paperstreamStyle 不是有效对象，无法修改外观；原数据已保留。');
  }
  const style = { ...(readStyle(item) ?? {}) };
  if (widthChanged) {
    if (patch.strokeWidth === defaultWidth) delete style.strokeWidth;
    else style.strokeWidth = patch.strokeWidth;
  }
  if (heightChanged) {
    if (patch.heightMode === 'auto') delete style.heightMode;
    else style.heightMode = patch.heightMode;
  }
  // An existing empty object is retained so this result can also be composed
  // with patchNode/patchEdge, which merge fields instead of deleting them.
  if (!hadStyle && !Object.keys(style).length) return item;
  return { ...item, paperstreamStyle: style };
}

/** Preserve all other node fields and every unknown nested appearance field. */
export function setNodeAppearance(node: CanvasNode, patch: NodeAppearancePatch): CanvasNode {
  return setAppearance(node, patch, DEFAULT_NODE_STROKE_WIDTH);
}

/** Height configuration on an edge is unrelated metadata and remains intact. */
export function setEdgeAppearance(edge: CanvasEdge, patch: EdgeAppearancePatch): CanvasEdge {
  return setAppearance(edge, patch, DEFAULT_EDGE_STROKE_WIDTH);
}

export function readNodeStyle(node: CanvasNode): { strokeWidth: number; heightMode: HeightMode } {
  return { strokeWidth: getNodeStrokeWidth(node), heightMode: getHeightMode(node) };
}

export function readEdgeStyle(edge: CanvasEdge): { strokeWidth: number } {
  return { strokeWidth: getEdgeStrokeWidth(edge) };
}

export const updateNodeStyle = setNodeAppearance;
export const updateEdgeStyle = setEdgeAppearance;
