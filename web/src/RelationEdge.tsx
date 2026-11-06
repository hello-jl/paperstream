import { memo, useLayoutEffect, useRef } from 'react';
import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath } from '@xyflow/react';
import type { Edge, EdgeProps } from '@xyflow/react';
import type { LabelRequest, Point } from './edge-label-layout';

export interface EdgeLabelMeasurement extends LabelRequest { text: string }

export type RelationEdgeModel = Edge<{
  position?: Point;
  busy: boolean;
  onMeasure: (measurement: EdgeLabelMeasurement) => void;
  onSelect: (id: string) => void;
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
  const button = useRef<HTMLButtonElement>(null);
  const text = typeof label === 'string' ? label : '';
  const onMeasure = data?.onMeasure;

  useLayoutEffect(() => {
    const element = button.current;
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
  }, [id, text, path, anchorX, anchorY, onMeasure]);

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
      <button ref={button} type="button" data-edge-id={id}
        className={`ps-relation-label nodrag nopan${selected ? ' is-selected' : ''}`}
        aria-label={`编辑关系：${text}`} aria-pressed={Boolean(selected)} disabled={data?.busy}
        style={{ transform: `translate(-50%, -50%) translate(${position?.x ?? anchorX}px, ${position?.y ?? anchorY}px)`,
          visibility: position ? 'visible' : 'hidden' }}
        onClick={event => { event.stopPropagation(); data?.onSelect(id); }}>
        {text}
      </button>
    </EdgeLabelRenderer>}
  </>;
});
