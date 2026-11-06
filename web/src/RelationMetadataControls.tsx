import { useState } from 'react';
import type { CanvasEdge } from './canvas';
import { readRelationMetadata, relationMetadataPatch, relationWeightStrokeWidth, relationWeightWidthPatch } from './relation-metadata';
import type { RelationMetadataUpdate, RelationType } from './relation-metadata';

export interface RelationMetadataControlsProps {
  edge: CanvasEdge;
  onPatch: (patch: Partial<CanvasEdge>) => void;
  disabled?: boolean;
}

/** Changes are immediate; the width mapping button performs one explicit operation. */
export function RelationMetadataControls({ edge, onPatch, disabled = false }: RelationMetadataControlsProps) {
  const [error, setError] = useState('');
  const value = readRelationMetadata(edge);
  function change(update: RelationMetadataUpdate) {
    try { onPatch(relationMetadataPatch(edge, update)); setError(''); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  }
  return <fieldset className="ps-relation-metadata" disabled={disabled}>
    <legend>关系含义与依据</legend>
    <label>关系类型<select aria-label="关系类型" value={value.type ?? ''} onChange={event => change({ type: event.target.value ? event.target.value as RelationType : null })}>
      <option value="">未分类</option><option value="inheritance">继承／改进</option><option value="comparison">方法比较</option><option value="support">支持</option><option value="contrast">对照／反驳</option><option value="other">其他</option>
    </select></label>
    <label>人工关系权重（1–5，可留空）<input aria-label="人工关系权重" type="number" min="1" max="5" step="1" value={value.weight ?? ''}
      onChange={event => change({ weight: event.target.value === '' ? null : Number(event.target.value) })} /></label>
    <p className="ps-muted">由你按当前论述标注关联的重要程度。1 较弱，5 较强；留空表示未评估。权重与关系线宽、论文边框分别保存。</p>
    <label>证据与说明<textarea aria-label="关系证据与说明" rows={4} value={value.evidence} placeholder={'记录原文引述、章节／页码、URL，或说明你的判断。\n每条依据可单独一行。'}
      onChange={event => change({ evidence: event.target.value })} /></label>
    <p className="ps-muted">引用关系本身不代表方法继承或因果；请为你的判断补充可核对的依据。</p>
    <button type="button" disabled={value.weight === undefined} onClick={() => {
      try { onPatch(relationWeightWidthPatch(edge)); setError(''); }
      catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    }}>按权重映射线宽{value.weight === undefined ? '' : ` · ${relationWeightStrokeWidth(value.weight)} px`}</button>
    <p className="ps-muted">仅修改这条关系当前的线宽；之后仍可分别调整。</p>
    {error && <p role="alert">{error}</p>}
  </fieldset>;
}
