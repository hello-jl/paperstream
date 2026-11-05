import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Background, ConnectionMode, Controls, Handle, MarkerType, NodeResizer,
  Position, ReactFlow, ReactFlowProvider, applyNodeChanges, useReactFlow,
} from '@xyflow/react';
import type { Connection, Edge, Node, NodeProps, OnNodesChange } from '@xyflow/react';
import {
  addEdge, addNode, createCanvas, createEdge, createPaperNode, parseCanvas,
  patchEdge, patchNode, readPaper, removeEdge, removeNode, serializeCanvas, updatePaper,
} from './canvas';
import type { CanvasEdge, CanvasNode, JSONCanvasDocument, PaperFields } from './canvas';
import { downloadFile, hasFilePicker, pickFile, pickSaveFile, writeFile } from './files';
import type { LocalFileHandle } from './files';
import '@xyflow/react/dist/style.css';
import './editor.css';

type Selection = { kind: 'node' | 'edge'; id: string } | { kind: 'new' } | {
  kind: 'connection'; source: string; target: string; fromSide?: CanvasEdge['fromSide']; toSide?: CanvasEdge['toSide'];
} | null;
type FormValues = Record<string, string>;
type CardNode = Node<{
  raw: CanvasNode;
  busy: boolean;
  resize: (id: string, width: number, height: number, x: number, y: number) => void;
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
  return <div className={`ps-card ${data.raw.type === 'group' ? 'ps-group' : ''}`}
    style={{ borderColor: color(data.raw.color) }}>
    <NodeResizer isVisible={selected && !data.busy} minWidth={160} minHeight={100}
      onResizeEnd={(_event, size) => data.resize(id, size.width, size.height, size.x, size.y)} />
    {Object.values(Position).map(side => <Handle key={side} id={side} type="source" position={side} />)}
    <span className="ps-card-kind">{paper ? '论文' : { text: '备注', file: '文件', link: '链接', group: '分组' }[data.raw.type]}</span>
    <strong>{title(data.raw)}</strong>
    <p>{paper?.takeaway ?? (data.raw.type === 'text' ? data.raw.text : data.raw.type === 'group' ? '' : '点击查看详情')}</p>
    {paper?.year && <span className="ps-card-year">{paper.year}</span>}
  </div>;
});
const nodeTypes = { paper: PaperCard };

function initialState(key: string) {
  const empty = createCanvas();
  const fallback = { canvas: empty, fileName: 'papers.canvas', saved: serializeCanvas(empty), selection: null as Selection,
    form: {} as FormValues, formDirty: false, restored: false };
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
    // A draft is convenience recovery, never authority to overwrite a file.
    return { ...fallback, canvas, fileName: typeof draft.fileName === 'string' ? draft.fileName : fallback.fileName,
      saved: typeof draft.saved === 'string' ? draft.saved : fallback.saved,
      selection, form, formDirty: Boolean(selection && draft.formDirty), restored: true };
  } catch { return fallback; }
}

export interface PaperstreamEditorProps { draftKey?: string }

/** Both standalone and DSH mount the same editor; persistence stays in .canvas. */
export function PaperstreamEditor({ draftKey = 'paperstream-browser-draft-v1' }: PaperstreamEditorProps) {
  return <ReactFlowProvider><Editor draftKey={draftKey} /></ReactFlowProvider>;
}

function Editor({ draftKey }: { draftKey: string }) {
  const [initial] = useState(() => initialState(draftKey));
  const [canvas, setCanvas] = useState(initial.canvas);
  const current = useRef(canvas);
  current.current = canvas;
  const [past, setPast] = useState<JSONCanvasDocument[]>([]);
  const [future, setFuture] = useState<JSONCanvasDocument[]>([]);
  const [selection, setSelection] = useState<Selection>(initial.selection);
  const selectionRef = useRef(selection);
  selectionRef.current = selection;
  const [form, setForm] = useState<FormValues>(initial.form);
  const [formDirty, setFormDirty] = useState(initial.formDirty);
  const [fileName, setFileName] = useState(initial.fileName);
  const [saved, setSaved] = useState(initial.saved);
  const file = useRef<{ handle: LocalFileHandle; snapshot: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(initial.restored ? '已恢复本标签页的草稿。保存到文件后才能长期保留。' : '打开一张关系图，或新增第一篇论文。');
  const [error, setError] = useState('');
  const [focusId, setFocusId] = useState<string | null>(null);
  const [nodes, setNodes] = useState<CardNode[]>([]);
  const input = useRef<HTMLInputElement>(null);
  const flow = useReactFlow<CardNode>();
  const source = useMemo(() => serializeCanvas(canvas), [canvas]);
  const dirty = source !== saved || formDirty;

  useEffect(() => {
    try { sessionStorage.setItem(draftKey, JSON.stringify({ canvas, fileName, saved, selection, form, formDirty })); }
    catch { setNotice('浏览器无法保存临时草稿，请及时保存或下载文件。'); }
  }, [canvas, fileName, saved, selection, form, formDirty, draftKey]);
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (dirty) { event.preventDefault(); event.returnValue = ''; }
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [dirty]);

  const commit = useCallback((next: JSONCanvasDocument) => {
    if (JSON.stringify(next) === JSON.stringify(current.current)) return;
    serializeCanvas(next); // Validate before replacing the in-memory document.
    const previous = current.current;
    setPast(items => [...items.slice(-49), previous]);
    setFuture([]);
    current.current = next;
    setCanvas(next);
    setError('');
  }, []);
  const resize = useCallback((id: string, width: number, height: number, x: number, y: number) => {
    if (busy) return;
    try { commit(patchNode(current.current, id, { width: Math.round(width), height: Math.round(height), x: Math.round(x), y: Math.round(y) })); }
    catch (err) { setError(message(err)); }
  }, [commit, busy]);
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
      data: { raw: node, resize, busy }, selected: selection?.kind === 'node' && selection.id === node.id,
      hidden: !visible.has(node.id), zIndex: index,
    })));
  }, [canvas, visible, resize, selection, busy]);
  const edges = useMemo<Edge[]>(() => canvas.edges.map(edge => ({
    id: edge.id, source: edge.fromNode, target: edge.toNode,
    sourceHandle: edge.fromSide ?? 'bottom', targetHandle: edge.toSide ?? 'top',
    label: edge.label, type: 'smoothstep', animated: false,
    markerStart: edge.fromEnd === 'arrow' ? { type: MarkerType.ArrowClosed } : undefined,
    markerEnd: edge.toEnd !== 'none' ? { type: MarkerType.ArrowClosed } : undefined,
    style: { stroke: color(edge.color) ?? '#70877e', strokeWidth: 1.8 },
    selected: selection?.kind === 'edge' && selection.id === edge.id,
    hidden: !visible.has(edge.fromNode) || !visible.has(edge.toNode),
  })), [canvas, visible, selection]);
  const onNodesChange: OnNodesChange<CardNode> = useCallback(changes => {
    // Deletion is explicit in the inspector; filtering never mutates stored nodes.
    setNodes(items => applyNodeChanges(changes.filter(change => change.type !== 'remove'), items));
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

  function discardForm() { return !formDirty || window.confirm('详情还有未应用的修改。放弃这些字段修改吗？'); }
  function select(next: Selection) {
    if (JSON.stringify(next) === JSON.stringify(selectionRef.current)) return true;
    if (busy || !discardForm()) return false;
    selectionRef.current = next;
    setSelection(next);
    setFormDirty(false);
    setError('');
    if (next?.kind === 'node') {
      const node = canvas.nodes.find(item => item.id === next.id)!;
      const paper = readPaper(node);
      setForm(paper ? { alias: paper.alias, takeaway: paper.takeaway, name: paper.name ?? '', url: paper.url ?? '', year: paper.year?.toString() ?? '' }
        : { text: node.text ?? '' });
    } else if (next?.kind === 'edge') {
      setForm({ relation: canvas.edges.find(item => item.id === next.id)?.label ?? '' });
    } else if (next?.kind === 'connection') {
      setForm({ relation: '', source: next.source, target: next.target });
    } else setForm({ alias: '', takeaway: '', name: '', url: '', year: '' });
    return true;
  }
  function field(key: string, value: string) {
    setForm(values => ({ ...values, [key]: value }));
    setFormDirty(true);
  }
  function apply() {
    if (!selection || busy) return;
    try {
      let next = canvas;
      if (selection.kind === 'new' || (selection.kind === 'node' && readPaper(canvas.nodes.find(n => n.id === selection.id)!))) {
        const fields: PaperFields = { alias: form.alias, takeaway: form.takeaway, name: form.name || null, url: form.url || null,
          year: form.year ? Number(form.year) : null };
        if (selection.kind === 'new') {
          const position = flow.screenToFlowPosition({ x: window.innerWidth * 0.4, y: window.innerHeight * 0.4 });
          const node = createPaperNode(fields, { x: Math.round(position.x), y: Math.round(position.y) });
          next = addNode(canvas, node);
          setSelection({ kind: 'node', id: node.id });
          setFocusId(null);
        } else next = updatePaper(canvas, selection.id, fields);
      } else if (selection.kind === 'edge') {
        next = patchEdge(canvas, selection.id, { label: form.relation });
      } else if (selection.kind === 'connection') {
        const edge = createEdge(form.source, form.target, form.relation);
        if (selection.fromSide) edge.fromSide = selection.fromSide;
        if (selection.toSide) edge.toSide = selection.toSide;
        next = addEdge(canvas, edge);
        setSelection({ kind: 'edge', id: edge.id });
      } else if (selection.kind === 'node') {
        next = patchNode(canvas, selection.id, { text: form.text });
      }
      commit(next);
      setFormDirty(false);
      setNotice('更改已应用到画布，请保存文件。');
    } catch (err) { setError(message(err)); }
  }
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
      setSelection(null); setFormDirty(false);
    } catch (err) { setError(message(err)); }
  }
  function travel(back: boolean) {
    if (!discardForm() || busy) return;
    const list = back ? past : future;
    if (!list.length) return;
    const next = list[list.length - 1];
    if (back) { setPast(list.slice(0, -1)); setFuture(items => [...items, canvas]); }
    else { setFuture(list.slice(0, -1)); setPast(items => [...items, canvas]); }
    current.current = next; setCanvas(next); setSelection(null); setFormDirty(false); setError('');
  }
  function replace(text: string, name: string, handle: LocalFileHandle | null) {
    const next = parseCanvas(text);
    current.current = next; setCanvas(next); setSaved(serializeCanvas(next)); setFileName(name);
    file.current = handle ? { handle, snapshot: text } : null;
    setPast([]); setFuture([]); setSelection(null); setForm({}); setFormDirty(false); setFocusId(null);
    setError(''); setNotice(handle ? '已打开文件；保存前会检查外部修改。' : '已打开文件；更改后可下载副本。');
    requestAnimationFrame(() => void flow.fitView({ duration: 0 }));
  }
  async function open() {
    if (busy || (dirty && !window.confirm('当前有未保存的修改。放弃它们并打开其他文件吗？'))) return;
    if (!hasFilePicker()) { input.current?.click(); return; }
    setBusy(true);
    try { const handle = await pickFile(); replace(await (await handle.getFile()).text(), handle.name, handle); }
    catch (err) { if (!(err instanceof DOMException && err.name === 'AbortError')) setError(message(err)); }
    finally { setBusy(false); }
  }
  async function save(asNew = false) {
    if (busy || formDirty) return;
    setBusy(true); setError('');
    const text = source;
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
  const selectedNode = selection?.kind === 'node' ? canvas.nodes.find(node => node.id === selection.id) : undefined;
  const paper = selectedNode ? readPaper(selectedNode) : null;
  const paperForm = selection?.kind === 'new' || Boolean(paper);
  const relationForm = selection?.kind === 'edge' || selection?.kind === 'connection';
  const editable = paperForm || relationForm || selectedNode?.type === 'text';

  return <div className="paperstream-editor" aria-busy={busy}>
    <header className="ps-header">
      <div><span className="ps-brand">Paperstream</span><span className="ps-subtitle">论文之间，思路相连</span></div>
      <div className="ps-file"><span title={fileName}>{fileName}</span><span className={`ps-save-state ${dirty ? 'is-dirty' : ''}`}>{dirty ? '未保存' : file.current ? '已保存' : '未关联文件'}</span></div>
      <div className="ps-actions">
        <button disabled={busy} onClick={() => {
          if (dirty && !window.confirm('放弃未保存的修改并新建关系图吗？')) return;
          replace(serializeCanvas(createCanvas()), 'papers.canvas', null);
          setNotice('已新建空白关系图。');
        }}>新建</button>
        <button disabled={busy} onClick={() => void open()}>打开</button>
        <button disabled={busy || formDirty} onClick={() => void save(true)}>另存为</button>
        <button className="ps-primary" disabled={busy || formDirty} onClick={() => void save()}>保存</button>
      </div>
    </header>
    <div className="ps-toolbar">
      <button className="ps-primary" disabled={busy} onClick={() => select({ kind: 'new' })}>＋ 论文</button>
      <button disabled={busy || canvas.nodes.length < 2} onClick={() => select({ kind: 'connection', source: selectedNode?.id ?? '', target: '' })}>＋ 关系</button>
      <span className="ps-divider" />
      <button disabled={busy || !past.length} onClick={() => travel(true)}>撤销</button>
      <button disabled={busy || !future.length} onClick={() => travel(false)}>重做</button>
      <button disabled={busy || !file.current} onClick={async () => {
        if (!file.current || (dirty && !window.confirm('放弃当前修改并重新读取磁盘文件吗？'))) return;
        const handle = file.current.handle;
        setBusy(true);
        try { replace(await (await handle.getFile()).text(), handle.name, handle); }
        catch (err) { setError(message(err)); }
        finally { setBusy(false); }
      }}>重新读取</button>
      <select aria-label="定位论文" value="" onChange={event => {
        const id = event.target.value;
        if (!id) return;
        if (!select({ kind: 'node', id })) return;
        setFocusId(null);
        requestAnimationFrame(() => void flow.fitView({ nodes: [{ id }], maxZoom: 1, duration: 0 }));
      }}><option value="">定位论文…</option>{canvas.nodes.filter(n => readPaper(n)).map(n => <option key={n.id} value={n.id}>{title(n)}</option>)}</select>
      {focusId ? <button onClick={() => setFocusId(null)}>显示全图</button>
        : <button disabled={!selectedNode} onClick={() => { setFocusId(selectedNode!.id); requestAnimationFrame(() => void flow.fitView()); }}>只看附近</button>}
      <span className="ps-count">{visible.size} / {canvas.nodes.length} 张卡片 · {canvas.edges.length} 条关系</span>
    </div>
    <div className="ps-workspace">
      <main className="ps-canvas" aria-label="论文关系画布">
        <ReactFlow<CardNode> nodes={nodes} edges={edges} nodeTypes={nodeTypes}
          onNodesChange={onNodesChange} connectionMode={ConnectionMode.Loose}
          onSelectionChange={({ nodes: selectedNodes, edges: selectedEdges }) => {
            const next: Selection = selectedNodes.length ? { kind: 'node', id: selectedNodes[0].id }
              : selectedEdges.length ? { kind: 'edge', id: selectedEdges[0].id } : null;
            // Pane clicks handle clearing. This also synchronizes keyboard selection.
            if (next && !select(next)) {
              setNodes(items => items.map(item => ({ ...item, selected: selectionRef.current?.kind === 'node' && selectionRef.current.id === item.id })));
            }
          }}
          nodesDraggable={!busy} nodesConnectable={!busy} deleteKeyCode={null} multiSelectionKeyCode={null}
          elevateNodesOnSelect={false} fitView minZoom={0.1} maxZoom={2}
          onNodeClick={(_event, node) => select({ kind: 'node', id: node.id })}
          onEdgeClick={(_event, edge) => select({ kind: 'edge', id: edge.id })}
          onPaneClick={() => select(null)}
          onNodeDragStop={(_event, node, dragged) => {
            try {
              let next = current.current;
              for (const item of dragged?.length ? dragged : [node]) {
                next = patchNode(next, item.id, { x: Math.round(item.position.x), y: Math.round(item.position.y) });
              }
              commit(next);
            } catch (err) { setError(message(err)); }
          }}
          onConnect={(connection: Connection) => select({ kind: 'connection', source: connection.source, target: connection.target,
            fromSide: connection.sourceHandle as CanvasEdge['fromSide'], toSide: connection.targetHandle as CanvasEdge['toSide'] })}>
          <Background color="#cbd7d0" gap={24} size={1} />
          <Controls showInteractive={false} />
        </ReactFlow>
        {!canvas.nodes.length && <div className="ps-empty"><span>从一篇论文开始</span><p>留下你的理解，再用关系线把研究脉络连起来。</p><button disabled={busy} onClick={() => select({ kind: 'new' })}>新增第一篇论文</button></div>}
        {focusId && <div className="ps-view-note">局部视图 · 保存仍包含完整关系图</div>}
      </main>
      <aside className="ps-inspector" aria-label="详情编辑">
        <div className="ps-inspector-heading"><span>{paperForm ? '论文详情' : relationForm ? '关系详情' : selectedNode ? '卡片详情' : '整理你的研究脉络'}</span>
          {selection && <button aria-label="关闭详情" onClick={() => select(null)}>×</button>}</div>
        {!selection && <div className="ps-help"><p>卡片上保留简称和要点，完整标题与链接收在这里。</p><ol><li>点击卡片，编辑论文信息。</li><li>拖动卡片边缘的圆点，连接两篇论文。</li><li>点击连线，描述它们的关系。</li></ol><p>选择卡片后可以只看附近关系，或拖动四角调整大小。</p><small>文件保存在你选择的位置；浏览器草稿仅用于临时恢复。</small></div>}
        <form onSubmit={event => { event.preventDefault(); apply(); }}>
          <fieldset disabled={busy}>
            {paperForm && <>
              <label>简称 · alias<input required value={form.alias ?? ''} onChange={e => field('alias', e.target.value)} placeholder="例如 ResNet" /></label>
              <label>核心认识 · takeaway<textarea required rows={5} value={form.takeaway ?? ''} onChange={e => field('takeaway', e.target.value)} placeholder="这篇论文最值得记住的是什么？" /></label>
              <label>论文原名 · name<textarea rows={3} value={form.name ?? ''} onChange={e => field('name', e.target.value)} placeholder="保留原始标题" /></label>
              <label>原文链接 · url<input type="url" value={form.url ?? ''} onChange={e => field('url', e.target.value)} placeholder="https://…" /></label>
              <label>年份 · year<input type="number" min="1" max="9999" step="1" value={form.year ?? ''} onChange={e => field('year', e.target.value)} /></label>
              {paper?.url && <a className="ps-link" href={paper.url} target="_blank" rel="noreferrer">打开论文原文 ↗</a>}
            </>}
            {selection?.kind === 'connection' && <>{(['source', 'target'] as const).map(key => <label key={key}>{key === 'source' ? '从这张卡片' : '指向这张卡片'}<select required value={form[key] ?? ''} onChange={e => field(key, e.target.value)}><option value="">请选择…</option>{canvas.nodes.map(n => <option key={n.id} value={n.id}>{title(n)}</option>)}</select></label>)}</>}
            {relationForm && <label>关系说明 · relation<textarea required rows={4} value={form.relation ?? ''} onChange={e => field('relation', e.target.value)} placeholder="例如：在残差连接的基础上改进…" /></label>}
            {selectedNode && !paper && <>
              <p className="ps-muted">这是一张{selectedNode.type === 'text' ? '备注' : selectedNode.type === 'file' ? '文件' : selectedNode.type === 'link' ? '链接' : '分组'}卡片。</p>
              {selectedNode.type === 'text' && <label>内容<textarea rows={12} value={form.text ?? ''} onChange={e => field('text', e.target.value)} /></label>}
              {selectedNode.type === 'file' && <p className="ps-file-path">{selectedNode.file}{selectedNode.subpath}<br /><small>相对文件路径按画布所在目录理解。此版本不内嵌读取附件。</small></p>}
              {selectedNode.type === 'link' && selectedNode.url && /^https?:\/\//i.test(selectedNode.url) && <a href={selectedNode.url} target="_blank" rel="noreferrer">打开链接 ↗</a>}
              {selectedNode.type === 'group' && <p>{selectedNode.label ?? '分组'}<br /><small>可移动分组框；框内卡片的位置分别保存。</small></p>}
            </>}
            {editable && <button className="ps-primary ps-apply" type="submit">应用更改</button>}
            {formDirty && <p className="ps-muted">应用后再保存文件。</p>}
            {(selection?.kind === 'node' || selection?.kind === 'edge') && <button type="button" className="ps-danger" onClick={removeSelected}>删除{selection.kind === 'node' ? '卡片' : '关系'}</button>}
          </fieldset>
        </form>
      </aside>
    </div>
    <footer className={`ps-status ${error ? 'has-error' : ''}`} role={error ? 'alert' : 'status'}>
      <span>{busy ? '正在处理文件…' : error || notice}</span>
      <button disabled={busy || formDirty} onClick={() => { downloadFile(fileName, source); setNotice('已发起下载；请保留下载的 .canvas 文件。'); }}>下载副本</button>
    </footer>
    <input ref={input} hidden type="file" accept=".canvas,application/json" onChange={async event => {
      const selected = event.target.files?.[0]; event.target.value = '';
      if (!selected) return;
      setBusy(true);
      try { replace(await selected.text(), selected.name, null); }
      catch (err) { setError(message(err)); }
      finally { setBusy(false); }
    }} />
  </div>;
}
