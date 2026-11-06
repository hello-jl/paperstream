import { memo, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { BaseEdge, EdgeLabelRenderer, useReactFlow, useViewport } from '@xyflow/react';
import type { Edge, EdgeProps } from '@xyflow/react';
import type { LabelRequest, Point } from './edge-label-layout';
import type { CanvasEdge } from './canvas';
import { edgeRoutingPatch, insertWaypoint, readEdgeRouting } from './edge-routing';
import type { EdgeRoutingUpdate } from './edge-routing';
import { InlineTextEditor } from './InlineTextEditor';
import { buildConnectionPath, connectionMidpoint, sampleConnectionPath } from './connection-path';
import { useAppearancePreferences } from './appearance-preferences';

export interface EdgeLabelMeasurement extends LabelRequest { text: string }

export type RelationEdgeModel = Edge<{
  position?: Point;
  raw?: CanvasEdge;
  onPatch?: (id: string, patch: Partial<CanvasEdge>) => void;
  busy: boolean;
  onMeasure: (measurement: EdgeLabelMeasurement) => void;
  onSelect: (id: string) => void;
  editing: boolean;
  draft: string;
  arrowShape?: string;
  lineStyle?: string;
  onEdit: () => void;
  onDetails: (anchor: Point) => void;
  onChange: (value: string) => void;
  onFinish: () => void;
}, 'relation'>;

/** The SVG connection passes through its opaque HTML relation label. */
export const RelationEdge = memo(function RelationEdge({
  id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition,
  markerStart, markerEnd, style, selected, label, data, interactionWidth,
}: EdgeProps<RelationEdgeModel>) {
  const { connectionStyle } = useAppearancePreferences();
  const flow = useReactFlow();
  const { zoom } = useViewport();
  const [preview, setPreview] = useState<EdgeRoutingUpdate | null>(null);
  const [error, setError] = useState('');
  const latest = useRef(data); latest.current = data;
  type Gesture = { pointerId: number; start: Point; clientStart: Point; origin: Point; mode: 'label' | 'waypoint'; index: number;
    controls: Point[]; moved: boolean; update: EdgeRoutingUpdate | null; element: Element; cleanup: () => void };
  const gesture = useRef<Gesture | null>(null);
  const routing = data?.raw ? readEdgeRouting(data.raw) : { waypoints: [] };
  const controls = preview?.waypoints ?? routing.waypoints;
  const geometry = { source: { x: sourceX, y: sourceY }, target: { x: targetX, y: targetY },
    sourceSide: sourcePosition, targetSide: targetPosition, waypoints: controls, style: connectionStyle };
  const base = buildConnectionPath(geometry);
  const center = connectionMidpoint(base);
  const anchorX = center.x, anchorY = center.y;
  const manualPosition = preview?.labelPosition ?? routing.labelPosition;
  const position = manualPosition ?? data?.position;
  const displayed = position && (label || data?.editing) ? buildConnectionPath({ ...geometry, labelPosition: position }) : base;
  const path = displayed.path, route = displayed.points;
  // Label placement must measure the unchanged base route; measuring the
  // detoured path would feed each new placement into the next layout pass.
  const basePath = base.path;
  const canAdjust = Boolean(data?.raw && data.onPatch && !data.busy && !data.editing);
  const patch = (update: EdgeRoutingUpdate) => {
    const current = latest.current;
    if (!current?.raw || !current.onPatch || current.busy) return;
    try { current.onPatch(id, edgeRoutingPatch(current.raw, update)); setError(''); }
    catch (err) { setError(err instanceof Error ? err.message : String(err)); }
  };
  const cancelGesture = () => {
    const current = gesture.current; if (!current) return;
    gesture.current = null; current.cleanup(); setPreview(null);
  };
  useEffect(() => () => { const current = gesture.current; gesture.current = null; current?.cleanup(); }, []);
  function begin(event: ReactPointerEvent<Element>, mode: 'label' | 'waypoint', index = -1, suppliedControls = controls, suppliedOrigin?: Point) {
    if (!canAdjust || event.button !== 0) return;
    // Keep normal click/double-click behavior for text; only the actual drag
    // suppresses defaults. SVG grips have no text-edit behavior to preserve.
    if (mode === 'waypoint') event.preventDefault();
    event.stopPropagation(); latest.current?.onSelect(id);
    cancelGesture();
    const start = flow.screenToFlowPosition({ x: event.clientX, y: event.clientY });
    const origin = suppliedOrigin ?? (mode === 'label' ? position ?? center : suppliedControls[index]);
    const element = event.currentTarget;
    const current: Gesture = { pointerId: event.pointerId, start, clientStart: { x: event.clientX, y: event.clientY }, origin,
      mode, index, controls: suppliedControls.map(point => ({ ...point })), moved: false, update: null, element, cleanup: () => {} };
    gesture.current = current;
    const move = (pointer: PointerEvent) => {
      if (gesture.current !== current || pointer.pointerId !== current.pointerId) return;
      if (Math.hypot(pointer.clientX - current.clientStart.x, pointer.clientY - current.clientStart.y) < 4 && !current.moved) return;
      pointer.preventDefault(); current.moved = true;
      const next = flow.screenToFlowPosition({ x: pointer.clientX, y: pointer.clientY });
      const point = { x: current.origin.x + next.x - current.start.x, y: current.origin.y + next.y - current.start.y };
      if (mode === 'label') current.update = { labelPosition: point };
      else current.update = { waypoints: current.controls.map((value, part) => part === current.index ? { ...value, ...point } : value) };
      setPreview(current.update);
    };
    const finish = (pointer: PointerEvent, commit: boolean) => {
      if (gesture.current !== current || pointer.pointerId !== current.pointerId) return;
      if (commit) move(pointer);
      gesture.current = null; current.cleanup(); setPreview(null);
      if (commit && current.moved && current.update) patch(current.update);
    };
    const up = (pointer: PointerEvent) => finish(pointer, true);
    const cancel = (pointer: PointerEvent) => finish(pointer, false);
    const blur = () => cancelGesture();
    current.cleanup = () => {
      window.removeEventListener('pointermove', move, true); window.removeEventListener('pointerup', up, true);
      window.removeEventListener('pointercancel', cancel, true); window.removeEventListener('blur', blur);
      if (element.hasPointerCapture?.(current.pointerId)) element.releasePointerCapture(current.pointerId);
    };
    window.addEventListener('pointermove', move, { capture: true, passive: false }); window.addEventListener('pointerup', up, true);
    window.addEventListener('pointercancel', cancel, true); window.addEventListener('blur', blur);
    try { element.setPointerCapture(event.pointerId); } catch { /* Window listeners also cover capture loss during reflow. */ }
  }
  function addWaypoint(point: Point) { patch({ waypoints: insertWaypoint(route, point) }); }
  const firstSegment = route.length > 1 ? { x: (route[0].x + route[1].x) / 2, y: (route[0].y + route[1].y) / 2 } : center;
  const addControl = firstSegment;
  const labelElement = useRef<HTMLDivElement>(null);
  const text = typeof label === 'string' ? label : '';
  const onMeasure = data?.onMeasure;

  useLayoutEffect(() => {
    const element = labelElement.current;
    if (!element || (!text && !data?.editing) || !onMeasure) return;
    const measure = () => {
      if (!element.offsetWidth || !element.offsetHeight) return;
      const pathPoints = sampleConnectionPath(base);
      // DOM layout dimensions stay in graph/CSS pixels at every zoom level.
      onMeasure({ id, text, width: element.offsetWidth + 1, height: element.offsetHeight + 1,
        anchor: { x: anchorX, y: anchorY }, pathPoints });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [id, text, basePath, anchorX, anchorY, onMeasure, data?.editing]);

  const instanceId = useId();
  const markerId = `ps-arrow-${instanceId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const arrow = data?.arrowShape ?? 'triangle';
  const custom = arrow !== 'triangle';
  return <>
    <g onDoubleClick={event => {
      if (!event.shiftKey || !canAdjust) return;
      event.preventDefault(); event.stopPropagation(); addWaypoint(flow.screenToFlowPosition({ x: event.clientX, y: event.clientY }));
    }}>
      <title>双击编辑关系；Shift + 双击连线添加折点</title>
      {custom && <defs><marker id={markerId} markerWidth="12" markerHeight="12" refX="10" refY="6" viewBox="0 0 12 12" orient="auto-start-reverse" markerUnits="userSpaceOnUse">
        {arrow === 'open' ? <path d="M1 1 L10 6 L1 11" fill="none" stroke={style?.stroke ?? '#70877e'} strokeWidth="1.8" />
          : arrow === 'diamond' ? <path d="M0 6 L5 1 L10 6 L5 11 Z" fill={style?.stroke ?? '#70877e'} />
          : <circle cx="6" cy="6" r="4" fill={style?.stroke ?? '#70877e'} />}
      </marker></defs>}
      <BaseEdge id={id} path={path} markerStart={custom && markerStart ? `url(#${markerId})` : markerStart} markerEnd={custom && markerEnd ? `url(#${markerId})` : markerEnd}
        style={style} interactionWidth={interactionWidth} />
      {selected && canAdjust && <g className="nodrag nopan">
        {controls.map((point, index) => <circle key={index} cx={point.x} cy={point.y} r={6 / zoom}
          fill="var(--ps-surface, white)" stroke={style?.stroke ?? '#70877e'} strokeWidth={1.5 / zoom}
          role="button" tabIndex={0} aria-label={`移动连线折点 ${index + 1}；双击移除`}
          style={{ cursor: 'grab', pointerEvents: 'all', touchAction: 'none' }}
          onPointerDown={event => begin(event, 'waypoint', index)}
          onDoubleClick={event => { event.preventDefault(); event.stopPropagation(); patch({ waypoints: controls.filter((_point, part) => part !== index) }); }}
          onKeyDown={event => {
            const movement = { ArrowLeft: [-10, 0], ArrowRight: [10, 0], ArrowUp: [0, -10], ArrowDown: [0, 10] }[event.key];
            if (movement) { event.preventDefault(); event.stopPropagation(); patch({ waypoints: controls.map((value, part) => part === index ? { ...value, x: value.x + movement[0], y: value.y + movement[1] } : value) }); }
            if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); event.stopPropagation(); patch({ waypoints: controls.filter((_point, part) => part !== index) }); }
          }}><title>拖动折点；双击或 Delete 移除</title></circle>)}
        <circle cx={addControl.x} cy={addControl.y} r={5 / zoom} fill="var(--ps-surface, white)" stroke={style?.stroke ?? '#70877e'}
          strokeWidth={1.5 / zoom} strokeDasharray={`${2 / zoom} ${2 / zoom}`} role="button" tabIndex={0}
          aria-label="拖动添加连线折点" style={{ cursor: 'move', pointerEvents: 'all', touchAction: 'none' }}
          onPointerDown={event => {
            const next = insertWaypoint(route, addControl), index = next.findIndex(point => point.x === addControl.x && point.y === addControl.y);
            begin(event, 'waypoint', index, next, addControl);
          }}
          onDoubleClick={event => { event.preventDefault(); event.stopPropagation(); addWaypoint(addControl); }}
          onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); addWaypoint(addControl); } }}>
          <title>拖动添加折点；也可 Shift + 双击路径</title>
        </circle>
      </g>}
    </g>
    {(text || data?.editing) && <EdgeLabelRenderer>
      <div ref={labelElement} data-edge-id={id}
        className={`ps-relation-label nodrag nopan${selected ? ' is-selected' : ''}`}
        style={{ transform: `translate(-50%, -50%) translate(${position?.x ?? anchorX}px, ${position?.y ?? anchorY}px)`,
          visibility: position || data?.editing ? 'visible' : 'hidden', cursor: canAdjust ? 'grab' : undefined,
          userSelect: data?.editing ? undefined : 'none' }}
        onPointerDown={event => { if (!(event.target as Element).closest('textarea, input, .ps-inline-actions')) begin(event, 'label'); }}
        onContextMenu={event => { event.preventDefault(); event.stopPropagation(); data?.onDetails({ x: event.clientX, y: event.clientY }); }}>
        {data?.editing ? <InlineTextEditor label="关系说明" value={data.draft}
          onChange={data.onChange} onFinish={data.onFinish} />
          : <button type="button" className="ps-relation-text" disabled={data?.busy}
              aria-label={`编辑关系：${text}`} aria-pressed={Boolean(selected)} title="拖动移动关系文字；双击编辑；右键查看详情"
              onClick={event => { event.stopPropagation(); data?.onSelect(id); }}
              onDoubleClick={event => { event.stopPropagation(); data?.onEdit(); }}
              onKeyDown={event => {
                const movement = { ArrowLeft: [-10, 0], ArrowRight: [10, 0], ArrowUp: [0, -10], ArrowDown: [0, 10] }[event.key];
                if (movement && canAdjust) { event.preventDefault(); event.stopPropagation(); const origin = position ?? center; patch({ labelPosition: { x: origin.x + movement[0], y: origin.y + movement[1] } }); }
                if (event.key === 'Enter' || event.key === 'F2') { event.preventDefault(); event.stopPropagation(); data?.onEdit(); }
                if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
                  event.preventDefault(); event.stopPropagation(); const rect = event.currentTarget.getBoundingClientRect();
                  data?.onDetails({ x: rect.right, y: rect.top });
                }
              }}>{text}</button>}
      </div>
    </EdgeLabelRenderer>}
    {error && <EdgeLabelRenderer><div role="alert" className="nodrag nopan" style={{ position: 'absolute', pointerEvents: 'all', background: '#fff7ed', color: '#9a3412', padding: 6, borderRadius: 5, fontSize: 12, transform: `translate(${anchorX}px, ${anchorY + 20}px)` }}>{error}</div></EdgeLabelRenderer>}
  </>;
});
