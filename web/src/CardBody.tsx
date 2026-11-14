import { cloneElement, isValidElement, useEffect, useId, useRef, useState } from 'react';
import type { PointerEvent, ReactElement, ReactNode } from 'react';
import type { CanvasNode, Paper } from './canvas';
import {
  addFigurePatch, figureCaption, figureFromFile, getCardKind, readFigures, removeFigurePatch, takeawayBlocks, updateFigurePatch,
} from './card-media';
import type { CardFigure, FigurePatch } from './card-media';
import { figureAlign, figureDimensions, figureLayout, readFigureFrame } from './figure-layout';
import type { FigureAlign } from './figure-layout';
import './card-body.css';

export interface CardBodyProps {
  node: CanvasNode;
  paper: Paper | null;
  editing: 'alias' | 'takeaway' | 'relation' | 'label' | 'text' | null;
  draft: Record<string, string> | null;
  editText: (field: 'alias' | 'takeaway', value: string) => ReactNode;
  editNote?: (field: 'label' | 'text', value: string) => ReactNode;
  selected: boolean;
  busy: boolean;
  onPatchNode: (patch: Partial<CanvasNode>) => void;
  onOpenUrl?: (url: string) => void;
}

/** Plain React text only: '<script>' and HTML in takeaways remain literal. */
export function TakeawayText({ text }: { text: string }) {
  return <>{takeawayBlocks(text).map((block, index) => block.type === 'list'
    ? <span key={index} className="ps-takeaway-list" role="list">{block.items.map((item, itemIndex) =>
      <span key={itemIndex} className="ps-takeaway-item" role="listitem">{item}</span>)}</span>
    : <span className="ps-takeaway-paragraph" key={index}>{block.text}</span>)}</>;
}

function Figure({ figure, selected, busy, onResize }: {
  figure: CardFigure; selected: boolean; busy: boolean; onResize: (width: number) => void;
}) {
  const caption = figureCaption(figure);
  const align = figureAlign(figure), frame = readFigureFrame(figure), layout = figureLayout(figure, 1);
  const dimensions = figureDimensions(figure), width = figure.widthPercent;
  const element = useRef<HTMLElement>(null);
  const gesture = useRef<{ id: number; startX: number; width: number; parentWidth: number; current: number;
    scale: number; target: HTMLButtonElement } | null>(null);
  const detach = useRef<(() => void) | null>(null);
  const latest = useRef({ width: figure.widthPercent, onResize });
  latest.current = { width: figure.widthPercent, onResize };
  const [preview, setPreview] = useState<number | null>(null);
  const release = (current: NonNullable<typeof gesture.current>) => {
    if (current.target.hasPointerCapture(current.id)) current.target.releasePointerCapture(current.id);
  };
  const finish = (commit: boolean) => {
    const current = gesture.current;
    if (!current) return;
    // Clear before releasing capture: any resulting event must not commit twice.
    gesture.current = null;
    detach.current?.(); detach.current = null;
    release(current); setPreview(null);
    if (commit && current.current !== latest.current.width) latest.current.onResize(current.current);
  };
  useEffect(() => () => {
    const current = gesture.current; gesture.current = null;
    detach.current?.(); detach.current = null;
    if (current) release(current);
  }, []);
  const begin = (event: PointerEvent<HTMLButtonElement>) => {
    event.preventDefault(); event.stopPropagation();
    const parentWidth = element.current?.parentElement?.getBoundingClientRect().width;
    if (!parentWidth || busy) return;
    finish(false);
    const target = event.currentTarget;
    gesture.current = { id: event.pointerId, startX: event.clientX, width: figure.widthPercent,
      parentWidth, current: figure.widthPercent, scale: align === 'center' ? 2 : align === 'right' ? -1 : 1, target };
    const view = target.ownerDocument.defaultView ?? window;
    const move = (pointer: globalThis.PointerEvent) => {
      const current = gesture.current;
      if (!current || pointer.pointerId !== current.id) return;
      pointer.preventDefault(); pointer.stopPropagation();
      current.current = Math.round(Math.min(100, Math.max(15,
        current.width + (pointer.clientX - current.startX) / current.parentWidth * 100 * current.scale)));
      setPreview(current.current);
    };
    const end = (pointer: globalThis.PointerEvent, commit: boolean) => {
      if (!gesture.current || pointer.pointerId !== gesture.current.id) return;
      pointer.preventDefault(); pointer.stopPropagation();
      // A final pointer position may arrive without a preceding move event.
      if (commit) move(pointer);
      finish(commit);
    };
    const up = (pointer: globalThis.PointerEvent) => end(pointer, true);
    const cancel = (pointer: globalThis.PointerEvent) => end(pointer, false);
    const blur = () => finish(false);
    view.addEventListener('pointermove', move, { capture: true, passive: false });
    view.addEventListener('pointerup', up, { capture: true, passive: false });
    view.addEventListener('pointercancel', cancel, { capture: true, passive: false });
    view.addEventListener('blur', blur);
    detach.current = () => {
      view.removeEventListener('pointermove', move, true);
      view.removeEventListener('pointerup', up, true);
      view.removeEventListener('pointercancel', cancel, true);
      view.removeEventListener('blur', blur);
    };
    // The window listeners also cover a grip moved by natural card reflow.
    // They remain the fallback when the browser cannot retain pointer capture.
    try { target.setPointerCapture(event.pointerId); } catch { /* Window owns the active gesture. */ }
  };
  return <figure ref={element} className={`ps-card-figure ps-figure-align-${align}`}>
    <div className={`ps-figure-media${frame ? ' is-framed' : ''}`} style={{ width: `${preview ?? width}%`,
      ...(frame ? { aspectRatio: frame.aspectRatio } : {}) }}>
      <img src={figure.src} alt={caption || '论文插图'} draggable={false}
        width={dimensions.width} height={dimensions.height} style={frame ? {
          left: `${layout.image.x / layout.width * 100}%`, top: `${layout.image.y / layout.height * 100}%`,
          width: `${layout.image.width / layout.width * 100}%`, height: `${layout.image.height / layout.height * 100}%`,
        } : undefined} />
      {selected && <button type="button" className={`ps-figure-resize nodrag nopan${align === 'right' ? ' is-left' : ''}`} disabled={busy}
      aria-label={`调整图片大小：${caption || 'fig'}`} title="拖动调整图片宽度；双击恢复铺满"
      onPointerDown={begin}
      onDoubleClick={event => { event.preventDefault(); event.stopPropagation(); onResize(100); }}
      onKeyDown={event => {
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
          event.preventDefault(); event.stopPropagation();
          onResize(Math.min(100, Math.max(15, figure.widthPercent + (event.key === 'ArrowRight' ? 5 : -5))));
        }
      }}>{align === 'right' ? '↙' : '↘'}</button>}
    </div>
    {caption && <figcaption style={{ width: `${align === 'center' ? 100 : preview ?? width}%` }}>{caption}</figcaption>}
  </figure>;
}

export function CardBody({ node, paper, editing, editText, editNote, selected, busy, onPatchNode, onOpenUrl }: CardBodyProps) {
  const kind = getCardKind(node, Boolean(paper));
  const kindLabel = node.type === 'group' ? '分组' : node.type === 'file' ? '文件' : node.type === 'link' ? '链接'
    : kind === 'page' ? '插页' : kind === 'relation' ? 'Relation' : 'Note';
  const figures = readFigures(node);
  const [error, setError] = useState('');
  const link = paper?.url ?? (node.type === 'link' ? node.url : undefined);
  const safeLink = link && /^https?:\/\//i.test(link) ? link : undefined;
  let takeaway: ReactNode;
  if (paper) {
    const editable = editText('takeaway', paper.takeaway);
    takeaway = !paper.takeaway || editing === 'takeaway' || !isValidElement(editable) ? editable
      : cloneElement(editable as ReactElement<{ children?: ReactNode }>, undefined, <TakeawayText text={paper.takeaway} />);
  } else if (node.type === 'text') {
    const text = node.text ?? '';
    const editable = editNote?.('text', text);
    takeaway = !editable ? <TakeawayText text={text} /> : !text || editing === 'text' || !isValidElement(editable) ? editable
      : cloneElement(editable as ReactElement<{ children?: ReactNode }>, undefined, <TakeawayText text={text} />);
  }
  else takeaway = node.type === 'group' ? '' : '右键查看详情';
  const heading = paper ? editText('alias', paper.alias) : node.label
    ?? (node.type === 'file' ? node.file : node.type === 'link' ? node.url : kind === 'page' ? '插页' : kind === 'relation' ? '关系' : 'Note');
  const patchFigure = (figure: CardFigure, width: number) => {
    try { onPatchNode(updateFigurePatch(node, figure.id, { widthPercent: width })); setError(''); }
    catch (err) { setError(err instanceof Error ? err.message : String(err)); }
  };
  return <>
    {kind !== 'paper' && <span className="ps-card-kind">{kindLabel}</span>}
    {safeLink && <a className="ps-card-open nodrag nopan" href={safeLink} target="_blank" rel="noopener noreferrer"
      aria-label="打开论文原文" title="打开论文原文"
      onContextMenu={event => event.stopPropagation()}
      onPointerDown={event => event.stopPropagation()}
      onClick={event => { event.stopPropagation(); if (onOpenUrl && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) { event.preventDefault(); onOpenUrl(safeLink); } }}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6M20 4l-10 10M10 4H4v16h16v-6" /></svg>
    </a>}
    <div className={`ps-card-title${safeLink ? ' has-open-link' : ''}`}>{!paper && node.type === 'text' && editNote
      ? editNote('label', node.label ?? '') : heading}</div>
    <div className="ps-card-takeaway">{takeaway}</div>
    {figures.length > 0 && <div className="ps-card-figures">{figures.map(figure =>
      <Figure key={figure.id} figure={figure} selected={selected} busy={busy} onResize={width => patchFigure(figure, width)} />)}</div>}
    {error && <span className="ps-card-media-error" role="alert">{error}</span>}
  </>;
}

export interface FigureControlsProps {
  node: CanvasNode;
  busy: boolean;
  onPatchNode: (patch: Partial<CanvasNode>, field?: string) => void;
}

/** Keep incomplete input local; only valid sizes become document changes. */
function FigureWidthInput({ value, disabled, onChange }: {
  value: number; disabled: boolean; onChange: (value: number) => void;
}) {
  const [buffer, setBuffer] = useState(String(value));
  const [invalid, setInvalid] = useState(false);
  const latestValid = useRef(value);
  const ownChange = useRef<number | null>(null);
  const focused = useRef(false);
  const helpId = useId();
  useEffect(() => {
    latestValid.current = value;
    // Preserve a user's decimal point/caret when our own edit is echoed back.
    // A drag, fill button, or undo instead replaces even an incomplete buffer.
    if (focused.current && ownChange.current === value) { ownChange.current = null; return; }
    ownChange.current = null; setBuffer(String(value)); setInvalid(false);
  }, [value]);
  function change(text: string) {
    setBuffer(text);
    const trimmed = text.trim(), number = Number(trimmed);
    const valid = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(trimmed) && Number.isFinite(number) && number >= 15 && number <= 100;
    setInvalid(!valid);
    if (valid) {
      latestValid.current = number; ownChange.current = number;
      if (number !== value) onChange(number);
    }
  }
  return <label>宽度 %<input aria-label="图片宽度百分比" role="spinbutton" type="text" inputMode="decimal"
    aria-valuemin={15} aria-valuemax={100} aria-valuenow={value} aria-invalid={invalid || undefined}
    aria-describedby={invalid ? helpId : undefined} disabled={disabled} value={buffer}
    onFocus={() => { focused.current = true; }} onChange={event => change(event.target.value)}
    onBlur={() => {
      focused.current = false; ownChange.current = null;
      setBuffer(String(latestValid.current)); setInvalid(false);
    }}
    onKeyDown={event => {
      if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur(); }
      if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
        event.preventDefault(); event.stopPropagation();
        change(String(Math.min(100, Math.max(15, latestValid.current + (event.key === 'ArrowUp' ? 1 : -1)))));
      }
    }} />
    {invalid && <span id={helpId} className="ps-card-media-error" role="status">请输入 15–100 的数字；图片保留最近有效宽度。</span>}
  </label>;
}
/** Image controls are contextual, so selecting a card never changes its height. */
export function FigureControls({ node, busy, onPatchNode }: FigureControlsProps) {
  const input = useRef<HTMLInputElement>(null);
  const currentNode = useRef(node); currentNode.current = node;
  const mounted = useRef(true);
  const uploadGeneration = useRef(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const figures = readFigures(node);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { uploadGeneration.current++; setLoading(false); setError(''); }, [node.id]);
  function update(id: string, patch: FigurePatch) {
    try {
      const next = updateFigurePatch(currentNode.current, id, patch);
      currentNode.current = { ...currentNode.current, ...next };
      onPatchNode(next, `figure:${id}:${Object.keys(patch).join(':')}`); setError('');
    }
    catch (err) { setError(err instanceof Error ? err.message : String(err)); }
  }
  return <section className="ps-figure-controls nodrag nopan" aria-label="卡片图片"
    onPointerDown={event => event.stopPropagation()} onClick={event => event.stopPropagation()}>
    <div className="ps-figure-controls-heading"><span>Fig</span><button type="button" disabled={busy || loading}
      onClick={() => input.current?.click()}>{loading ? '载入图片…' : '＋ 图片'}</button></div>
    <p className="ps-figure-help">选中卡片后按 Cmd/Ctrl+V 粘贴图片，或点击“＋ 图片”。PNG / JPEG / WebP · 每张 ≤ 8 MB、3200 万像素。拖图片右下角调大小。</p>
    <input ref={input} type="file" hidden multiple accept="image/png,image/jpeg,image/webp"
      onChange={async event => {
        const files = [...(event.currentTarget.files ?? [])]; event.currentTarget.value = '';
        if (!files.length) return;
        const generation = ++uploadGeneration.current;
        const targetId = node.id;
        setLoading(true); setError('');
        try {
          const additions: CardFigure[] = [];
          for (const file of files) additions.push(await figureFromFile(file));
          if (!mounted.current || uploadGeneration.current !== generation || currentNode.current.id !== targetId) return;
          // Decode may take time: compose against the latest card metadata and
          // never attach a finished upload to another card or a closed document.
          let next = currentNode.current;
          for (const figure of additions) next = { ...next, ...addFigurePatch(next, figure) };
          onPatchNode({ paperstreamCard: next.paperstreamCard });
        } catch (err) {
          if (mounted.current && uploadGeneration.current === generation) setError(err instanceof Error ? err.message : String(err));
        }
        finally { if (mounted.current && uploadGeneration.current === generation) setLoading(false); }
      }} />
    {figures.map(figure => {
      const frame = readFigureFrame(figure);
      const mode = !frame ? 'natural' : frame.aspectRatio === .75 && frame.fit === 'cover' ? 'portrait'
        : frame.aspectRatio === 1 && frame.fit === 'cover' ? 'square' : frame.aspectRatio === 1 && frame.fit === 'contain' ? 'contain' : 'custom';
      return <div className="ps-figure-control" key={`${node.id}:${figure.id}`}>
      <label>图片说明<input aria-label="图片说明" disabled={busy || loading}
        value={figure.caption} onChange={event => update(figure.id, { caption: event.target.value })} /></label>
      <div className="ps-figure-control-row ps-figure-presentation">
        <label>显示<select aria-label="图片显示方式" value={mode} disabled={busy || loading}
          onChange={event => {
            const value = event.target.value;
            if (value === 'custom') return;
            update(figure.id, { frame: value === 'natural' ? null : {
              aspectRatio: value === 'portrait' ? .75 : 1, fit: value === 'contain' ? 'contain' : 'cover',
              positionX: 50, positionY: 50, zoom: 1,
            } });
          }}>
          <option value="natural">原图</option><option value="square">方形头像</option>
          <option value="portrait">肖像 3:4</option><option value="contain">完整方形</option>
          {mode === 'custom' && <option value="custom">自定义取景框</option>}
        </select></label>
        <label>对齐<select aria-label="图片对齐" value={figureAlign(figure)} disabled={busy || loading}
          onChange={event => update(figure.id, { align: event.target.value as FigureAlign })}>
          <option value="left">靠左</option><option value="center">居中</option><option value="right">靠右</option>
        </select></label>
      </div>
      {frame?.fit === 'cover' && <div className="ps-figure-framing">
        <label>取景上下 <span>{frame.positionY}%</span><input type="range" aria-label="图片取景上下" min="0" max="100" step="1"
          disabled={busy || loading} value={frame.positionY} onChange={event => update(figure.id, { frame: { ...frame, positionY: Number(event.target.value) } })} /></label>
        <label>取景放大 <span>{frame.zoom.toFixed(2)}×</span><input type="range" aria-label="图片取景放大" min="1" max="4" step="0.05"
          disabled={busy || loading} value={frame.zoom} onChange={event => update(figure.id, { frame: { ...frame, zoom: Number(event.target.value) } })} /></label>
      </div>}
      <div className="ps-figure-control-row"><FigureWidthInput value={figure.widthPercent} disabled={busy || loading}
        onChange={widthPercent => update(figure.id, { widthPercent })} />
        <button type="button" disabled={busy || loading} onClick={() => update(figure.id, { widthPercent: 100 })}>铺满</button>
        <button type="button" disabled={busy || loading} aria-label={`移除图片：${figure.caption}`} onClick={() => {
          try { onPatchNode(removeFigurePatch(node, figure.id)); setError(''); }
          catch (err) { setError(err instanceof Error ? err.message : String(err)); }
        }}>移除</button>
      </div>
    </div>; })}
    {error && <p className="ps-card-media-error" role="alert">{error}</p>}
  </section>;
}
