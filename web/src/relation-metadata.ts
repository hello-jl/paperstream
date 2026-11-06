/** Human annotations describe a relation; they never infer causality or visual importance. */
import { CanvasError } from './canvas.ts';
import type { CanvasEdge } from './canvas.ts';
import { setEdgeAppearance } from './appearance.ts';

export const RELATION_TYPES = ['inheritance', 'comparison', 'support', 'contrast', 'other'] as const;
export type RelationType = typeof RELATION_TYPES[number];
export interface RelationMetadata {
  type?: RelationType;
  evidence: string;
  /** Undefined means not annotated; a missing weight does not imply weight 1. */
  weight?: number;
}
export interface RelationMetadataUpdate {
  type?: RelationType | null;
  evidence?: string;
  weight?: number | null;
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function validType(value: unknown): value is RelationType {
  return typeof value === 'string' && (RELATION_TYPES as readonly string[]).includes(value);
}
function validWeight(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 5;
}
function validEvidence(value: unknown): value is string {
  return typeof value === 'string' && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\ud800-\udfff]/u.test(value);
}

/** Unsupported values remain on the edge; controls show safe, unannotated values. */
export function readRelationMetadata(edge: CanvasEdge): RelationMetadata {
  const relation = record(edge.paperstreamRelation) ? edge.paperstreamRelation : {};
  const style = record(edge.paperstreamStyle) ? edge.paperstreamStyle : {};
  return {
    ...(validType(relation.type) ? { type: relation.type } : {}),
    evidence: validEvidence(relation.evidence) ? relation.evidence : '',
    ...(validWeight(style.weight) ? { weight: style.weight } : {}),
  };
}

/** Only the edited container is required to be understood; unrelated fields survive. */
export function relationMetadataPatch(edge: CanvasEdge, update: RelationMetadataUpdate): Partial<CanvasEdge> {
  if (Object.keys(update).some(key => !['type', 'evidence', 'weight'].includes(key))) {
    throw new CanvasError('关系标注只支持类型、证据和人工权重。');
  }
  const typeChanged = Object.hasOwn(update, 'type'), evidenceChanged = Object.hasOwn(update, 'evidence');
  const weightChanged = Object.hasOwn(update, 'weight');
  if (typeChanged && update.type !== null && !validType(update.type)) throw new CanvasError('请选择有效的关系类型，或清除分类。');
  if (evidenceChanged && !validEvidence(update.evidence)) throw new CanvasError('关系证据必须是有效的多行文本。');
  if (weightChanged && update.weight !== null && !validWeight(update.weight)) throw new CanvasError('人工关系权重必须是 1–5 的整数，或留空。');
  const patch: Partial<CanvasEdge> = {};
  if (typeChanged || evidenceChanged) {
    if (Object.hasOwn(edge, 'paperstreamRelation') && !record(edge.paperstreamRelation)) {
      throw new CanvasError('现有关系标注不是有效对象，无法修改；原数据已保留。');
    }
    const relation = { ...(record(edge.paperstreamRelation) ? edge.paperstreamRelation : {}) };
    if (typeChanged) {
      if (update.type === null) delete relation.type;
      else relation.type = update.type;
    }
    if (evidenceChanged) relation.evidence = update.evidence;
    patch.paperstreamRelation = relation;
  }
  if (weightChanged) {
    if (Object.hasOwn(edge, 'paperstreamStyle') && !record(edge.paperstreamStyle)) {
      throw new CanvasError('现有连线外观不是有效对象，无法修改权重；原数据已保留。');
    }
    const style = { ...(record(edge.paperstreamStyle) ? edge.paperstreamStyle : {}) };
    if (update.weight === null) delete style.weight;
    else style.weight = update.weight;
    patch.paperstreamStyle = style;
  }
  return patch;
}

/** An explicit, one-time visual convenience. Later weight/width edits stay independent. */
export function relationWeightStrokeWidth(weight: number): number {
  if (!validWeight(weight)) throw new CanvasError('请先填写 1–5 的人工关系权重。');
  return Math.round((0.8 + weight * 0.6) * 10) / 10;
}
export function relationWeightWidthPatch(edge: CanvasEdge): Partial<CanvasEdge> {
  const weight = readRelationMetadata(edge).weight;
  if (weight === undefined) throw new CanvasError('请先填写 1–5 的人工关系权重，再映射线宽。');
  return { paperstreamStyle: setEdgeAppearance(edge, { strokeWidth: relationWeightStrokeWidth(weight) }).paperstreamStyle };
}
