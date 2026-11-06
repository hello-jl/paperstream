import { CanvasError } from './canvas.ts';
import type { JSONCanvasDocument } from './canvas.ts';

export interface PresentationPage {
  id: string;
  title: string;
  nodeIds: string[];
  [key: string]: unknown;
}
export interface NewPresentationPage { title?: string; nodeIds: string[]; id?: string }

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
function configuration(document: JSONCanvasDocument): Record<string, unknown> {
  if (document.paperstreamPresentation === undefined) return {};
  if (!record(document.paperstreamPresentation)) throw new CanvasError('演示页面设置不是有效对象，原始数据已保留。');
  return document.paperstreamPresentation;
}
/** Keep missing node IDs readable: deleting a graph node must not erase a page. */
export function readPresentationPages(document: JSONCanvasDocument): PresentationPage[] {
  const config = configuration(document);
  if (config.pages === undefined) return [];
  if (!Array.isArray(config.pages)) throw new CanvasError('演示页面列表无效，原始数据已保留。');
  const used = new Set<string>();
  return config.pages.map(value => {
    if (!record(value) || typeof value.id !== 'string' || !value.id.trim() || used.has(value.id)
      || typeof value.title !== 'string' || !Array.isArray(value.nodeIds)
      || !value.nodeIds.every(id => typeof id === 'string') || new Set(value.nodeIds).size !== value.nodeIds.length) {
      throw new CanvasError('演示页面字段无效或 ID 重复，原始数据已保留。');
    }
    used.add(value.id);
    return { ...value, id: value.id, title: value.title, nodeIds: [...value.nodeIds] as string[] };
  });
}
function setPages(document: JSONCanvasDocument, pages: PresentationPage[]): JSONCanvasDocument {
  return { ...document, paperstreamPresentation: { ...configuration(document), pages } };
}
function requireNodes(document: JSONCanvasDocument, nodeIds: string[]): void {
  const known = new Set(document.nodes.map(node => node.id));
  if (new Set(nodeIds).size !== nodeIds.length || nodeIds.some(id => !known.has(id))) {
    throw new CanvasError('页面只能包含当前画布中不重复的卡片。');
  }
}
export function createPresentationPage(document: JSONCanvasDocument, input: NewPresentationPage): JSONCanvasDocument {
  const pages = readPresentationPages(document);
  requireNodes(document, input.nodeIds);
  const id = input.id ?? crypto.randomUUID().replaceAll('-', '');
  if (!id.trim() || pages.some(page => page.id === id)) throw new CanvasError('演示页面 ID 无效或重复。');
  return setPages(document, [...pages, { id, title: input.title ?? `页面 ${pages.length + 1}`, nodeIds: [...input.nodeIds] }]);
}
export function updatePresentationPage(document: JSONCanvasDocument, id: string, patch: { title?: string; nodeIds?: string[] }): JSONCanvasDocument {
  const pages = readPresentationPages(document);
  if (!pages.some(page => page.id === id)) throw new CanvasError('未找到演示页面。');
  if (patch.nodeIds) requireNodes(document, patch.nodeIds);
  return setPages(document, pages.map(page => page.id === id ? { ...page, ...patch, nodeIds: [...(patch.nodeIds ?? page.nodeIds)] } : page));
}
export function removePresentationPage(document: JSONCanvasDocument, id: string): JSONCanvasDocument {
  const pages = readPresentationPages(document);
  if (!pages.some(page => page.id === id)) throw new CanvasError('未找到演示页面。');
  return setPages(document, pages.filter(page => page.id !== id));
}
export function movePresentationPage(document: JSONCanvasDocument, id: string, offset: -1 | 1): JSONCanvasDocument {
  const pages = readPresentationPages(document), index = pages.findIndex(page => page.id === id);
  if (index < 0) throw new CanvasError('未找到演示页面。');
  const target = index + offset;
  if (target < 0 || target >= pages.length) return document;
  [pages[index], pages[target]] = [pages[target], pages[index]];
  return setPages(document, pages);
}
/** A derived view only: the saved source graph keeps every node and unknown field. */
export function pageDocument(document: JSONCanvasDocument, page: PresentationPage): JSONCanvasDocument {
  const ids = new Set(page.nodeIds), { paperstreamPresentation: _configuration, ...rest } = document;
  return { ...rest, nodes: document.nodes.filter(node => ids.has(node.id)),
    edges: document.edges.filter(edge => ids.has(edge.fromNode) && ids.has(edge.toNode)),
    paperstreamExportPageTitle: page.title };
}
export function presentationDocuments(document: JSONCanvasDocument): Array<{ page: PresentationPage; document: JSONCanvasDocument }> {
  const pages = readPresentationPages(document);
  return (pages.length ? pages : [{ id: 'whole-graph', title: typeof document.title === 'string' ? document.title : '整图', nodeIds: document.nodes.map(node => node.id) }])
    .map(page => ({ page, document: pageDocument(document, page) }));
}
