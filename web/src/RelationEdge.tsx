import { memo, useLayoutEffect, useRef } from 'react';
import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath } from '@xyflow/react';
import type { Edge, EdgeProps } from '@xyflow/react';
import type { LabelRequest, Point } from './edge-label-layout';
import { InlineTextEditor } from './InlineTextEditor';

export interface EdgeLabelMeasurement extends LabelRequest { text: string }

export type RelationEdgeModel = Edge<{
  position?: Point;
  busy: boolean;
  onMeasure: (measurement: EdgeLabelMeasurement) => void;
  onSelect: (id: string) => void;
  editing: boolean;
  draft: string;
  onEdit: () => void;
  onDetails: (anchor: Point) => void;
  onChange: (value: string) => void;
  onApply: () => void;
  onCancel: () => void;
}, 'relation'>;

/** Keep the actual connection and arrowheads in SVG; place its HTML label in
 * nearby free space using the shared layout for every visible relation. */
export const RelationEdge = memo(function RelationEdge({
  id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition,
  markerStart, markerEnd, style, selected, label, data, interactionWidth,
}: EdgeProps<RelationEdgeModel>) {
  const [path, anchorX, anchorY] = getSmoothStepPath({
    sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition,
  });
  const group = useRef<SVGGElement>(null);
  const labelElement = useRef<HTMLDivElement>(null);
  const text = typeof label === 'string' ? label : '';
  const onMeasure = data?.onMeasure;

  useLayoutEffect(() => {
    const element = labelElement.current;
    if (!element || !text || !onMeasure) return;
    const measure = () => {
      if (!element.offsetWidth || !element.offsetHeight) return;
      const edgePath = group.current?.querySelector<SVGPathElement>('.react-flow__edge-path');
      const length = edgePath?.getTotalLength() ?? 0;
      const pathPoints: Point[] = [];
      if (edgePath && length > 0) {
        for (let part = 1; part < 10; part++) {
          const point = edgePath.getPointAtLength(length * part / 10);
          pathPoints.push({ x: point.x, y: point.y });
        }
      }
      // DOM layout dimensions stay in graph/CSS pixels at every zoom level.
      onMeasure({ id, text, width: element.offsetWidth + 1, height: element.offsetHeight + 1,
        anchor: { x: anchorX, y: anchorY }, pathPoints });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [id, text, path, anchorX, anchorY, onMeasure, data?.editing]);

  const position = data?.position;
  const displaced = position && Math.hypot(position.x - anchorX, position.y - anchorY) > 18;
  return <>
    <g ref={group}>
      <BaseEdge id={id} path={path} markerStart={markerStart} markerEnd={markerEnd}
        style={style} interactionWidth={interactionWidth} />
      {displaced && <path className="ps-relation-leader"
        d={`M ${anchorX} ${anchorY} L ${position.x} ${position.y}`} />}
    </g>
    {text && <EdgeLabelRenderer>
      <div ref={labelElement} data-edge-id={id}
        className={`ps-relation-label nodrag nopan${selected ? ' is-selected' : ''}`}
        style={{ transform: `translate(-50%, -50%) translate(${position?.x ?? anchorX}px, ${position?.y ?? anchorY}px)`,
          visibility: position ? 'visible' : 'hidden' }}
        onContextMenu={event => { event.preventDefault(); event.stopPropagation(); data?.onDetails({ x: event.clientX, y: event.clientY }); }}>
        {data?.editing ? <InlineTextEditor label="关系说明" value={data.draft}
          onChange={data.onChange} onCommit={data.onApply} onCancel={data.onCancel} />
          : <button type="button" className="ps-relation-text" disabled={data?.busy}
              aria-label={`编辑关系：${text}`} aria-pressed={Boolean(selected)} title="双击编辑；右键查看详情"
              onClick={event => { event.stopPropagation(); data?.onSelect(id); }}
              onDoubleClick={event => { event.stopPropagation(); data?.onEdit(); }}
              onKeyDown={event => {
                if (event.key === 'Enter' || event.key === 'F2') { event.preventDefault(); event.stopPropagation(); data?.onEdit(); }
                if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
                  event.preventDefault(); event.stopPropagation(); const rect = event.currentTarget.getBoundingClientRect();
                  data?.onDetails({ x: rect.right, y: rect.top });
                }
              }}>{text}</button>}
      </div>
    </EdgeLabelRenderer>}
  </>;
});
