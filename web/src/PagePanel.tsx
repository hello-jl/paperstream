import { useEffect, useRef, useState } from 'react';
import type { JSONCanvasDocument } from './canvas';
import { readPaper } from './canvas';
import { createPresentationPage, movePresentationPage, presentationDocuments, readPresentationPages, removePresentationPage, updatePresentationPage } from './presentation-pages';
import { downloadGraph, exportGraphSvg } from './graph-export';
import './presentation-pages.css';

export interface PagePanelProps {
  document: JSONCanvasDocument;
  onChange: (document: JSONCanvasDocument) => void;
  onFocus: (nodeIds: string[]) => void;
  onClose: () => void;
  selectedNodeIds?: string[];
}

/** Page membership is separate from the graph: removing a slide never removes research. */
export function PagePanel({ document, onChange, onFocus, onClose, selectedNodeIds = [] }: PagePanelProps) {
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [playing, setPlaying] = useState(false);
  const [exporting, setExporting] = useState(false);
  let pages;
  try { pages = readPresentationPages(document); }
  catch (cause) { return <aside className="ps-pages-panel" role="dialog" aria-label="演示页面"><header><strong>演示页面</strong><button onClick={onClose}>关闭</button></header><p role="alert">{cause instanceof Error ? cause.message : String(cause)}</p></aside>; }
  const current = pages.find(page => page.id === currentId) ?? pages[0];
  const currentIndex = current ? pages.indexOf(current) : -1;
  const known = new Set(document.nodes.map(node => node.id));
  function change(operation: () => JSONCanvasDocument) {
    try { onChange(operation()); setError(''); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  }
  function add(nodeIds: string[], title?: string) {
    change(() => {
      const next = createPresentationPage(document, { title, nodeIds });
      setCurrentId(readPresentationPages(next).at(-1)!.id); return next;
    });
  }
  return <>
    <aside className="ps-pages-panel" role="dialog" aria-label="演示页面">
      <header><strong>演示页面</strong><button aria-label="关闭演示页面" onClick={onClose}>×</button></header>
      <div className="ps-pages-actions">
        <button onClick={() => add(selectedNodeIds.filter(id => known.has(id)))}>＋ 页面</button>
        <button onClick={() => add(document.nodes.map(node => node.id), '整图')}>＋ 整图页</button>
        <button disabled={!document.nodes.some(node => (node.paperstreamCard as { kind?: string } | undefined)?.kind === 'page')}
          onClick={() => change(() => {
            let next = document;
            for (const node of document.nodes.filter(node => (node.paperstreamCard as { kind?: string } | undefined)?.kind === 'page')) {
              if (!readPresentationPages(next).some(page => page.nodeIds.includes(node.id))) next = createPresentationPage(next, { title: node.label || '插页', nodeIds: [node.id] });
            }
            return next;
          })}>从插页建页</button>
      </div>
      <nav className="ps-page-list" aria-label="页面顺序">{pages.map((page, index) => <button key={page.id} aria-current={page.id === current?.id ? 'page' : undefined}
        onClick={() => setCurrentId(page.id)}><span>{index + 1}</span>{page.title || '未命名页面'}<small>{page.nodeIds.filter(id => known.has(id)).length} 张卡片</small></button>)}</nav>
      {!pages.length && <p className="ps-pages-help">尚未分页时导出整图。新增页面后，可选择卡片并调整顺序，PPTX 会按此列表生成多张幻灯片。</p>}
      {current && <section className="ps-page-fields">
        <label>页面标题<input aria-label="页面标题" value={current.title} onChange={event => change(() => updatePresentationPage(document, current.id, { title: event.target.value }))} /></label>
        <div className="ps-pages-actions">
          <button disabled={currentIndex === 0} onClick={() => change(() => movePresentationPage(document, current.id, -1))}>上移</button>
          <button disabled={currentIndex === pages.length - 1} onClick={() => change(() => movePresentationPage(document, current.id, 1))}>下移</button>
          <button onClick={() => onFocus(current.nodeIds.filter(id => known.has(id)))}>定位本页</button>
          <button onClick={() => change(() => removePresentationPage(document, current.id))} title="只删除页面配置，画布卡片保留">删除页</button>
        </div>
        <fieldset><legend>本页卡片</legend>{document.nodes.map(node => <label key={node.id} className="ps-page-member"><input type="checkbox" checked={current.nodeIds.includes(node.id)}
          onChange={event => change(() => updatePresentationPage(document, current.id, { nodeIds: event.target.checked
            ? [...current.nodeIds.filter(id => known.has(id)), node.id] : current.nodeIds.filter(id => known.has(id) && id !== node.id) }))} />
          <span>{readPaper(node)?.alias ?? node.label ?? node.file ?? node.url ?? node.text?.slice(0, 45) ?? '卡片'}</span></label>)}</fieldset>
        {current.nodeIds.some(id => !known.has(id)) && <p className="ps-pages-help">本页有 {current.nodeIds.filter(id => !known.has(id)).length} 张卡片已不在画布中；重新选择成员会清理这些失效引用。</p>}
      </section>}
      {error && <p className="ps-pages-error" role="alert">{error}</p>}
      <footer><button onClick={() => setPlaying(true)}>▶ 放映</button><button disabled={exporting} onClick={() => {
        setExporting(true); void downloadGraph(document, 'pptx', typeof document.title === 'string' ? document.title : 'paperstream-pages').catch(cause => setError(String(cause))).finally(() => setExporting(false));
      }}>{exporting ? '导出中…' : '导出多页 PPTX'}</button></footer>
    </aside>
    {playing && <PresentationView document={document} startPageId={current?.id} onClose={() => setPlaying(false)} />}
  </>;
}

export function PresentationView({ document, startPageId, onClose }: { document: JSONCanvasDocument; startPageId?: string; onClose: () => void }) {
  const pages = presentationDocuments(document);
  const [index, setIndex] = useState(() => Math.max(0, pages.findIndex(entry => entry.page.id === startPageId)));
  const screen = useRef<HTMLDivElement>(null);
  const safeIndex = Math.min(index, pages.length - 1), current = pages[safeIndex];
  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'ArrowRight' || event.key === 'PageDown' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); setIndex(old => Math.min(pages.length - 1, old + 1)); }
      else if (event.key === 'ArrowLeft' || event.key === 'PageUp') { event.preventDefault(); event.stopPropagation(); setIndex(old => Math.max(0, old - 1)); }
      else if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose(); }
    };
    window.addEventListener('keydown', keyboard, true); screen.current?.focus();
    return () => window.removeEventListener('keydown', keyboard, true);
  }, [pages.length, onClose]);
  const source = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(exportGraphSvg(current.document))}`;
  return <div ref={screen} className="ps-presentation-screen" role="dialog" aria-label="页面放映" aria-modal="true" tabIndex={-1}>
    <header><strong>{current.page.title || '未命名页面'}</strong><span>{safeIndex + 1} / {pages.length}</span><button onClick={onClose}>退出放映</button></header>
    <img src={source} alt={`${current.page.title || '页面'}：${current.document.nodes.length} 张卡片`} />
    <footer><button disabled={safeIndex === 0} onClick={() => setIndex(old => Math.max(0, old - 1))}>上一页</button><button disabled={safeIndex === pages.length - 1} onClick={() => setIndex(old => Math.min(pages.length - 1, old + 1))}>下一页</button></footer>
  </div>;
}
