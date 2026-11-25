/** Portable graph exports. Source documents are never mutated. */
import { CARD_LAYOUT } from './card-layout.ts';
import { readPaper, serializeCanvas } from './canvas.ts';
import type { CanvasEdge, CanvasNode, JSONCanvasDocument } from './canvas.ts';
import { getNodeStrokeWidth, getEdgeStrokeWidth } from './appearance.ts';
import { figureCaption, getCardKind, readFigures } from './card-media.ts';
import { figureAlign, figureLayout } from './figure-layout.ts';
import { isRelationNode, relationEdgeSides } from './graph-relations.ts';
import { getContentBounds, layoutEdgeLabels } from './edge-label-layout.ts';
import type { Point, Rect } from './edge-label-layout.ts';
import { readEdgeRouting } from './edge-routing.ts';
import { buildConnectionPath, connectionMidpoint, sampleConnectionPath } from './connection-path.ts';
import type { ConnectionPath, ConnectionStyle } from './connection-path.ts';

export type GraphExportFormat = 'svg' | 'png';
export interface GraphExportOptions {
  connectionStyle?: ConnectionStyle;
  background?: string;
  foreground?: string;
  muted?: string;
  cardBackground?: string;
  cardBorder?: string;
  edgeColor?: string;
  surfaceAlt?: string;
  padding?: number;
  /** PNG rasterization density; bounded to avoid accidental huge allocations. */
  scale?: number;
}
interface TextBlock extends Rect { lines: string[]; fontSize: number; lineHeight: number; bold?: boolean; align?: 'center' | 'right'; color: string; }
interface Figure extends Rect { src: string; radius: number; framed: boolean; image: Rect; }
interface ExportNode extends Rect { id: string; radius: number; border: string; strokeWidth: number; kind?: TextBlock; title?: TextBlock; body: TextBlock; year?: TextBlock; figures: Figure[]; captions: TextBlock[]; url?: string; group: boolean; }
interface ExportEdge extends ConnectionPath { id: string; color: string; strokeWidth: number; dash: string; shape: string; start: boolean; end: boolean; label?: TextBlock; }
export interface ExportScene { bounds: Rect; nodes: ExportNode[]; edges: ExportEdge[]; background: string; cardBackground: string; surfaceAlt: string; labelBorder: string; }
const PALETTE: Record<string, string> = { '1': '#c44848', '2': '#bb722f', '3': '#a58c25', '4': '#3e886c', '5': '#388c9d', '6': '#8b6cb2' };
// Canvas notes and extension fields can contain strings outside XML 1.0's
// character set. Keep the source intact, replacing only unrepresentable export
// characters; Unicode surrogate pairs (including emoji) remain unchanged.
const xml = (value: unknown) => String(value)
  .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ud800-\udfff\ufffe\uffff]/gu, '\ufffd')
  .replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]!));
const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const finite = (value: unknown, fallback: number) => typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;
function safeColor(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const color = PALETTE[value] ?? value;
  return /^#[\da-f]{6}$/i.test(color) ? color : fallback;
}
function measureText(text: string, size: number): number {
  return [...text].reduce((sum, char) => sum + (/[^\u0000-\u00ff]/u.test(char) ? size : /[ il.,:;'!|]/.test(char) ? size * .3 : /[MW@%]/.test(char) ? size : /[A-Z]/.test(char) ? size * .75 : size * .56), 0);
}
/** Shared line boxes keep SVG text and scene bounds in the same units. */
function textBlock(text: string, x: number, y: number, width: number, fontSize: number, lineHeight: number, color: string): TextBlock {
  const lines = text ? wrapExportText(text, width, fontSize) : [];
  return { x, y, width: Math.max(width, ...lines.map(line => measureText(line, fontSize))),
    height: lines.length * lineHeight, lines, fontSize, lineHeight, color };
}
function nodeContentRects(node: ExportNode): Rect[] {
  return [node.kind, node.title, node.body, ...node.figures, ...node.captions, node.year]
    .filter((block): block is TextBlock | Figure => Boolean(block && block.height > 0));
}
/** Wrap CJK by character, but keep fitting ASCII words and numbers together. */
export function wrapExportText(text: string, width: number, size: number): string[] {
  const lines: string[] = [];
  for (const raw of text.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.replace(/^\s*-\s+/, '• ');
    // Latin words / numeric identifiers are atomic unless the token itself is
    // wider than a full line. CJK characters remain individual break points.
    const tokens = line.match(/[A-Za-z0-9_]+(?:[-./:+][A-Za-z0-9_]+)*|[ \t]+|./gu) ?? [];
    let current = '';
    const append = (token: string) => {
      if (current && measureText(current + token, size) > width) {
        lines.push(current.trimEnd()); current = token.trimStart();
      } else current += token;
    };
    for (const token of tokens) {
      if (measureText(token, size) <= width) append(token);
      else for (const character of token) append(character);
    }
    lines.push(current.trimEnd());
  }
  return lines.length ? lines : [''];
}

function anchor(node: Rect, side: CanvasEdge['fromSide']): Point {
  if (side === 'top') return { x: node.x + node.width / 2, y: node.y };
  if (side === 'right') return { x: node.x + node.width, y: node.y + node.height / 2 };
  if (side === 'left') return { x: node.x, y: node.y + node.height / 2 };
  return { x: node.x + node.width / 2, y: node.y + node.height };
}
export function buildExportScene(document: JSONCanvasDocument, options: GraphExportOptions = {}): ExportScene {
  serializeCanvas(document);
  const ink = safeColor(options.foreground, '#263d34'), muted = safeColor(options.muted, '#617369');
  const cardBorder = safeColor(options.cardBorder, '#9ab3a3'), edgeColor = safeColor(options.edgeColor, '#70877e');
  const surfaceAlt = safeColor(options.surfaceAlt, '#eef3ed'), labelBorder = options.cardBorder !== undefined ? cardBorder : '#cad8ce';
  const nodes: ExportNode[] = document.nodes.map((node: CanvasNode) => {
    const paper = readPaper(node), kind = getCardKind(node, Boolean(paper)), relation = isRelationNode(node);
    const heading = paper?.alias ?? node.label ?? node.file ?? node.url ?? (kind === 'page' ? '插页' : 'Note');
    const body = paper?.takeaway ?? (node.type === 'text' ? node.text ?? '' : '');
    const strokeWidth = getNodeStrokeWidth(node);
    const inset = CARD_LAYOUT.paddingX + strokeWidth, contentX = node.x + inset, contentWidth = Math.max(1, node.width - inset * 2);
    let cursorY = node.y + strokeWidth + (relation ? CARD_LAYOUT.relationPaddingTop : CARD_LAYOUT.paddingTop);
    const kindLabel = node.type === 'group' ? '分组' : node.type === 'file' ? '文件' : node.type === 'link' ? '链接'
      : kind === 'page' ? '插页' : 'NOTE';
    const kindBlock = !relation && kind !== 'paper' ? textBlock(kindLabel, contentX, cursorY, contentWidth, 10, 15, muted) : undefined;
    if (kindBlock) cursorY += kindBlock.height + CARD_LAYOUT.gap;
    const url = paper?.url ?? node.url;
    const linked = typeof url === 'string' && /^https?:\/\//i.test(url);
    const titleWidth = Math.max(1, contentWidth - (linked ? CARD_LAYOUT.linkedTitleReserve : CARD_LAYOUT.titleReserve));
    const titleBlock = relation ? undefined : { ...textBlock(heading, contentX, cursorY, titleWidth, CARD_LAYOUT.titleSize, CARD_LAYOUT.titleLine, ink), bold: true };
    if (titleBlock?.height) cursorY += titleBlock.height + CARD_LAYOUT.gap;
    const bodyBlock = textBlock(body, contentX, cursorY, Math.max(1, contentWidth - (relation ? CARD_LAYOUT.sharedActionReserve : 0)), relation ? CARD_LAYOUT.relationBodySize : CARD_LAYOUT.bodySize, relation ? CARD_LAYOUT.relationBodyLine : CARD_LAYOUT.bodyLine, muted);
    if (relation) { bodyBlock.align = 'center'; bodyBlock.bold = true; }
    cursorY += bodyBlock.height;
    const figures: Figure[] = [], captions: TextBlock[] = [];
    for (const value of readFigures(node)) {
      const percent = Math.min(100, Math.max(15, finite(value.widthPercent, 100)));
      const width = contentWidth * percent / 100;
      const layout = figureLayout(value, width), height = layout.height, align = figureAlign(value);
      const figureX = contentX + (contentWidth - width) * (align === 'center' ? .5 : align === 'right' ? 1 : 0);
      if (figures.length || bodyBlock.height) cursorY += 10;
      figures.push({ src: value.src, x: figureX, y: cursorY, width, height, radius: layout.radius, framed: layout.framed,
        image: { ...layout.image, x: figureX + layout.image.x, y: cursorY + layout.image.y } });
      cursorY += height;
      const captionText = figureCaption(value);
      if (captionText) {
        cursorY += 5;
        const caption = textBlock(captionText, align === 'center' ? contentX : figureX, cursorY,
          align === 'center' ? contentWidth : width, 10, 14, muted);
        if (align !== 'left') caption.align = align;
        captions.push(caption); cursorY += caption.height;
      }
    }
    // The editor enforces the natural content minimum even for fixed-height
    // cards. Expand only the exported view, never the saved document; derive
    // ports and label obstacles from that same visible border below. Compact
    // relation nodes retain their explicit routing geometry.
    const height = relation ? node.height : Math.max(node.height, 100, Math.ceil(cursorY - node.y
      + (paper?.year ? CARD_LAYOUT.yearPadding : CARD_LAYOUT.paddingTop) + strokeWidth + 1));
    return { id: node.id, x: node.x, y: node.y, width: node.width, height,
      radius: relation ? CARD_LAYOUT.relationRadius : CARD_LAYOUT.radius,
      border: safeColor(node.color, cardBorder), strokeWidth, kind: kindBlock, title: titleBlock, body: bodyBlock,
      year: paper?.year ? { ...textBlock(String(paper.year), node.x + node.width - strokeWidth - CARD_LAYOUT.yearRight - 42,
        Math.max(node.y + height - strokeWidth - CARD_LAYOUT.yearBottom - CARD_LAYOUT.yearLine, cursorY + 10), 42, CARD_LAYOUT.yearSize, CARD_LAYOUT.yearLine, muted), align: 'right' } : undefined,
      figures, captions, url: typeof url === 'string' && /^https?:\/\//i.test(url) ? url : undefined, group: node.type === 'group' };
  });
  const nodeMap = new Map(nodes.map(node => [node.id, node]));
  const edges: ExportEdge[] = document.edges.map(edge => {
    const source = nodeMap.get(edge.fromNode)!, target = nodeMap.get(edge.toNode)!;
    const routing = readEdgeRouting(edge), sides = relationEdgeSides(document, edge);
    const geometry = buildConnectionPath({ source: anchor(source, sides.fromSide), target: anchor(target, sides.toSide),
      sourceSide: sides.fromSide, targetSide: sides.toSide, waypoints: routing.waypoints, style: options.connectionStyle });
    const style = record(edge.paperstreamStyle);
    const lines = edge.label ? wrapExportText(edge.label, 220, 12) : [];
    return { id: edge.id, ...geometry, color: safeColor(edge.color, edgeColor), strokeWidth: getEdgeStrokeWidth(edge),
      dash: style.lineStyle === 'dashed' ? '7 5' : style.lineStyle === 'dotted' ? '2 4' : '',
      shape: typeof style.arrowShape === 'string' ? style.arrowShape : 'triangle', start: edge.fromEnd === 'arrow', end: edge.toEnd !== 'none',
      label: lines.length ? { x: 0, y: 0, width: Math.max(...lines.map(line => measureText(line, 12)), 8) + 20,
        height: lines.length * 18, lines, fontSize: 12, lineHeight: 18, color: ink } : undefined };
  });
  const manual = new Map(document.edges.flatMap(edge => {
    const position = readEdgeRouting(edge).labelPosition;
    return position ? [[edge.id, position] as const] : [];
  }));
  const manualObstacles = edges.flatMap(edge => edge.label && manual.has(edge.id) ? [{
    x: manual.get(edge.id)!.x - edge.label.width / 2, y: manual.get(edge.id)!.y - (edge.label.lines.length * 18 + 12) / 2,
    width: edge.label.width, height: edge.label.lines.length * 18 + 12,
  }] : []);
  const placements = layoutEdgeLabels(edges.flatMap(edge => edge.label && !manual.has(edge.id) ? [{ id: edge.id, width: edge.label.width,
    height: edge.label.lines.length * 18 + 12, anchor: connectionMidpoint(edge), pathPoints: sampleConnectionPath(edge) }] : []), [...nodes, ...nodes.flatMap(nodeContentRects), ...manualObstacles]);
  for (const edge of edges) if (edge.label) {
    const center = manual.get(edge.id) ?? placements.get(edge.id)!;
    edge.label.x = center.x - edge.label.width / 2;
    edge.label.y = center.y - (edge.label.lines.length * 18 + 12) / 2;
    const original = document.edges.find(value => value.id === edge.id)!, sides = relationEdgeSides(document, original);
    Object.assign(edge, buildConnectionPath({ source: edge.points[0], target: edge.points.at(-1)!, sourceSide: sides.fromSide,
      targetSide: sides.toSide, waypoints: readEdgeRouting(original).waypoints, labelPosition: center, style: options.connectionStyle }));
  }
  const content = getContentBounds([...nodes.map(node => ({ x: node.x - node.strokeWidth / 2, y: node.y - node.strokeWidth / 2,
    width: node.width + node.strokeWidth, height: node.height + node.strokeWidth })), ...nodes.flatMap(nodeContentRects),
    ...edges.flatMap(edge => edge.label ? [{ x: edge.label.x - .5, y: edge.label.y - .5, width: edge.label.width + 1, height: edge.label.height + 13 }] : []),
    ...edges.map(edge => {
      const inset = Math.max(edge.strokeWidth / 2, edge.start || edge.end ? 9 : 0);
      return { x: edge.bounds.x - inset, y: edge.bounds.y - inset,
        width: edge.bounds.width + inset * 2, height: edge.bounds.height + inset * 2 };
    })]) ?? { x: 0, y: 0, width: 800, height: 450 };
  const padding = Math.min(200, Math.max(0, options.padding ?? 32));
  return { bounds: { x: content.x - padding, y: content.y - padding, width: content.width + padding * 2, height: content.height + padding * 2 }, nodes, edges,
    background: safeColor(options.background, '#f6f8f4'), cardBackground: safeColor(options.cardBackground, '#ffffff'),
    surfaceAlt, labelBorder };
}
function svgText(block: TextBlock, offsetY = 0): string {
  if (!block.lines.length) return '';
  const x = block.x + (block.align === 'center' ? block.width / 2 : block.align === 'right' ? block.width : 0);
  return `<text x="${x}" y="${block.y + block.fontSize + offsetY}" fill="${block.color}" font-size="${block.fontSize}" xml:space="preserve"${block.align ? ` text-anchor="${block.align === 'center' ? 'middle' : 'end'}"` : ''}${block.bold ? ' font-weight="700"' : ''}>${block.lines.map((line, index) => `<tspan x="${x}" dy="${index ? block.lineHeight : 0}">${xml(line)}</tspan>`).join('')}</text>`;
}
export function exportGraphSvg(document: JSONCanvasDocument, options: GraphExportOptions = {}): string {
  const scene = buildExportScene(document, options), b = scene.bounds;
  const markers = scene.edges.map((edge, index) => `<marker id="arrow-${index}" viewBox="0 0 12 12" refX="10" refY="6" markerWidth="9" markerHeight="9" orient="auto-start-reverse" markerUnits="userSpaceOnUse">${edge.shape === 'circle' ? `<circle cx="6" cy="6" r="4" fill="${edge.color}"/>` : edge.shape === 'diamond' ? `<path d="M1 6 6 1 11 6 6 11Z" fill="${edge.color}"/>` : `<path d="M1 1 11 6 1 11${edge.shape === 'open' ? '' : 'Z'}" fill="${edge.shape === 'open' ? 'none' : edge.color}" stroke="${edge.color}"/>`}</marker>`).join('');
  const edgeMarkup = scene.edges.map((edge, index) => `<path d="${edge.path}" fill="none" stroke="${edge.color}" stroke-width="${edge.strokeWidth}"${edge.dash ? ` stroke-dasharray="${edge.dash}"` : ''}${edge.start ? ` marker-start="url(#arrow-${index})"` : ''}${edge.end ? ` marker-end="url(#arrow-${index})"` : ''}/>`).join('');
  const figureClips = scene.nodes.flatMap((node, nodeIndex) => node.figures.map((fig, figureIndex) =>
    `<clipPath id="figure-${nodeIndex}-${figureIndex}" clipPathUnits="userSpaceOnUse"><rect x="${fig.x}" y="${fig.y}" width="${fig.width}" height="${fig.height}" rx="${fig.radius}"/></clipPath>`)).join('');
  const nodeMarkup = scene.nodes.map((node, nodeIndex) => `${node.url ? `<a href="${xml(node.url)}" target="_blank" rel="noopener noreferrer">` : ''}<g data-node-id="${xml(node.id)}"><rect x="${node.x}" y="${node.y}" width="${node.width}" height="${node.height}" rx="${node.radius}" fill="${scene.cardBackground}"${node.group ? ' fill-opacity="0.45" stroke-dasharray="6 4"' : ''} stroke="${node.border}" stroke-width="${node.strokeWidth}"/>${node.kind ? svgText(node.kind) : ''}${node.title ? svgText(node.title) : ''}${svgText(node.body)}${node.figures.map((fig, figureIndex) => `${fig.framed ? `<rect x="${fig.x}" y="${fig.y}" width="${fig.width}" height="${fig.height}" rx="${fig.radius}" fill="${scene.surfaceAlt}"/>` : ''}<image x="${fig.image.x}" y="${fig.image.y}" width="${fig.image.width}" height="${fig.image.height}" preserveAspectRatio="none" clip-path="url(#figure-${nodeIndex}-${figureIndex})" href="${xml(fig.src)}"/>`).join('')}${node.captions.map(caption => svgText(caption)).join('')}${node.year ? svgText(node.year) : ''}</g>${node.url ? '</a>' : ''}`).join('');
  const labels = scene.edges.flatMap(edge => edge.label ? [`<g data-edge-id="${xml(edge.id)}"><rect x="${edge.label.x}" y="${edge.label.y}" width="${edge.label.width}" height="${edge.label.lines.length * 18 + 12}" rx="${CARD_LAYOUT.labelRadius}" fill="${scene.cardBackground}" stroke="${scene.labelBorder}"/>${svgText({ ...edge.label, x: edge.label.x + 10, width: edge.label.width - 20 }, 5)}</g>`] : []).join('');
  return `<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" width="${Math.ceil(b.width)}" height="${Math.ceil(b.height)}" viewBox="${b.x} ${b.y} ${b.width} ${b.height}" role="img" aria-label="Paperstream research graph"><defs>${markers}${figureClips}</defs><rect x="${b.x}" y="${b.y}" width="${b.width}" height="${b.height}" fill="${scene.background}"/><g font-family="Arial, Microsoft YaHei, sans-serif">${edgeMarkup}${nodeMarkup}${labels}</g></svg>`;
}

export function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob), link = globalThis.document.createElement('a');
  link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function downloadGraph(document: JSONCanvasDocument, format: GraphExportFormat, filename: string, options: GraphExportOptions = {}): Promise<void> {
  if (format !== 'svg' && format !== 'png') throw new Error('不支持的导出格式，请选择 SVG 或 PNG。');
  const stem = filename.replace(/\.(canvas|svg|png)$/i, '') || 'paperstream';
  const svg = exportGraphSvg(document, options);
  if (format === 'svg') { downloadBlob(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }), `${stem}.svg`); return; }
  const scene = buildExportScene(document, options), density = Math.min(4, Math.max(.5, options.scale ?? 2));
  const width = Math.ceil(scene.bounds.width * density), height = Math.ceil(scene.bounds.height * density);
  if (width > 16384 || height > 16384 || width * height > 64_000_000) throw new Error('图片过大，请缩小图形范围或使用 SVG 导出。');
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const image = new Image(); image.src = url; await image.decode();
    const canvas = globalThis.document.createElement('canvas'); canvas.width = width; canvas.height = height;
    const context = canvas.getContext('2d'); if (!context) throw new Error('浏览器无法创建图片导出画布。');
    context.drawImage(image, 0, 0, width, height);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('PNG 编码失败。')), 'image/png'));
    downloadBlob(blob, `${stem}.png`);
  } finally { URL.revokeObjectURL(url); }
}
