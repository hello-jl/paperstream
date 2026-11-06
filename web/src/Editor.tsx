import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Background, ConnectionMode, ControlButton, Controls, Handle, MarkerType, NodeResizer,
  Position, ReactFlow, ReactFlowProvider, applyNodeChanges, useReactFlow,
} from '@xyflow/react';
import type { Connection, Node, NodeProps, OnNodesChange } from '@xyflow/react';
import {
  addEdge, addNode, createCanvas, createEdge, createPaperNode, parseCanvas,
  patchEdge, patchNode, readPaper, removeEdge, removeNode, serializeCanvas, updatePaper,
} from './canvas';
import type { CanvasEdge, CanvasNode, JSONCanvasDocument, PaperFields } from './canvas';
import { downloadFile, hasFilePicker, pickFile, pickSaveFile, writeFile } from './files';
import type { LocalFileHandle } from './files';
import { RelationEdge } from './RelationEdge';
import type { EdgeLabelMeasurement, RelationEdgeModel } from './RelationEdge';
import { getContentBounds, layoutEdgeLabels } from './edge-label-layout';
import { readNodeStyle, readEdgeStyle, updateNodeStyle, updateEdgeStyle } from './appearance';
import { InlineTextEditor } from './InlineTextEditor';
import { placePopover } from './popover-layout';
import type { PopoverPoint } from './popover-layout';
import { directionPatch, readEdgeDirection } from './edge-direction';
import type { EdgeDirection } from './edge-direction';
import { WorkspaceTabs } from './WorkspaceTabs';
import type { TabMetadata } from './WorkspaceTabs';
import { CardBody, FigureControls } from './CardBody';
import { layoutVertical } from './graph-layout';
import { createRelationNode, promoteEdgeRelation, isRelationNode } from './graph-relations';
import { downloadGraph } from './graph-export';
import { zoomAt, wheelStroke, wheelIntent } from './wheel-controls';
import '@xyflow/react/dist/style.css';
import './editor.css';

type Selection = { kind: 'node' | 'edge'; id: string } | { kind: 'new' } | {
  kind: 'connection'; source: string; target: string; fromSide?: CanvasEdge['fromSide']; toSide?: CanvasEdge['toSide'];
} | null;
type FormValues = Record<string, string>;
type InlineField = 'alias' | 'takeaway' | 'relation' | 'text' | 'label';
type InlineBaseline = { value: string; wasDirty: boolean };
type EditActions = {
  edit: (selection: Selection, field: InlineField) => void;
  details: (selection: Selection, anchor: PopoverPoint) => void;
  field: (key: string, value: string) => void;
  apply: () => void;
  cancel: () => void;
  patch: (id: string, patch: Partial<CanvasNode>) => void;
  openUrl: (url: string) => void;
};
type CardNode = Node<{
  raw: CanvasNode;
  busy: boolean;
  measurePass: number;
  startInteraction: () => void;
  fitHeight: (node: CanvasNode, height: number, persist: boolean) => void;
  resize: (id: string, width: number, height: number, x: number, y: number) => void;
  editing: InlineField | null;
  draft: FormValues | null;
  actions: EditActions;
}, 'paper'>;

const colors: Record<string, string> = {
  '1': '#c44848', '2': '#bb722f', '3': '#a58c25',
  '4': '#3e886c', '5': '#388c9d', '6': '#8b6cb2',
};
function color(value?: string) { return value ? colors[value] ?? value : undefined; }
function title(node: CanvasNode): string {
  return readPaper(node)?.alias ?? node.label ?? node.file ?? node.url ?? node.text?.slice(0, 80) ?? '卡片';
}
function message(error: unknown) { return error instanceof Error ? error.message : String(error); }

const PaperCard = memo(function PaperCard({ id, data, selected }: NodeProps<CardNode>) {
  const paper = readPaper(data.raw);
  const appearance = readNodeStyle(data.raw);
  const content = useRef<HTMLDivElement>(null);
  const resizing = useRef(false);
  const floorHeight = isRelationNode(data.raw) ? 44 : 100;
  const [minimumHeight, setMinimumHeight] = useState(floorHeight);
  // offsetHeight is in unscaled CSS pixels, unlike getBoundingClientRect().
  // Measure a natural-height child so stored height cannot feed back into its
  // own measurement. Include the user-selected border and one rounding pixel.
  const contentHeight = () => content.current?.offsetWidth
    ? Math.max(floorHeight, Math.ceil(content.current.offsetHeight + 2 * appearance.strokeWidth + 1)) : floorHeight;
  useLayoutEffect(() => {
    const element = content.current;
    if (!element) return;
    const measure = () => {
      if (!element.offsetWidth) return;
      const height = contentHeight();
      setMinimumHeight(previous => previous === height ? previous : height);
      data.fitHeight(data.raw, height, !resizing.current && !data.busy && !data.editing);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [data.raw, data.busy, data.fitHeight, data.measurePass, data.editing]);
  const editNote = (field: 'label' | 'text', value: string) => data.editing === field
    ? <InlineTextEditor label={field === 'label' ? '标题' : '内容'} value={data.draft?.[field] ?? value} multiline={field === 'text'} required={false} onChange={value => data.actions.field(field, value)} onCommit={data.actions.apply} onCancel={data.actions.cancel} />
    : <span className="ps-editable-text" role="button" tabIndex={0} onDoubleClick={event => { event.stopPropagation(); data.actions.edit({ kind: 'node', id }, field); }} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); data.actions.edit({ kind: 'node', id }, field); } }}>{value || (field === 'label' ? '无标题' : '双击编辑')}</span>;
  const editText = (field: 'alias' | 'takeaway', value: string) => data.editing === field
    ? <InlineTextEditor label={field === 'alias' ? '简称' : '核心认识'} value={data.draft?.[field] ?? value}
        multiline={field === 'takeaway'} onChange={value => data.actions.field(field, value)}
        onCommit={data.actions.apply} onCancel={data.actions.cancel} />
    : <span className="ps-editable-text" role="button" tabIndex={data.busy ? -1 : 0}
        title="双击编辑；键盘 Enter 编辑" aria-label={`编辑${field === 'alias' ? '简称' : '核心认识'}：${value}`}
        onDoubleClick={event => { event.stopPropagation(); data.actions.edit({ kind: 'node', id }, field); }}
        onKeyDown={event => { if (event.key === 'Enter' || event.key === 'F2') {
          event.preventDefault(); event.stopPropagation(); data.actions.edit({ kind: 'node', id }, field);
        } }}>{data.draft?.[field] ?? value}</span>;
  return <div className={`ps-card ${data.raw.type === 'group' ? 'ps-group' : ''}${paper?.year ? ' has-year' : ''}${isRelationNode(data.raw) ? ' ps-shared-relation' : ''}`}
    style={{ borderColor: color(data.raw.color), borderWidth: appearance.strokeWidth, minHeight: minimumHeight }}>
    <NodeResizer isVisible={selected && !data.busy && !data.editing} minWidth={160} minHeight={minimumHeight}
      onResizeStart={() => { resizing.current = true; data.startInteraction(); }}
      onResizeEnd={(_event, size) => {
        resizing.current = false;
        data.resize(id, size.width, Math.max(size.height, contentHeight()), size.x, size.y);
      }} />
    {Object.values(Position).map(side => <Handle key={side} id={side} type="source" position={side} />)}
    <button className="ps-card-settings nodrag nopan" type="button" disabled={data.busy}
      aria-label={`${title(data.raw)}的详情`} title="论文详情（也可右键）"
      onPointerDown={event => event.stopPropagation()}
      onClick={event => {
        event.stopPropagation(); const rect = event.currentTarget.getBoundingClientRect();
        data.actions.details({ kind: 'node', id }, { x: rect.right, y: rect.top });
      }}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9.5 3-.5 2.1-1.8 1-2.1-.6-2.5 4.3 1.6 1.5v2L2.6 15l2.5 4.3 2.1-.6 1.8 1 .5 2.3h5l.5-2.3 1.8-1 2.1.6 2.5-4.3-1.6-1.7v-2l1.6-1.5-2.5-4.3-2.1.6-1.8-1-.5-2.1h-5Z" /><circle cx="12" cy="12.5" r="3" /></svg></button>
    <div className="ps-card-content" ref={content}>
      <CardBody node={data.raw} paper={paper} editing={data.editing} draft={data.draft} editText={editText} editNote={editNote}
        selected={selected} busy={data.busy} onPatchNode={patch => data.actions.patch(id, patch)} onOpenUrl={data.actions.openUrl} />
      {paper?.year && <span className="ps-card-year">{paper.year}</span>}
    </div>
  </div>;
});
const nodeTypes = { paper: PaperCard };
const edgeTypes = { relation: RelationEdge };

function initialState(key: string) {
  const empty = { ...createCanvas(), paperstreamLayout: 'vertical' };
  const fallback = { canvas: empty, fileName: 'papers.canvas', saved: serializeCanvas(empty), selection: null as Selection,
    form: {} as FormValues, formDirty: false, inlineField: null as InlineField | null,
    inlineBaseline: null as InlineBaseline | null, restored: false };
  try {
    const text = sessionStorage.getItem(key);
    if (!text) return fallback;
    const draft = JSON.parse(text);
    const canvas = parseCanvas(JSON.stringify(draft.canvas));
    const form = draft.form && Object.values(draft.form).every(v => typeof v === 'string') ? draft.form as FormValues : {};
    const candidate = draft.selection as Selection;
    let selection: Selection = null;
    if (candidate?.kind === 'new') selection = candidate;
    if (candidate?.kind === 'node' && canvas.nodes.some(n => n.id === candidate.id)) selection = candidate;
    if (candidate?.kind === 'edge' && canvas.edges.some(e => e.id === candidate.id)) selection = candidate;
    if (candidate?.kind === 'connection' && typeof candidate.source === 'string' && typeof candidate.target === 'string') selection = candidate;
    const inlineField: InlineField | null = selection?.kind === 'node' && readPaper(canvas.nodes.find(n => n.id === selection.id)!)
      && (draft.inlineField === 'alias' || draft.inlineField === 'takeaway') ? draft.inlineField
      : selection?.kind === 'edge' && draft.inlineField === 'relation' ? 'relation' : null;
    const inlineBaseline: InlineBaseline | null = inlineField && typeof draft.inlineBaseline?.value === 'string'
      && typeof draft.inlineBaseline?.wasDirty === 'boolean' ? draft.inlineBaseline : null;
    // A draft is convenience recovery, never authority to overwrite a file.
    return { ...fallback, canvas, fileName: typeof draft.fileName === 'string' ? draft.fileName : fallback.fileName,
      saved: typeof draft.saved === 'string' ? draft.saved : fallback.saved,
      selection, form, formDirty: Boolean(selection && draft.formDirty), inlineField, inlineBaseline, restored: true };
  } catch { return fallback; }
}

export interface PaperstreamEditorProps { draftKey?: string; loadTheme?: () => Promise<'sage' | 'paper' | 'night'>; saveTheme?: (theme: 'sage' | 'paper' | 'night') => Promise<void>; openExternal?: (url: string) => Promise<void> }

/** Both standalone and DSH mount the same editor; persistence stays in .canvas. */
export function PaperstreamEditor({ draftKey = 'paperstream-browser-draft-v1', loadTheme, saveTheme, openExternal }: PaperstreamEditorProps) {
  return <WorkspaceTabs draftKey={draftKey} loadTheme={loadTheme} saveTheme={saveTheme}>{(key, onMeta) => <ReactFlowProvider><Editor draftKey={key} onMeta={onMeta} openExternal={openExternal} /></ReactFlowProvider>}</WorkspaceTabs>;
}

function Editor({ draftKey, onMeta, openExternal }: { draftKey: string; onMeta: (meta: TabMetadata) => void; openExternal?: (url: string) => Promise<void> }) {
  const [initial] = useState(() => initialState(draftKey));
  const [canvas, setCanvas] = useState(initial.canvas);
  const current = useRef(canvas);
  current.current = canvas;
  const [past, setPast] = useState<JSONCanvasDocument[]>([]);
  const [future, setFuture] = useState<JSONCanvasDocument[]>([]);
  const [selection, setSelection] = useState<Selection>(initial.selection);
  const selectionRef = useRef(selection);
  selectionRef.current = selection;
  const changeSelection = useCallback((next: Selection) => {
    selectionRef.current = next;
    setSelection(next);
  }, []);
  const selectRef = useRef<(next: Selection) => boolean>(() => false);
  const [form, setForm] = useState<FormValues>(initial.form);
  const [formDirty, setFormDirty] = useState(initial.formDirty);
  const [inlineField, setInlineField] = useState<InlineField | null>(initial.inlineField);
  const [inlineBaseline, setInlineBaseline] = useState<InlineBaseline | null>(initial.inlineBaseline);
  const [detailsAnchor, setDetailsAnchor] = useState<PopoverPoint | null>(initial.formDirty && !initial.inlineField
    ? { x: window.innerWidth / 2, y: window.innerHeight / 3 } : null);
  const [detailsPosition, setDetailsPosition] = useState({ x: 12, y: 12 });
  const [workspaceSize, setWorkspaceSize] = useState({ width: 800, height: 600 });
  const workspace = useRef<HTMLDivElement>(null);
  const details = useRef<HTMLElement>(null);
  const actionsRef = useRef<EditActions>({ edit: () => {}, details: () => {}, field: () => {}, apply: () => {}, cancel: () => {}, patch: () => {}, openUrl: () => {} });
  const actions = useMemo<EditActions>(() => ({
    edit: (...args) => actionsRef.current.edit(...args), details: (...args) => actionsRef.current.details(...args),
    field: (...args) => actionsRef.current.field(...args), apply: () => actionsRef.current.apply(), cancel: () => actionsRef.current.cancel(), patch: (...args) => actionsRef.current.patch(...args), openUrl: url => actionsRef.current.openUrl(url),
  }), []);
  const [fileName, setFileName] = useState(initial.fileName);
  const [saved, setSaved] = useState(initial.saved);
  const file = useRef<{ handle: LocalFileHandle; snapshot: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(initial.restored ? '已恢复本标签页的草稿。保存到文件后才能长期保留。' : '打开一张关系图，或新增第一篇论文。');
  const [error, setError] = useState('');
  const [focusId, setFocusId] = useState<string | null>(null);
  const [nodes, setNodes] = useState<CardNode[]>([]);
  const [contentHeights, setContentHeights] = useState<Record<string, number>>({});
  const [labelMeasurements, setLabelMeasurements] = useState<Map<string, EdgeLabelMeasurement>>(() => new Map());
  const interacting = useRef(false);
  const pendingInitialFit = useRef(true);
  const [measurePass, setMeasurePass] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const flow = useReactFlow<CardNode>();
  const source = useMemo(() => serializeCanvas(canvas), [canvas]);
  const dirty = source !== saved || formDirty;
  const [connectSource, setConnectSource] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [createMenu, setCreateMenu] = useState<PopoverPoint | null>(null);
  useEffect(() => onMeta({ fileName, dirty }), [fileName, dirty, onMeta]);

  useEffect(() => {
    try { sessionStorage.setItem(draftKey, JSON.stringify({ canvas, fileName, saved, selection, form, formDirty, inlineField, inlineBaseline })); }
    catch { setNotice('浏览器无法保存临时草稿，请及时保存或下载文件。'); }
  }, [canvas, fileName, saved, selection, form, formDirty, inlineField, inlineBaseline, draftKey]);
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (dirty) { event.preventDefault(); event.returnValue = ''; }
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [dirty]);
  useLayoutEffect(() => {
    const area = workspace.current;
    if (!area) return;
    const measure = () => setWorkspaceSize({ width: area.clientWidth, height: area.clientHeight });
    measure();
    const observer = new ResizeObserver(measure); observer.observe(area);
    return () => observer.disconnect();
  }, []);
  useLayoutEffect(() => {
    const panel = details.current, area = workspace.current;
    if (!detailsAnchor || !panel || !area) return;
    const position = () => {
      const bounds = area.getBoundingClientRect();
      const next = placePopover({ x: detailsAnchor.x - bounds.left, y: detailsAnchor.y - bounds.top },
        { width: panel.offsetWidth, height: panel.offsetHeight }, { width: area.clientWidth, height: area.clientHeight });
      setDetailsPosition(previous => previous.x === next.x && previous.y === next.y ? previous : next);
    };
    position();
    const observer = new ResizeObserver(position); observer.observe(panel); observer.observe(area);
    return () => observer.disconnect();
  }, [detailsAnchor, workspaceSize]);
  useEffect(() => {
    if (detailsAnchor) details.current?.querySelector<HTMLElement>('.ps-inspector-heading')?.focus();
  }, [detailsAnchor]);

  const wheelGesture = useRef<{ key: string; time: number } | null>(null);
  const commit = useCallback((next: JSONCanvasDocument) => {
    wheelGesture.current = null;
    if (JSON.stringify(next) === JSON.stringify(current.current)) return;
    serializeCanvas(next); // Validate before replacing the in-memory document.
    const previous = current.current;
    setPast(items => [...items.slice(-49), previous]);
    setFuture([]);
    current.current = next;
    setCanvas(next);
    setError('');
  }, []);
  const startInteraction = useCallback(() => {
    interacting.current = true;
    pendingInitialFit.current = false;
  }, []);
  const finishInteraction = useCallback(() => {
    interacting.current = false;
    setMeasurePass(pass => pass + 1);
  }, []);
  const fitHeight = useCallback((measuredNode: CanvasNode, height: number, persist: boolean) => {
    // Ignore measurements from a deleted/replaced/edited node. Height changes
    // are part of the current edit, not another undo step or a new redo branch.
    const node = current.current.nodes.find(item => item.id === measuredNode.id);
    if (node !== measuredNode) return;
    // Labels also avoid natural content that has grown during a resize, before
    // that gesture commits the card's final dimensions to the document.
    setContentHeights(previous => previous[node.id] === height ? previous : { ...previous, [node.id]: height });
    const automatic = (Boolean(readPaper(node)) || Boolean(node.paperstreamCard)) && readNodeStyle(node).heightMode === 'auto';
    const nextHeight = automatic ? height : Math.max(node.height, height);
    if (!persist || interacting.current || nextHeight === node.height) return;
    try {
      let next = patchNode(current.current, node.id, { height: nextHeight });
      if (next.paperstreamLayout === 'vertical') next = layoutVertical(next);
      current.current = next;
      setCanvas(next);
    } catch (err) { setError(message(err)); }
  }, []);
  const resize = useCallback((id: string, width: number, height: number, x: number, y: number) => {
    finishInteraction();
    if (busy) return;
    try {
      const node = current.current.nodes.find(item => item.id === id)!;
      const { id: _id, ...styled } = readPaper(node) || node.paperstreamCard ? updateNodeStyle(node, { heightMode: 'manual' }) : node;
      commit({ ...patchNode(current.current, id, { ...styled, width: Math.round(width), height: Math.round(height), x: Math.round(x), y: Math.round(y) }), paperstreamLayout: 'manual' });
      if (selectionRef.current?.kind === 'node' && selectionRef.current.id === id) {
        setForm(values => ({ ...values, heightMode: 'manual' }));
      }
    }
    catch (err) { setError(message(err)); }
  }, [commit, busy, finishInteraction]);
  const visible = useMemo(() => {
    if (!focusId || !canvas.nodes.some(node => node.id === focusId)) return new Set(canvas.nodes.map(node => node.id));
    const ids = new Set([focusId]);
    for (const edge of canvas.edges) {
      if (edge.fromNode === focusId) ids.add(edge.toNode);
      if (edge.toNode === focusId) ids.add(edge.fromNode);
    }
    return ids;
  }, [canvas, focusId]);
  useEffect(() => {
    setNodes(canvas.nodes.map((node, index) => ({
      id: node.id, type: 'paper', position: { x: node.x, y: node.y },
      width: node.width, height: node.height, style: { width: node.width, height: node.height },
      data: { raw: node, resize, busy, fitHeight, startInteraction, measurePass, actions, editing: null, draft: null },
      selected: false,
      hidden: !visible.has(node.id), zIndex: index,
    })));
  }, [canvas, visible, resize, busy, fitHeight, startInteraction, measurePass, actions]);
  // Controlled input values must reach React Flow in this render. Mirroring
  // form into nodes via an effect leaves the textarea one event behind and
  // React can restore an old value between rapidly dispatched keystrokes.
  const renderedNodes = useMemo(() => nodes.map(node => {
    const selected = selection?.kind === 'node' && selection.id === node.id;
    return { ...node, selected, data: { ...node.data,
      editing: selected ? inlineField : null, draft: selected && inlineField ? form : null } };
  }), [nodes, selection, inlineField, form]);
  const measureLabel = useCallback((measurement: EdgeLabelMeasurement) => {
    setLabelMeasurements(previous => {
      if (JSON.stringify(previous.get(measurement.id)) === JSON.stringify(measurement)) return previous;
      const next = new Map(previous);
      next.set(measurement.id, measurement);
      return next;
    });
  }, []);
  useEffect(() => {
    const ids = new Set(canvas.edges.map(edge => edge.id));
    setLabelMeasurements(previous => {
      const retained = new Map([...previous].filter(([id]) => ids.has(id)));
      return retained.size === previous.size ? previous : retained;
    });
  }, [canvas.edges]);
  const selectEdgeLabel = useCallback((id: string) => { selectRef.current({ kind: 'edge', id }); }, []);
  const visibleCardBounds = useMemo(() => nodes.filter(node => !node.hidden).map(node => ({
    x: node.position.x, y: node.position.y,
    width: node.width ?? node.data.raw.width,
    height: Math.max(node.height ?? node.data.raw.height, contentHeights[node.id] ?? 0),
  })), [nodes, contentHeights]);
  const labelPositions = useMemo(() => {
    const labels = canvas.edges.flatMap(edge => {
      if (!edge.label || !visible.has(edge.fromNode) || !visible.has(edge.toNode)) return [];
      const measurement = labelMeasurements.get(edge.id);
      return measurement?.text === edge.label ? [measurement] : [];
    });
    return layoutEdgeLabels(labels, visibleCardBounds);
  }, [canvas.edges, visible, visibleCardBounds, labelMeasurements]);
  const contentBounds = useMemo(() => getContentBounds([
    ...visibleCardBounds,
    ...[...labelPositions].flatMap(([id, position]) => {
      const label = labelMeasurements.get(id);
      return label ? [{ x: position.x - label.width / 2, y: position.y - label.height / 2,
        width: label.width, height: label.height }] : [];
    }),
  ]), [visibleCardBounds, labelPositions, labelMeasurements]);
  const fitContent = useCallback(() => {
    pendingInitialFit.current = false;
    if (contentBounds) void flow.fitBounds(contentBounds, { padding: 0.15, duration: 0 });
  }, [flow, contentBounds]);
  useEffect(() => {
    if (!pendingInitialFit.current) return;
    if (!canvas.nodes.length) { pendingInitialFit.current = false; return; }
    // Wait for the new document, natural card sizes and HTML labels to agree.
    // A pair of frames lets path/label measurement settle before the one-time
    // fit. Later dragging and label movement never change the user's viewport.
    if (canvas.nodes.some(raw => visible.has(raw.id) && (!nodes.some(node => node.data.raw === raw)
      || contentHeights[raw.id] === undefined))) return;
    if (canvas.edges.some(edge => edge.label && visible.has(edge.fromNode) && visible.has(edge.toNode)
      && !labelPositions.has(edge.id))) return;
    let secondFrame = 0;
    const firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => {
        if (pendingInitialFit.current && !interacting.current) fitContent();
      });
    });
    return () => { cancelAnimationFrame(firstFrame); cancelAnimationFrame(secondFrame); };
  }, [canvas, nodes, visible, contentHeights, labelPositions, fitContent]);
  const edges = useMemo<RelationEdgeModel[]>(() => canvas.edges.map(edge => ({
    id: edge.id, source: edge.fromNode, target: edge.toNode,
    sourceHandle: edge.fromSide ?? 'bottom', targetHandle: edge.toSide ?? 'top',
    label: edge.label, type: 'relation', animated: false,
    data: { position: labelPositions.get(edge.id), busy, onMeasure: measureLabel, onSelect: selectEdgeLabel,
      editing: selection?.kind === 'edge' && selection.id === edge.id && inlineField === 'relation',
      arrowShape: edgeSettings(edge).arrowShape, lineStyle: edgeSettings(edge).lineStyle,
      draft: form.relation ?? '', onEdit: () => actions.edit({ kind: 'edge', id: edge.id }, 'relation'),
      onDetails: anchor => actions.details({ kind: 'edge', id: edge.id }, anchor),
      onChange: value => actions.field('relation', value), onApply: actions.apply, onCancel: actions.cancel },
    markerStart: edge.fromEnd === 'arrow' ? { type: MarkerType.ArrowClosed } : undefined,
    markerEnd: edge.toEnd !== 'none' ? { type: MarkerType.ArrowClosed } : undefined,
    style: { stroke: color(edge.color) ?? '#70877e', strokeWidth: readEdgeStyle(edge).strokeWidth, strokeDasharray: edgeSettings(edge).lineStyle === 'dashed' ? '8 5' : edgeSettings(edge).lineStyle === 'dotted' ? '2 5' : undefined },
    selected: selection?.kind === 'edge' && selection.id === edge.id,
    hidden: !visible.has(edge.fromNode) || !visible.has(edge.toNode),
  })), [canvas, visible, selection, labelPositions, busy, measureLabel, selectEdgeLabel, actions, inlineField, form.relation]);
  const onNodesChange: OnNodesChange<CardNode> = useCallback(changes => {
    // Deletion is explicit in the inspector; filtering never mutates stored nodes.
    setNodes(items => applyNodeChanges(changes.filter(change => change.type !== 'remove' && change.type !== 'select'), items));
    if (busy) return;
    // Keyboard movements also arrive here and do not emit onNodeDragStop.
    let next = current.current;
    try {
      for (const change of changes) {
        // Resizer position changes omit dragging; it commits geometry in resize().
        if (change.type === 'position' && change.position && change.dragging === false) {
          next = patchNode(next, change.id, { x: Math.round(change.position.x), y: Math.round(change.position.y) });
        }
      }
      commit(next);
    } catch (err) { setError(message(err)); }
  }, [busy, commit]);
  // Explicit card/edge actions own selection. Mirroring React Flow's selection
  // observer back into this state replays stale controlled nodes while switching
  // to a label or a new form, and can silently replace the current form.

  function discardForm() { return !formDirty || window.confirm('还有未应用的文字或详情修改。放弃这些修改吗？'); }
  function valuesFor(next: Selection): FormValues {
    if (next?.kind === 'node') {
      const node = current.current.nodes.find(item => item.id === next.id)!;
      const paper = readPaper(node);
      return paper ? { alias: paper.alias, takeaway: paper.takeaway, name: paper.name ?? '', url: paper.url ?? '', year: paper.year?.toString() ?? '',
        strokeWidth: String(readNodeStyle(node).strokeWidth), heightMode: readNodeStyle(node).heightMode } : { text: node.text ?? '', label: node.label ?? '', strokeWidth: String(readNodeStyle(node).strokeWidth), heightMode: readNodeStyle(node).heightMode };
    }
    if (next?.kind === 'edge') {
      const edge = current.current.edges.find(item => item.id === next.id)!;
      return { relation: edge.label ?? '', strokeWidth: String(readEdgeStyle(edge).strokeWidth), direction: readEdgeDirection(edge), ...edgeSettings(edge) };
    }
    if (next?.kind === 'connection') return { relation: '', source: next.source, target: next.target, strokeWidth: '1.8', direction: 'forward' };
    return { alias: '', takeaway: '', name: '', url: '', year: '', strokeWidth: '1', heightMode: 'auto' };
  }
  function select(next: Selection, alreadyConfirmed = false) {
    if (next?.kind === 'node' && !current.current.nodes.some(node => node.id === next.id)) return false;
    if (next?.kind === 'edge' && !current.current.edges.some(edge => edge.id === next.id)) return false;
    if (JSON.stringify(next) === JSON.stringify(selectionRef.current)) return true;
    if (busy || (!alreadyConfirmed && !discardForm())) return false;
    changeSelection(next);
    setFormDirty(false);
    setInlineField(null); setInlineBaseline(null); setDetailsAnchor(null);
    setError('');
    setForm(valuesFor(next));
    return true;
  }
  selectRef.current = select;
  function defaultAnchor() {
    const rect = workspace.current?.getBoundingClientRect();
    return { x: rect ? rect.left + rect.width / 2 : window.innerWidth / 2,
      y: rect ? rect.top + rect.height / 3 : window.innerHeight / 3 };
  }
  function showDetails(next: Selection, anchor = defaultAnchor()) {
    if (busy || !select(next)) return;
    setInlineField(null); setInlineBaseline(null); setDetailsAnchor(anchor);
  }
  function startInline(next: Selection, key: InlineField) {
    const sameSelection = JSON.stringify(next) === JSON.stringify(selectionRef.current);
    if (sameSelection && inlineField === key) return;
    if (busy || !select(next)) return;
    setInlineBaseline({ value: sameSelection ? form[key] ?? '' : valuesFor(next)[key] ?? '', wasDirty: sameSelection && formDirty });
    setDetailsAnchor(null); setInlineField(key);
  }
  function cancelInline() {
    if (!inlineField) return;
    const stored = valuesFor(selectionRef.current);
    const value = inlineBaseline?.value ?? stored[inlineField] ?? '';
    const wasDirty = inlineBaseline?.wasDirty ?? Object.keys(form).some(key => key !== inlineField && form[key] !== stored[key]);
    setForm(values => ({ ...values, [inlineField]: value })); setFormDirty(wasDirty);
    setInlineField(null); setInlineBaseline(null); setError('');
    // Earlier fields may already have a draft. Make those edits visible after
    // cancelling only this field, instead of silently discarding them.
    if (wasDirty) setDetailsAnchor(defaultAnchor());
  }
  function closeDetails() {
    if (busy || !discardForm()) return;
    setForm(valuesFor(selectionRef.current)); setFormDirty(false); setInlineField(null); setInlineBaseline(null); setError('');
    setDetailsAnchor(null);
  }
  function field(key: string, value: string) {
    setForm(values => ({ ...values, [key]: value }));
    setFormDirty(true);
  }
  function apply() {
    if (!selection || busy) return;
    try {
      let next = current.current;
      if (selection.kind === 'new' || (selection.kind === 'node' && readPaper(canvas.nodes.find(n => n.id === selection.id)!))) {
        const fields: PaperFields = { alias: form.alias, takeaway: form.takeaway, name: form.name || null, url: form.url || null,
          year: form.year ? Number(form.year) : null };
        if (selection.kind === 'new') {
          const position = flow.screenToFlowPosition({ x: window.innerWidth * 0.4, y: window.innerHeight * 0.4 });
          const node = updateNodeStyle(createPaperNode(fields, { x: Math.round(position.x), y: Math.round(position.y) }), {
            strokeWidth: Number(form.strokeWidth ?? 1), heightMode: form.heightMode === 'manual' ? 'manual' : 'auto',
          });
          next = addNode(next, node);
          changeSelection({ kind: 'node', id: node.id });
          setFocusId(null);
        } else {
          next = updatePaper(next, selection.id, fields);
          const node = next.nodes.find(item => item.id === selection.id)!;
          const previousStyle = readNodeStyle(node);
          const { id: nodeId, ...nodePatch } = updateNodeStyle(node, {
            ...(form.strokeWidth !== undefined && Number(form.strokeWidth) !== previousStyle.strokeWidth ? { strokeWidth: Number(form.strokeWidth) } : {}),
            ...(form.heightMode !== undefined && form.heightMode !== previousStyle.heightMode ? { heightMode: form.heightMode === 'manual' ? 'manual' as const : 'auto' as const } : {}),
          });
          next = patchNode(next, nodeId, nodePatch);
        }
      } else if (selection.kind === 'edge') {
        const edge = next.edges.find(item => item.id === selection.id)!;
        const { id: edgeId, ...edgePatch } = updateEdgeStyle(edge,
          form.strokeWidth !== undefined && Number(form.strokeWidth) !== readEdgeStyle(edge).strokeWidth ? { strokeWidth: Number(form.strokeWidth) } : {});
        next = patchEdge(next, edgeId, { ...edgePatch, ...edgeStylePatch({ ...edgePatch, id: edgeId } as CanvasEdge, form), label: form.relation,
          ...(form.direction !== undefined && form.direction !== readEdgeDirection(edge) ? directionPatch(form.direction as EdgeDirection) : {}) });
      } else if (selection.kind === 'connection') {
        const edge = updateEdgeStyle(createEdge(form.source, form.target, form.relation), { strokeWidth: Number(form.strokeWidth ?? 1.8) });
        if (selection.fromSide) edge.fromSide = selection.fromSide;
        if (selection.toSide) edge.toSide = selection.toSide;
        Object.assign(edge, directionPatch((form.direction ?? 'forward') as EdgeDirection));
        next = addEdge(next, edge);
        changeSelection({ kind: 'edge', id: edge.id });
      } else if (selection.kind === 'node') {
        next = patchNode(next, selection.id, { text: form.text, ...(form.label !== undefined ? { label: form.label } : {}) });
        const node = next.nodes.find(item => item.id === selection.id)!;
        if (form.heightMode !== undefined || form.strokeWidth !== undefined) {
          const { id, ...styled } = updateNodeStyle(node, {
            ...(form.heightMode !== undefined ? { heightMode: form.heightMode === 'manual' ? 'manual' as const : 'auto' as const } : {}),
            ...(form.strokeWidth !== undefined ? { strokeWidth: Number(form.strokeWidth) } : {}),
          });
          next = patchNode(next, id, styled);
        }
      }
      commit(next);
      setFormDirty(false); setInlineField(null); setInlineBaseline(null); setDetailsAnchor(null);
      setNotice('更改已应用到画布，请保存文件。');
    } catch (err) { setError(message(err)); }
  }
  actionsRef.current = { edit: startInline, details: showDetails, field, apply, cancel: cancelInline, openUrl: url => { if (openExternal) void openExternal(url).then(() => setNotice('已在系统默认浏览器打开原文。')).catch(err => setError(message(err))); else window.open(url, '_blank', 'noopener,noreferrer'); }, patch: (id, patch) => { if (!busy) { try { commit(patchNode(current.current, id, patch)); } catch (err) { setError(message(err)); } } } };
  function removeSelected() {
    if (!selection || busy || !discardForm()) return;
    try {
      if (selection.kind === 'node') {
        const count = canvas.edges.filter(e => e.fromNode === selection.id || e.toNode === selection.id).length;
        if (!window.confirm(count ? `删除这张卡片及其 ${count} 条关系？` : '删除这张卡片？')) return;
        commit(removeNode(canvas, selection.id, { cascade: count > 0 }));
      } else if (selection.kind === 'edge') {
        if (!window.confirm('删除这条关系？')) return;
        commit(removeEdge(canvas, selection.id));
      }
      changeSelection(null); setFormDirty(false); setInlineField(null); setInlineBaseline(null); setDetailsAnchor(null);
    } catch (err) { setError(message(err)); }
  }
  function travel(back: boolean) {
    if (!discardForm() || busy) return;
    const list = back ? past : future;
    if (!list.length) return;
    const next = list[list.length - 1];
    if (back) { setPast(list.slice(0, -1)); setFuture(items => [...items, canvas]); }
    else { setFuture(list.slice(0, -1)); setPast(items => [...items, canvas]); }
    current.current = next; setCanvas(next); changeSelection(null); setFormDirty(false); setInlineField(null); setInlineBaseline(null); setDetailsAnchor(null); setError('');
  }
  function replace(text: string, name: string, handle: LocalFileHandle | null) {
    const next = parseCanvas(text);
    interacting.current = false;
    pendingInitialFit.current = true;
    setContentHeights({});
    current.current = next; setCanvas(next); setSaved(serializeCanvas(next)); setFileName(name);
    file.current = handle ? { handle, snapshot: text } : null;
    setPast([]); setFuture([]); changeSelection(null); setForm({}); setFormDirty(false); setInlineField(null); setInlineBaseline(null); setDetailsAnchor(null); setFocusId(null);
    setError(''); setNotice(handle ? '已打开文件；保存前会检查外部修改。' : '已打开文件；更改后可下载副本。');
  }
  async function open() {
    if (busy) return;
    if (!hasFilePicker()) { input.current?.click(); return; }
    setBusy(true);
    try {
      // The native picker needs this click's transient user activation. A
      // confirmation before it can expire that activation while the user reads.
      const handle = await pickFile();
      if (dirty && !window.confirm('当前有未保存的修改。放弃它们并打开所选文件吗？')) return;
      replace(await (await handle.getFile()).text(), handle.name, handle);
    }
    catch (err) { if (!(err instanceof DOMException && err.name === 'AbortError')) setError(message(err)); }
    finally { setBusy(false); }
  }
  async function save(asNew = false) {
    if (busy || formDirty) return;
    setBusy(true); setError('');
    const text = serializeCanvas(current.current);
    try {
      let target = asNew ? null : file.current;
      if (!target) {
        const handle = await pickSaveFile(fileName);
        if (!handle) { downloadFile(fileName, text); setNotice('已发起下载；请保留下载的 .canvas 文件。临时草稿仍保留。'); return; }
        target = { handle, snapshot: await (await handle.getFile()).text() };
      }
      await writeFile(target.handle, target.snapshot, text);
      file.current = { handle: target.handle, snapshot: text };
      setFileName(target.handle.name); setSaved(text); setNotice('已保存到文件。');
    } catch (err) { if (!(err instanceof DOMException && err.name === 'AbortError')) setError(message(err)); }
    finally { setBusy(false); }
  }
  async function exportDocument(format: 'png' | 'svg' | 'pptx') {
    if (busy || formDirty) return;
    setBusy(true); setError('');
    try { await downloadGraph(current.current, format, fileName); setNotice(`已导出 ${format.toUpperCase()}。`); }
    catch (err) { setError(message(err)); } finally { setBusy(false); }
  }
  async function reloadFile() {
    if (!file.current || (dirty && !window.confirm('放弃当前修改并重新读取文件吗？'))) return;
    const handle = file.current.handle; setBusy(true);
    try { replace(await (await handle.getFile()).text(), handle.name, handle); } catch (err) { setError(message(err)); } finally { setBusy(false); }
  }
  function insertCard(kind: 'paper' | 'note' | 'page' | 'relation', anchor = defaultAnchor()) {
    if (busy || !discardForm()) return;
    const point = flow.screenToFlowPosition(anchor);
    const placement = { x: Math.round(point.x), y: Math.round(point.y), width: kind === 'page' ? 480 : 360, height: 180 };
    const node: CanvasNode = kind === 'paper' ? createPaperNode({ alias: '新论文', takeaway: '双击填写你的认识' }, placement)
      : kind === 'relation' ? createRelationNode('共享关系', { ...placement, width: 220, height: 100 })
      : { id: crypto.randomUUID().replaceAll('-', ''), type: 'text', ...placement, label: kind === 'page' ? '插页' : 'Note', text: '- 在这里记录想法', paperstreamCard: { kind } };
    const next = addNode(current.current, node); commit(next.paperstreamLayout === 'vertical' ? layoutVertical(next) : next); setFocusId(null); setCreateMenu(null);
    select({ kind: 'node', id: node.id }, true);
    if (kind === 'paper') { setInlineBaseline({ value: '新论文', wasDirty: false }); setInlineField('alias'); setDetailsAnchor(null); }
    else showDetails({ kind: 'node', id: node.id }, anchor);
  }
  function quickConnect(source: string, target: string, fromSide?: string | null, toSide?: string | null) {
    if (busy || !discardForm()) return;
    try {
      const edge = createEdge(source, target, '');
      edge.fromSide = (fromSide ?? 'bottom') as CanvasEdge['fromSide']; edge.toSide = (toSide ?? 'top') as CanvasEdge['toSide'];
      commit(addEdge(current.current, edge)); select({ kind: 'edge', id: edge.id }, true); setConnectSource(null); setNotice('已连线；双击连线添加说明，右键调整箭头。');
    } catch (err) { setError(message(err)); }
  }
  useEffect(() => {
    const element = workspace.current; if (!element) return;
    const wheel = (event: WheelEvent) => {
      const selected = selectionRef.current;
      const weightGesture = wheelIntent(event, selected?.kind === 'node' || selected?.kind === 'edge') === 'weight';
      const zoomGesture = !weightGesture;
      if (!event.ctrlKey && !event.metaKey && (event.target as Element).closest('input, textarea, select, .ps-inspector, .ps-create-menu')) return;
      event.preventDefault(); event.stopPropagation(); if (busy || (!zoomGesture && inlineField)) return;
      const viewport = flow.getViewport();
      if (zoomGesture) {
        const rect = element.getBoundingClientRect();
        const x = event.clientX - rect.left, y = event.clientY - rect.top;
        void flow.setViewport(zoomAt(viewport, event.deltaY, { x, y }));
      } else if (event.deltaY && weightGesture && (selected?.kind === 'node' || selected?.kind === 'edge')) {
        if (formDirty) return;
        try {
          const item = selected.kind === 'node' ? current.current.nodes.find(n => n.id === selected.id)! : current.current.edges.find(e => e.id === selected.id)!;
          const width = selected.kind === 'node' ? readNodeStyle(item as CanvasNode).strokeWidth : readEdgeStyle(item as CanvasEdge).strokeWidth;
          const strokeWidth = wheelStroke(width, event.deltaY);
          const { id, ...patch } = selected.kind === 'node' ? updateNodeStyle(item as CanvasNode, { strokeWidth }) : updateEdgeStyle(item as CanvasEdge, { strokeWidth });
          const next = selected.kind === 'node' ? patchNode(current.current, id, patch) : patchEdge(current.current, id, patch);
          const key = `${selected.kind}:${id}`, now = Date.now();
          if (wheelGesture.current?.key === key && now - wheelGesture.current.time < 400) { serializeCanvas(next); current.current = next; setCanvas(next); }
          else commit(next);
          wheelGesture.current = { key, time: now }; setForm(old => ({ ...old, strokeWidth: String(strokeWidth) }));
        } catch (err) { setError(message(err)); }
      }
    };
    element.addEventListener('wheel', wheel, { passive: false, capture: true });
    return () => element.removeEventListener('wheel', wheel, true);
  }, [flow, busy, inlineField, formDirty, commit]);
  const selectedNode = selection?.kind === 'node' ? canvas.nodes.find(node => node.id === selection.id) : undefined;
  const paper = selectedNode ? readPaper(selectedNode) : null;
  const paperForm = selection?.kind === 'new' || Boolean(paper);
  const relationForm = selection?.kind === 'edge' || selection?.kind === 'connection';
  const editable = paperForm || relationForm || selectedNode?.type === 'text';

  return <div className="paperstream-editor" aria-busy={busy} onKeyDown={event => {
    if (event.key === 'Escape' && detailsAnchor && !event.defaultPrevented) { event.preventDefault(); closeDetails(); }
  }}>
    <header className="ps-header ps-compact-header"><details className="ps-file-menu"><summary aria-label="文件与画布操作">⋯</summary><div className="ps-menu-items" onClick={event => { if ((event.target as Element).closest('button')) event.currentTarget.closest('details')?.removeAttribute('open'); }}>
        <button disabled={busy} onClick={() => void open()}>打开文件…</button>
        <button disabled={busy || formDirty} onClick={() => void save()}>保存</button>
        <button disabled={busy || formDirty} onClick={() => void save(true)}>另存为…</button>
        {(['png', 'svg', 'pptx'] as const).map(format => <button key={format} disabled={busy || formDirty || !canvas.nodes.length} onClick={() => void exportDocument(format)}>导出 {format.toUpperCase()}</button>)}
        <button disabled={busy || !file.current} onClick={() => void reloadFile()}>重新读取文件</button>
      </div></details></header>
    <div className="ps-workspace" ref={workspace}>
      <main className="ps-canvas" aria-label="论文关系画布" onDoubleClickCapture={event => {
        if ((event.target as Element).closest('.react-flow__pane')) {
          event.preventDefault(); event.stopPropagation(); setCreateMenu({ x: event.clientX, y: event.clientY });
        }
      }}>
        <ReactFlow<CardNode, RelationEdgeModel> nodes={renderedNodes} edges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes}
          onKeyDownCapture={event => {
            const target = event.target;
            if (!(target instanceof Element)) return;
            const kind = target.classList.contains('react-flow__node') ? 'node'
              : target.classList.contains('react-flow__edge') ? 'edge' : null;
            const id = target.getAttribute('data-id');
            if (!kind || !id) return;
            if (event.key === 'Enter' || event.key === ' ' || event.key === 'Escape') {
              event.preventDefault(); event.stopPropagation(); select(event.key === 'Escape' ? null : { kind, id });
            }
            if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
              event.preventDefault(); event.stopPropagation(); const rect = target.getBoundingClientRect();
              showDetails({ kind, id }, { x: rect.right, y: rect.top });
            }
          }}
          onNodesChange={onNodesChange} connectionMode={ConnectionMode.Loose}
          nodesDraggable={!busy && !connectSource} nodesConnectable={!busy} deleteKeyCode={null} multiSelectionKeyCode={null}
          selectionKeyCode={null} panOnScroll={false} zoomOnScroll={false} zoomOnPinch={false} preventScrolling={false}
          elevateNodesOnSelect={false} minZoom={0.1} maxZoom={2}
          onMoveStart={event => { if (event) pendingInitialFit.current = false; }}
          onNodeClick={(_event, node) => { setCreateMenu(null); if (connectSource) { quickConnect(connectSource, node.id); } else select({ kind: 'node', id: node.id }); }}
          onEdgeClick={(_event, edge) => select({ kind: 'edge', id: edge.id })}
          onEdgeDoubleClick={(_event, edge) => startInline({ kind: 'edge', id: edge.id }, 'relation')}
          onNodeContextMenu={(event, node) => { event.preventDefault(); showDetails({ kind: 'node', id: node.id }, { x: event.clientX, y: event.clientY }); }}
          onEdgeContextMenu={(event, edge) => { event.preventDefault(); showDetails({ kind: 'edge', id: edge.id }, { x: event.clientX, y: event.clientY }); }}
          onPaneClick={() => { select(null); setCreateMenu(null); setConnectSource(null); }}
          onDoubleClick={event => { if ((event.target as Element).closest('.react-flow__pane')) setCreateMenu({ x: event.clientX, y: event.clientY }); }}
          onPaneContextMenu={event => { event.preventDefault(); setCreateMenu({ x: event.clientX, y: event.clientY }); }}
          onNodeDragStart={startInteraction}
          onNodeDragStop={(_event, node, dragged) => {
            finishInteraction();
            try {
              let next = current.current;
              for (const item of dragged?.length ? dragged : [node]) {
                next = patchNode(next, item.id, { x: Math.round(item.position.x), y: Math.round(item.position.y) });
              }
              commit({ ...next, paperstreamLayout: 'manual' });
            } catch (err) { setError(message(err)); }
          }}
          onConnect={(connection: Connection) => {
            quickConnect(connection.source, connection.target, connection.sourceHandle, connection.targetHandle);
          }}>
          <Background color="var(--ps-grid, #cbd7d0)" gap={24} size={1} />
          <Controls showInteractive={false} showFitView={false}>
            <ControlButton onClick={fitContent} aria-label="Fit View" title="适应画布（含关系说明）">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3h6v2H5v4H3V3Zm12 0h6v6h-2V5h-4V3ZM3 15h2v4h4v2H3v-6Zm16 0h2v6h-6v-2h4v-4Z" /></svg>
            </ControlButton>
          </Controls>
        </ReactFlow>
        {!canvas.nodes.length && <div className="ps-empty"><span>从一篇论文开始</span><p>留下你的理解，再用关系线把研究脉络连起来。</p><button disabled={busy} onClick={() => insertCard('paper')}>新增第一篇论文</button></div>}
        {focusId && <div className="ps-view-note">局部视图 · 保存仍包含完整关系图</div>}
        {connectSource && <div className="ps-view-note">点击目标卡片建立连线 <button onClick={() => setConnectSource(null)}>取消</button></div>}
        {createMenu && <div className="ps-create-menu" style={{ left: Math.max(8, Math.min(workspaceSize.width - 170, createMenu.x - (workspace.current?.getBoundingClientRect().left ?? 0))), top: Math.max(8, Math.min(workspaceSize.height - 180, createMenu.y - (workspace.current?.getBoundingClientRect().top ?? 0))) }}>
          <button onClick={() => insertCard('paper', createMenu)}>＋ 论文</button><button onClick={() => insertCard('note', createMenu)}>＋ Note</button><button onClick={() => insertCard('page', createMenu)}>＋ 插页</button><button onClick={() => insertCard('relation', createMenu)}>＋ 共享关系</button>
        </div>}
      </main>
      {detailsAnchor && selection && <aside ref={details} className="ps-inspector" role="dialog" aria-label="详情编辑" aria-modal="false"
        style={{ left: detailsPosition.x, top: detailsPosition.y, width: Math.min(340, Math.max(0, workspaceSize.width - 24)), maxHeight: Math.max(0, workspaceSize.height - 24) }}>
        <div className="ps-inspector-heading" tabIndex={-1}><span>{paperForm ? '论文详情' : relationForm ? '关系详情' : '卡片详情'}</span>
          <button aria-label="关闭详情" onClick={closeDetails}>×</button></div>
        <form onSubmit={event => { event.preventDefault(); apply(); }}>
          <fieldset disabled={busy}>
            {paperForm && <>
              <div className="ps-appearance-fields">
                <div className="ps-choice-group"><span>卡片高度</span>
                  <div className="ps-choice-options" role="radiogroup" aria-label="卡片高度">
                    {([['auto', '自动', '自动适应内容'], ['manual', '手动', '手动保留高度']] as const).map(([value, label, accessibleLabel]) =>
                      <label className="ps-choice" key={value}><input type="radio" name="ps-height-mode" value={value} aria-label={accessibleLabel} required
                        checked={(form.heightMode ?? (selectedNode ? readNodeStyle(selectedNode).heightMode : 'auto')) === value}
                        onChange={e => field('heightMode', e.target.value)} /><span>{label}</span></label>)}
                  </div>
                </div>
                <label>边框粗细（px）<input type="number" min="0.5" max="8" step="0.1" required
                  value={form.strokeWidth ?? (selectedNode ? readNodeStyle(selectedNode).strokeWidth : 1)} onChange={e => field('strokeWidth', e.target.value)} /></label>
              </div>
              <p className="ps-muted ps-appearance-hint">自动模式随文字增减高度；拖动卡片边角后保留手动尺寸。</p>
              <label>简称 · alias<input required value={form.alias ?? ''} onChange={e => field('alias', e.target.value)} placeholder="例如 ResNet" /></label>
              <label>核心认识 · takeaway<textarea required rows={5} value={form.takeaway ?? ''} onChange={e => field('takeaway', e.target.value)} placeholder="这篇论文最值得记住的是什么？" /></label>
              <label>论文原名 · name<textarea rows={3} value={form.name ?? ''} onChange={e => field('name', e.target.value)} placeholder="保留原始标题" /></label>
              <label>原文链接 · url<input type="url" value={form.url ?? ''} onChange={e => field('url', e.target.value)} placeholder="https://…" /></label>
              <label>年份 · year<input type="number" min="1" max="9999" step="1" value={form.year ?? ''} onChange={e => field('year', e.target.value)} /></label>
              {paper?.url && <a className="ps-link" href={paper.url} target="_blank" rel="noreferrer">打开论文原文 ↗</a>}
            </>}
            {selection?.kind === 'connection' && <>{(['source', 'target'] as const).map(key => <label key={key}>{key === 'source' ? '从这张卡片' : '指向这张卡片'}<select required value={form[key] ?? ''} onChange={e => field(key, e.target.value)}><option value="">请选择…</option>{canvas.nodes.map(n => <option key={n.id} value={n.id}>{title(n)}</option>)}</select></label>)}</>}
            {relationForm && <label>关系说明 · relation<textarea rows={4} value={form.relation ?? ''} onChange={e => field('relation', e.target.value)} placeholder="可留空；双击连线可补充说明" /></label>}
            {relationForm && <div className="ps-choice-group"><span>箭头方向</span>
              <div className="ps-choice-options" role="radiogroup" aria-label="箭头方向">
                {([['forward', '正向 →'], ['reverse', '反向 ←'], ['both', '双向 ↔'], ['none', '无箭头 —']] as const).map(([value, label]) =>
                  <label className="ps-choice" key={value}><input type="radio" name="ps-edge-direction" value={value} required
                    checked={(form.direction ?? (selection?.kind === 'edge'
                      ? readEdgeDirection(canvas.edges.find(edge => edge.id === selection.id)!) : 'forward')) === value}
                    onChange={e => field('direction', e.target.value)} /><span>{label}</span></label>)}
              </div>
            </div>}
            {relationForm && <label>连线粗细（px）<input type="number" min="0.5" max="8" step="0.1" required
              value={form.strokeWidth ?? (selection?.kind === 'edge' ? readEdgeStyle(canvas.edges.find(edge => edge.id === selection.id)!).strokeWidth : 1.8)} onChange={e => field('strokeWidth', e.target.value)} /></label>}
            {selectedNode && !paper && <>
              <label>卡片高度<select value={form.heightMode ?? 'auto'} onChange={e => field('heightMode', e.target.value)}><option value="auto">自动适应内容</option><option value="manual">手动保留高度</option></select></label>
              <label>边框粗细（px）<input type="number" min="0.5" max="8" step="0.1" value={form.strokeWidth ?? 1} onChange={e => field('strokeWidth', e.target.value)} /></label>
              <p className="ps-muted">这是一张{selectedNode.type === 'text' ? '备注' : selectedNode.type === 'file' ? '文件' : selectedNode.type === 'link' ? '链接' : '分组'}卡片。</p>
              {selectedNode.type === 'text' && <label>标题<input value={form.label ?? ''} onChange={e => field('label', e.target.value)} /></label>}
              {selectedNode.type === 'text' && <label>内容<textarea rows={12} value={form.text ?? ''} onChange={e => field('text', e.target.value)} /></label>}
              {selectedNode.type === 'file' && <p className="ps-file-path">{selectedNode.file}{selectedNode.subpath}<br /><small>相对文件路径按画布所在目录理解。此版本不内嵌读取附件。</small></p>}
              {selectedNode.type === 'link' && selectedNode.url && /^https?:\/\//i.test(selectedNode.url) && <a href={selectedNode.url} target="_blank" rel="noreferrer">打开链接 ↗</a>}
              {selectedNode.type === 'group' && <p>{selectedNode.label ?? '分组'}<br /><small>可移动分组框；框内卡片的位置分别保存。</small></p>}
            </>}
            {selection?.kind === 'edge' && <>
              <label>连线样式<select value={form.lineStyle ?? 'solid'} onChange={e => field('lineStyle', e.target.value)}><option value="solid">实线</option><option value="dashed">虚线</option><option value="dotted">点线</option></select></label>
              <label>箭头形状<select value={form.arrowShape ?? 'triangle'} onChange={e => field('arrowShape', e.target.value)}><option value="triangle">实心箭头</option><option value="open">开放箭头</option><option value="diamond">菱形</option><option value="circle">圆点</option></select></label>
              <label>关系权重 · 人工标注（1–5）<input type="number" min="1" max="5" step="1" value={form.weight ?? '1'} onChange={e => field('weight', e.target.value)} /></label>
              <button type="button" onClick={() => { if (!discardForm()) return; try { const promoted = promoteEdgeRelation(current.current, selection.id); commit(promoted.document); select({ kind: 'node', id: promoted.nodeId }, true); setDetailsAnchor(null); } catch (err) { setError(message(err)); } }}>转换为共享关系节点</button>
            </>}
            {selectedNode && <FigureControls node={selectedNode} busy={busy} onPatchNode={patch => { try { commit(patchNode(current.current, selectedNode.id, patch)); } catch (err) { setError(message(err)); } }} />}
            {editable && <button className="ps-primary ps-apply" type="submit">应用更改</button>}
            {formDirty && <p className="ps-muted">应用后再保存文件。</p>}
            {(selection?.kind === 'node' || selection?.kind === 'edge') && <button type="button" className="ps-danger" onClick={removeSelected}>删除{selection.kind === 'node' ? '卡片' : '关系'}</button>}
          </fieldset>
        </form>
      </aside>}
    </div>
    <footer className={`ps-status ${error ? 'has-error' : ''}`}>
      <div className="ps-status-tools">
        <details className="ps-insert-menu"><summary>＋ 插入</summary><div className="ps-menu-items" onClick={event => { if ((event.target as Element).closest('button')) event.currentTarget.closest('details')?.removeAttribute('open'); }}><button onClick={() => insertCard('paper')}>论文</button><button onClick={() => insertCard('note')}>Note</button><button onClick={() => insertCard('page')}>插页</button><button onClick={() => insertCard('relation')}>共享关系</button></div></details>
        <button disabled={busy || !selectedNode} title="先选起点，再点目标；也可拖动卡片连接点" onClick={() => { if (selectedNode && discardForm()) setConnectSource(selectedNode.id); }}>↗ 连线</button>
        <button disabled={busy || !past.length} onClick={() => travel(true)} title="撤销">↶</button><button disabled={busy || !future.length} onClick={() => travel(false)} title="重做">↷</button>
        <button disabled={busy || !canvas.nodes.length} onClick={() => { if (discardForm()) { commit({ ...layoutVertical(current.current), paperstreamLayout: 'vertical' }); pendingInitialFit.current = true; } }}>竖排</button>
        <input className="ps-search" aria-label="搜索卡片" placeholder="搜索…" value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { const found = canvas.nodes.find(node => title(node).toLowerCase().includes(search.toLowerCase())); if (found && select({ kind: 'node', id: found.id })) void flow.fitView({ nodes: [{ id: found.id }], maxZoom: 1, duration: 0 }); } }} />
        <button disabled={!selectedNode} onClick={() => setFocusId(focusId ? null : selectedNode!.id)}>{focusId ? '全图' : '附近'}</button>
      </div>
      <span className="ps-status-notice" role={error ? 'alert' : 'status'} title={error || notice}>{busy ? '处理中…' : error || (formDirty ? '编辑尚未应用' : dirty ? '未保存' : file.current ? '已保存' : '未关联文件')}</span>
      <span className="ps-count">{visible.size}/{canvas.nodes.length} 卡片 · {canvas.edges.length} 边</span>
      <span className="ps-wheel-hint">滚轮缩放 · 拖空白平移 · Alt 滚轮调线重</span>
    </footer>
    <input ref={input} hidden type="file" accept=".canvas,application/json" onChange={async event => {
      const selected = event.target.files?.[0]; event.target.value = '';
      if (!selected) return;
      if (dirty && !window.confirm('当前有未保存的修改。放弃它们并打开所选文件吗？')) return;
      setBusy(true);
      try { replace(await selected.text(), selected.name, null); }
      catch (err) { setError(message(err)); }
      finally { setBusy(false); }
    }} />
  </div>;
}

function edgeSettings(edge: CanvasEdge) {
  const style = edge.paperstreamStyle && typeof edge.paperstreamStyle === 'object' ? edge.paperstreamStyle as Record<string, unknown> : {};
  return { lineStyle: typeof style.lineStyle === 'string' ? style.lineStyle : 'solid', arrowShape: typeof style.arrowShape === 'string' ? style.arrowShape : 'triangle', weight: String(style.weight ?? 1) };
}
function edgeStylePatch(edge: CanvasEdge, form: FormValues): Partial<CanvasEdge> {
  const old = edgeSettings(edge); const changed = ['lineStyle', 'arrowShape', 'weight'].filter(key => form[key] !== undefined && form[key] !== old[key as keyof typeof old]);
  if (!changed.length) return {};
  if (edge.paperstreamStyle !== undefined && (typeof edge.paperstreamStyle !== 'object' || edge.paperstreamStyle === null || Array.isArray(edge.paperstreamStyle))) throw new Error('无法修改非对象外观数据。');
  const style = { ...(edge.paperstreamStyle as Record<string, unknown> ?? {}) };
  for (const key of changed) style[key] = key === 'weight' ? Number(form[key]) : form[key];
  if (style.weight !== undefined && (!Number.isInteger(style.weight) || Number(style.weight) < 1 || Number(style.weight) > 5)) throw new Error('权重必须是1–5之间的整数。');
  return { paperstreamStyle: style };
}
