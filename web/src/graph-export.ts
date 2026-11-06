/** Portable graph exports. Source documents are never mutated. */
import { CARD_LAYOUT } from './card-layout.ts';
import { readPaper, serializeCanvas } from './canvas.ts';
import type { CanvasEdge, CanvasNode, JSONCanvasDocument } from './canvas.ts';
import { getNodeStrokeWidth, getEdgeStrokeWidth } from './appearance.ts';
import { figureCaption, getCardKind, MAX_FIGURE_BYTES, readFigures } from './card-media.ts';
import { isRelationNode } from './graph-relations.ts';
import { getContentBounds, layoutEdgeLabels } from './edge-label-layout.ts';
import type { Point, Rect } from './edge-label-layout.ts';
import { presentationDocuments } from './presentation-pages.ts';
import { readEdgeRouting, polylineRoute } from './edge-routing.ts';

export type GraphExportFormat = 'svg' | 'png' | 'pptx';
export interface GraphExportOptions {
  background?: string;
  foreground?: string;
  muted?: string;
  cardBackground?: string;
  padding?: number;
  /** PNG rasterization density; bounded to avoid accidental huge allocations. */
  scale?: number;
}
interface TextBlock extends Rect { lines: string[]; fontSize: number; lineHeight: number; bold?: boolean; align?: 'center' | 'right'; color: string; }
interface Figure { x: number; y: number; width: number; height: number; src: string; mime: string; bytes: Uint8Array; }
interface ExportNode extends Rect { id: string; radius: number; border: string; strokeWidth: number; kind?: TextBlock; title?: TextBlock; body: TextBlock; year?: TextBlock; figures: Figure[]; captions: TextBlock[]; url?: string; group: boolean; }
interface ExportEdge { id: string; points: Point[]; color: string; strokeWidth: number; dash: string; shape: string; start: boolean; end: boolean; label?: TextBlock; }
export interface ExportScene { bounds: Rect; nodes: ExportNode[]; edges: ExportEdge[]; background: string; cardBackground: string; }
const PALETTE: Record<string, string> = { '1': '#c44848', '2': '#bb722f', '3': '#a58c25', '4': '#3e886c', '5': '#388c9d', '6': '#8b6cb2' };
const xml = (value: unknown) => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]!));
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
/** Shared line boxes keep SVG, DrawingML and scene bounds in the same units. */
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

function figureData(src: unknown): { src: string; mime: string; bytes: Uint8Array } | null {
  if (typeof src !== 'string' || src.length > 12 * 1024 * 1024) return null;
  const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z\d+/]*={0,2})$/.exec(src);
  if (!match) return null;
  try { return { src, mime: match[1], bytes: Uint8Array.from(atob(match[2]), char => char.charCodeAt(0)) }; }
  catch { return null; }
}
function anchor(node: Rect, side: CanvasEdge['fromSide']): Point {
  if (side === 'top') return { x: node.x + node.width / 2, y: node.y };
  if (side === 'right') return { x: node.x + node.width, y: node.y + node.height / 2 };
  if (side === 'left') return { x: node.x, y: node.y + node.height / 2 };
  return { x: node.x + node.width / 2, y: node.y + node.height };
}
function route(source: Point, target: Point, side: CanvasEdge['fromSide']): Point[] {
  return side === 'left' || side === 'right'
    ? [source, { x: (source.x + target.x) / 2, y: source.y }, { x: (source.x + target.x) / 2, y: target.y }, target]
    : [source, { x: source.x, y: (source.y + target.y) / 2 }, { x: target.x, y: (source.y + target.y) / 2 }, target];
}

export function buildExportScene(document: JSONCanvasDocument, options: GraphExportOptions = {}): ExportScene {
  serializeCanvas(document);
  const ink = safeColor(options.foreground, '#263d34'), muted = safeColor(options.muted, '#617369');
  const nodes: ExportNode[] = document.nodes.map((node: CanvasNode) => {
    const paper = readPaper(node), kind = getCardKind(node, Boolean(paper)), relation = isRelationNode(node);
    const heading = paper?.alias ?? node.label ?? node.file ?? node.url ?? (kind === 'page' ? '插页' : 'Note');
    const body = paper?.takeaway ?? (node.type === 'text' ? node.text ?? '' : '');
    const inset = CARD_LAYOUT.paddingX, contentX = node.x + inset, contentWidth = Math.max(1, node.width - inset * 2);
    let cursorY = node.y + (relation ? CARD_LAYOUT.relationPaddingTop : CARD_LAYOUT.paddingTop);
    const kindLabel = node.type === 'group' ? '分组' : node.type === 'file' ? '文件' : node.type === 'link' ? '链接'
      : kind === 'page' ? '插页' : 'NOTE';
    const kindBlock = !relation && kind !== 'paper' ? textBlock(kindLabel, contentX, cursorY, contentWidth, 10, 15, muted) : undefined;
    if (kindBlock) cursorY += kindBlock.height + CARD_LAYOUT.gap;
    const url = paper?.url ?? node.url;
    const linked = typeof url === 'string' && /^https?:\/\//i.test(url);
    const titleWidth = Math.max(1, contentWidth - (linked ? CARD_LAYOUT.linkedTitleReserve : CARD_LAYOUT.titleReserve));
    const titleBlock = relation ? undefined : { ...textBlock(heading, contentX, cursorY, titleWidth, CARD_LAYOUT.titleSize, CARD_LAYOUT.titleLine, ink), bold: true };
    if (titleBlock?.height) cursorY += titleBlock.height + CARD_LAYOUT.gap;
    const bodyBlock = textBlock(body, contentX, cursorY, Math.max(1, contentWidth - (relation ? CARD_LAYOUT.sharedActionReserve : 0)), CARD_LAYOUT.bodySize, CARD_LAYOUT.bodyLine, muted);
    if (relation) { bodyBlock.align = 'center'; bodyBlock.bold = true; }
    cursorY += bodyBlock.height;
    const figures: Figure[] = [], captions: TextBlock[] = [];
    for (const value of readFigures(node)) {
      const figure = record(value), data = figureData(figure.src);
      if (!data) continue;
      const percent = Math.min(100, Math.max(15, finite(figure.widthPercent, 100)));
      const width = contentWidth * percent / 100;
      const aspect = finite(figure.naturalWidth, 4) / finite(figure.naturalHeight, 3);
      const height = width / aspect;
      // Figures and captions share a left-aligned column, as in CardBody.
      if (figures.length || bodyBlock.height) cursorY += 10;
      figures.push({ ...data, x: contentX, y: cursorY, width, height });
      cursorY += height;
      const captionText = figureCaption(value);
      if (captionText) {
        cursorY += 5;
        const caption = textBlock(captionText, contentX, cursorY, width, 10, 14, muted);
        captions.push(caption); cursorY += caption.height;
      }
    }
    return { id: node.id, x: node.x, y: node.y, width: node.width, height: node.height,
      radius: relation ? CARD_LAYOUT.relationRadius : CARD_LAYOUT.radius,
      border: safeColor(node.color, '#9ab3a3'), strokeWidth: getNodeStrokeWidth(node), kind: kindBlock, title: titleBlock, body: bodyBlock,
      // Legacy fixed-height documents may overflow. Preserve their card/edge
      // geometry, but keep the footer below content and include it in bounds.
      year: paper?.year ? { ...textBlock(String(paper.year), node.x + node.width - CARD_LAYOUT.yearRight - 42,
        Math.max(node.y + node.height - CARD_LAYOUT.yearBottom - CARD_LAYOUT.yearLine, cursorY + 10), 42, CARD_LAYOUT.yearSize, CARD_LAYOUT.yearLine, muted), align: 'right' } : undefined,
      figures, captions, url: typeof url === 'string' && /^https?:\/\//i.test(url) ? url : undefined, group: node.type === 'group' };
  });
  const nodeMap = new Map(nodes.map(node => [node.id, node]));
  const edges: ExportEdge[] = document.edges.map(edge => {
    const source = nodeMap.get(edge.fromNode)!, target = nodeMap.get(edge.toNode)!;
    const routing = readEdgeRouting(edge), start = anchor(source, edge.fromSide ?? 'bottom'), end = anchor(target, edge.toSide ?? 'top');
    const points = routing.waypoints.length ? polylineRoute(start, end, routing.waypoints) : route(start, end, edge.fromSide ?? 'bottom');
    const style = record(edge.paperstreamStyle);
    const lines = edge.label ? wrapExportText(edge.label, 220, 12) : [];
    return { id: edge.id, points, color: safeColor(edge.color, '#70877e'), strokeWidth: getEdgeStrokeWidth(edge),
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
    height: edge.label.lines.length * 18 + 12, anchor: { x: (edge.points[0].x + edge.points.at(-1)!.x) / 2, y: (edge.points[0].y + edge.points.at(-1)!.y) / 2 }, pathPoints: edge.points }] : []), [...nodes, ...nodes.flatMap(nodeContentRects), ...manualObstacles]);
  for (const edge of edges) if (edge.label) {
    const center = manual.get(edge.id) ?? placements.get(edge.id)!;
    edge.label.x = center.x - edge.label.width / 2;
    edge.label.y = center.y - (edge.label.lines.length * 18 + 12) / 2;
  }
  const content = getContentBounds([...nodes.map(node => ({ x: node.x - node.strokeWidth / 2, y: node.y - node.strokeWidth / 2,
    width: node.width + node.strokeWidth, height: node.height + node.strokeWidth })), ...nodes.flatMap(nodeContentRects),
    ...edges.flatMap(edge => edge.label ? [{ x: edge.label.x - .5, y: edge.label.y - .5, width: edge.label.width + 1, height: edge.label.height + 13 }] : []),
    ...edges.flatMap(edge => edge.points.map(point => {
      const inset = Math.max(edge.strokeWidth / 2, edge.start || edge.end ? 9 : 0);
      return { x: point.x - inset, y: point.y - inset, width: inset * 2, height: inset * 2 };
    }))]) ?? { x: 0, y: 0, width: 800, height: 450 };
  const padding = Math.min(200, Math.max(0, options.padding ?? 32));
  return { bounds: { x: content.x - padding, y: content.y - padding, width: content.width + padding * 2, height: content.height + padding * 2 }, nodes, edges,
    background: safeColor(options.background, '#f6f8f4'), cardBackground: safeColor(options.cardBackground, '#ffffff') };
}
function svgText(block: TextBlock, offsetY = 0): string {
  if (!block.lines.length) return '';
  const x = block.x + (block.align === 'center' ? block.width / 2 : block.align === 'right' ? block.width : 0);
  return `<text x="${x}" y="${block.y + block.fontSize + offsetY}" fill="${block.color}" font-size="${block.fontSize}" xml:space="preserve"${block.align ? ` text-anchor="${block.align === 'center' ? 'middle' : 'end'}"` : ''}${block.bold ? ' font-weight="700"' : ''}>${block.lines.map((line, index) => `<tspan x="${x}" dy="${index ? block.lineHeight : 0}">${xml(line)}</tspan>`).join('')}</text>`;
}
export function exportGraphSvg(document: JSONCanvasDocument, options: GraphExportOptions = {}): string {
  const scene = buildExportScene(document, options), b = scene.bounds;
  const markers = scene.edges.map((edge, index) => `<marker id="arrow-${index}" viewBox="0 0 12 12" refX="10" refY="6" markerWidth="9" markerHeight="9" orient="auto-start-reverse" markerUnits="userSpaceOnUse">${edge.shape === 'circle' ? `<circle cx="6" cy="6" r="4" fill="${edge.color}"/>` : edge.shape === 'diamond' ? `<path d="M1 6 6 1 11 6 6 11Z" fill="${edge.color}"/>` : `<path d="M1 1 11 6 1 11${edge.shape === 'open' ? '' : 'Z'}" fill="${edge.shape === 'open' ? 'none' : edge.color}" stroke="${edge.color}"/>`}</marker>`).join('');
  const edgeMarkup = scene.edges.map((edge, index) => `<path d="M ${edge.points.map(p => `${p.x} ${p.y}`).join(' L ')}" fill="none" stroke="${edge.color}" stroke-width="${edge.strokeWidth}"${edge.dash ? ` stroke-dasharray="${edge.dash}"` : ''}${edge.start ? ` marker-start="url(#arrow-${index})"` : ''}${edge.end ? ` marker-end="url(#arrow-${index})"` : ''}/>`).join('');
  const nodeMarkup = scene.nodes.map(node => `${node.url ? `<a href="${xml(node.url)}" target="_blank" rel="noopener noreferrer">` : ''}<g data-node-id="${xml(node.id)}"><rect x="${node.x}" y="${node.y}" width="${node.width}" height="${node.height}" rx="${node.radius}" fill="${scene.cardBackground}"${node.group ? ' fill-opacity="0.45" stroke-dasharray="6 4"' : ''} stroke="${node.border}" stroke-width="${node.strokeWidth}"/>${node.kind ? svgText(node.kind) : ''}${node.title ? svgText(node.title) : ''}${svgText(node.body)}${node.figures.map(fig => `<image x="${fig.x}" y="${fig.y}" width="${fig.width}" height="${fig.height}" preserveAspectRatio="xMidYMid meet" href="${xml(fig.src)}"/>`).join('')}${node.captions.map(caption => svgText(caption)).join('')}${node.year ? svgText(node.year) : ''}</g>${node.url ? '</a>' : ''}`).join('');
  const labels = scene.edges.flatMap(edge => edge.label ? [`<g data-edge-id="${xml(edge.id)}"><rect x="${edge.label.x}" y="${edge.label.y}" width="${edge.label.width}" height="${edge.label.lines.length * 18 + 12}" rx="${CARD_LAYOUT.labelRadius}" fill="${scene.cardBackground}" stroke="#cad8ce"/>${svgText({ ...edge.label, x: edge.label.x + 10, width: edge.label.width - 20 }, 5)}</g>`] : []).join('');
  return `<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" width="${Math.ceil(b.width)}" height="${Math.ceil(b.height)}" viewBox="${b.x} ${b.y} ${b.width} ${b.height}" role="img" aria-label="Paperstream research graph"><defs>${markers}</defs><rect x="${b.x}" y="${b.y}" width="${b.width}" height="${b.height}" fill="${scene.background}"/><g font-family="Arial, Microsoft YaHei, sans-serif">${edgeMarkup}${nodeMarkup}${labels}</g></svg>`;
}

// A stored ZIP writer keeps presentation export local and dependency-free.
const encoder = new TextEncoder();
const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, value) => { let crc = value; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); return crc >>> 0; });
function crc32(bytes: Uint8Array): number { let crc = 0xffffffff; for (const byte of bytes) crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ byte) & 255]; return (crc ^ 0xffffffff) >>> 0; }
export function createStoredZip(entries: ReadonlyArray<{ name: string; bytes: Uint8Array }>): Uint8Array {
  const parts: Uint8Array[] = [], central: Uint8Array[] = []; let offset = 0, centralLength = 0;
  const header = (length: number) => { const bytes = new Uint8Array(length); return { bytes, view: new DataView(bytes.buffer) }; };
  for (const entry of entries) {
    const name = encoder.encode(entry.name), crc = crc32(entry.bytes), local = header(30 + name.length);
    local.view.setUint32(0, 0x04034b50, true); local.view.setUint16(4, 20, true); local.view.setUint16(6, 0x0800, true); local.view.setUint16(12, 33, true); local.view.setUint32(14, crc, true); local.view.setUint32(18, entry.bytes.length, true); local.view.setUint32(22, entry.bytes.length, true); local.view.setUint16(26, name.length, true); local.bytes.set(name, 30);
    parts.push(local.bytes, entry.bytes);
    const directory = header(46 + name.length);
    directory.view.setUint32(0, 0x02014b50, true); directory.view.setUint16(4, 20, true); directory.view.setUint16(6, 20, true); directory.view.setUint16(8, 0x0800, true); directory.view.setUint16(14, 33, true); directory.view.setUint32(16, crc, true); directory.view.setUint32(20, entry.bytes.length, true); directory.view.setUint32(24, entry.bytes.length, true); directory.view.setUint16(28, name.length, true); directory.view.setUint32(42, offset, true); directory.bytes.set(name, 46); central.push(directory.bytes); centralLength += directory.bytes.length;
    offset += local.bytes.length + entry.bytes.length;
  }
  const end = header(22); end.view.setUint32(0, 0x06054b50, true); end.view.setUint16(8, entries.length, true); end.view.setUint16(10, entries.length, true); end.view.setUint32(12, centralLength, true); end.view.setUint32(16, offset, true);
  const output = new Uint8Array(offset + centralLength + 22); let cursor = 0;
  for (const part of [...parts, ...central, end.bytes]) { output.set(part, cursor); cursor += part.length; }
  return output;
}
const NS_A = 'http://schemas.openxmlformats.org/drawingml/2006/main', NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships', NS_P = 'http://schemas.openxmlformats.org/presentationml/2006/main';
const xmlDoc = (value: string) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>${value}`;
const rgb = (color: string) => color.slice(1).toUpperCase();
const rels = (relationships: Array<[string, string, string]>) => xmlDoc(`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relationships.map(([id, type, target]) => `<Relationship Id="${id}" Type="${NS_R}/${type}" Target="${xml(target)}"${type === 'hyperlink' ? ' TargetMode="External"' : ''}/>`).join('')}</Relationships>`);
const groupShape = '<p:nvGrpSpPr><p:cNvPr id="1" name="Graph"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>';

/** One slide, editable shapes/text/connectors; raster figures are embedded assets. */
function singleSlideEntries(document: JSONCanvasDocument, options: GraphExportOptions = {}): Array<{ name: string; bytes: Uint8Array }> {
  const scene = buildExportScene(document, options), b = scene.bounds;
  const slideWidth = 12192000, slideHeight = 6858000;
  const scale = Math.min(slideWidth / b.width, slideHeight / b.height);
  const dx = (slideWidth - b.width * scale) / 2 - b.x * scale, dy = (slideHeight - b.height * scale) / 2 - b.y * scale;
  const n = (value: number) => Math.round(value), x = (value: number) => n(value * scale + dx), y = (value: number) => n(value * scale + dy), length = (value: number) => Math.max(1, n(value * scale));
  const transform = (rect: Rect) => `<a:xfrm><a:off x="${x(rect.x)}" y="${y(rect.y)}"/><a:ext cx="${length(rect.width)}" cy="${length(rect.height)}"/></a:xfrm>`;
  const relationships: Array<[string, string, string]> = [['rId1', 'slideLayout', '../slideLayouts/slideLayout1.xml']];
  const files: Array<{ name: string; bytes: Uint8Array }> = [];
  let shapeId = 1, mediaId = 0;
  const textShape = (block: TextBlock, name: string, url?: string) => {
    if (!block.lines.length) return '';
    const id = ++shapeId, relationId = url ? `rId${relationships.length + 1}` : undefined;
    if (url) relationships.push([relationId!, 'hyperlink', url]);
    // DrawingML font sizes are 1/100pt. Graph units scale to EMU, then to pt.
    const fontSize = Math.max(1, Math.round(block.fontSize * scale / 12700 * 100));
    const lineSpacing = Math.max(1, Math.round(block.lineHeight * scale / 12700 * 100));
    return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${xml(name)}"${url ? `><a:hlinkClick r:id="${relationId}"/></p:cNvPr>` : '/>'}<p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr>${transform(block)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/><a:ln><a:noFill/></a:ln></p:spPr><p:txBody><a:bodyPr wrap="none" lIns="0" rIns="0" tIns="0" bIns="0"/><a:lstStyle/>${block.lines.map(line => `<a:p><a:pPr marL="0" marR="0" algn="${block.align === 'center' ? 'ctr' : block.align === 'right' ? 'r' : 'l'}"><a:lnSpc><a:spcPts val="${lineSpacing}"/></a:lnSpc><a:spcBef><a:spcPts val="0"/></a:spcBef><a:spcAft><a:spcPts val="0"/></a:spcAft></a:pPr><a:r><a:rPr lang="zh-CN" sz="${fontSize}"${block.bold ? ' b="1"' : ''}><a:solidFill><a:srgbClr val="${rgb(block.color)}"/></a:solidFill><a:latin typeface="Arial"/><a:ea typeface="Microsoft YaHei"/></a:rPr><a:t xml:space="preserve">${xml(line)}</a:t></a:r><a:endParaRPr lang="zh-CN" sz="${fontSize}"/></a:p>`).join('')}</p:txBody></p:sp>`;
  };
  const nodeIds = new Map<string, number>();
  // Card backgrounds come first, edges behind textual content but remain editable.
  const cards = scene.nodes.map(node => { const id = ++shapeId; nodeIds.set(node.id, id); return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="Card ${xml(node.id)}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr>${transform(node)}<a:prstGeom prst="roundRect"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="${rgb(scene.cardBackground)}"/></a:solidFill><a:ln w="${length(node.strokeWidth)}"><a:solidFill><a:srgbClr val="${rgb(node.border)}"/></a:solidFill>${node.group ? '<a:prstDash val="dash"/>' : ''}</a:ln></p:spPr></p:sp>`; }).join('');
  const connections = scene.edges.map(edge => {
    const id = ++shapeId, source = edge.points[0], target = edge.points.at(-1)!;
    const original = document.edges.find(item => item.id === edge.id)!;
    const sites = { top: 0, left: 1, bottom: 2, right: 3 };
    const attachments = `<a:stCxn id="${nodeIds.get(original.fromNode)}" idx="${sites[original.fromSide ?? 'bottom']}"/><a:endCxn id="${nodeIds.get(original.toNode)}" idx="${sites[original.toSide ?? 'top']}"/>`;
    const custom = readEdgeRouting(original).waypoints.length > 0;
    const routePoints = custom ? edge.points : [source, target];
    const left = Math.min(...routePoints.map(point => point.x)), top = Math.min(...routePoints.map(point => point.y));
    const width = Math.max(...routePoints.map(point => point.x)) - left, height = Math.max(...routePoints.map(point => point.y)) - top;
    const geometry = custom
      ? `<a:custGeom><a:avLst/><a:gdLst/><a:ahLst/><a:cxnLst/><a:rect l="0" t="0" r="r" b="b"/><a:pathLst><a:path w="${length(width)}" h="${length(height)}" fill="none" stroke="1" extrusionOk="0">${edge.points.map((point, index) => `<a:${index ? 'lnTo' : 'moveTo'}><a:pt x="${n((point.x - left) * scale)}" y="${n((point.y - top) * scale)}"/></a:${index ? 'lnTo' : 'moveTo'}>`).join('')}</a:path></a:pathLst></a:custGeom>`
      : '<a:prstGeom prst="bentConnector3"><a:avLst/></a:prstGeom>';
    const arrow = edge.shape === 'open' ? 'arrow' : edge.shape === 'diamond' ? 'diamond' : edge.shape === 'circle' ? 'oval' : 'triangle';
    return `<p:cxnSp><p:nvCxnSpPr><p:cNvPr id="${id}" name="Connection ${xml(edge.id)}"/><p:cNvCxnSpPr>${attachments}</p:cNvCxnSpPr><p:nvPr/></p:nvCxnSpPr><p:spPr><a:xfrm${!custom && source.x > target.x ? ' flipH="1"' : ''}${!custom && source.y > target.y ? ' flipV="1"' : ''}><a:off x="${x(left)}" y="${y(top)}"/><a:ext cx="${length(width)}" cy="${length(height)}"/></a:xfrm>${geometry}<a:ln w="${length(edge.strokeWidth)}"><a:solidFill><a:srgbClr val="${rgb(edge.color)}"/></a:solidFill>${edge.dash ? `<a:prstDash val="${edge.dash === '2 4' ? 'dot' : 'dash'}"/>` : ''}<a:headEnd type="${edge.start ? arrow : 'none'}" w="med" len="med"/><a:tailEnd type="${edge.end ? arrow : 'none'}" w="med" len="med"/></a:ln></p:spPr><p:style><a:lnRef idx="0"><a:schemeClr val="accent1"/></a:lnRef><a:fillRef idx="0"><a:schemeClr val="accent1"/></a:fillRef><a:effectRef idx="0"><a:schemeClr val="accent1"/></a:effectRef><a:fontRef idx="minor"><a:schemeClr val="lt1"/></a:fontRef></p:style></p:cxnSp>`;
  }).join('');
  const contents = scene.nodes.map(node => {
    const images = node.figures.map(figure => {
      const id = ++shapeId, extension = figure.mime === 'image/jpeg' ? 'jpg' : figure.mime === 'image/webp' ? 'webp' : 'png', name = `image${++mediaId}.${extension}`, rid = `rId${relationships.length + 1}`;
      files.push({ name: `ppt/media/${name}`, bytes: figure.bytes }); relationships.push([rid, 'image', `../media/${name}`]);
      return `<p:pic><p:nvPicPr><p:cNvPr id="${id}" name="Figure ${mediaId}"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr>${transform(figure)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>`;
    }).join('');
    return (node.kind ? textShape(node.kind, `Kind ${node.id}`) : '') + (node.title ? textShape(node.title, `Title ${node.id}`, node.url) : '') + textShape(node.body, `Takeaway ${node.id}`) + images + node.captions.map((caption, i) => textShape(caption, `Caption ${node.id} ${i}`)).join('') + (node.year ? textShape(node.year, `Year ${node.id}`) : '');
  }).join('');
  const labels = scene.edges.map(edge => edge.label ? textShape({ ...edge.label, x: edge.label.x + 10, y: edge.label.y + 6, width: edge.label.width - 20 }, `Relation ${edge.id}`) : '').join('');
  const slide = xmlDoc(`<p:sld xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}"><p:cSld name="Paperstream graph"><p:bg><p:bgPr><a:solidFill><a:srgbClr val="${rgb(scene.background)}"/></a:solidFill><a:effectLst/></p:bgPr></p:bg><p:spTree>${groupShape}${connections}${cards}${contents}${labels}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`);
  const xmlEntries: Array<[string, string]> = [
    ['[Content_Types].xml', xmlDoc('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="jpg" ContentType="image/jpeg"/><Default Extension="webp" ContentType="image/webp"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/><Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/><Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/><Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/></Types>')],
    ['_rels/.rels', rels([['rId1', 'officeDocument', 'ppt/presentation.xml']])],
    ['ppt/presentation.xml', xmlDoc(`<p:presentation xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId2"/></p:sldMasterIdLst><p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst><p:sldSz cx="${slideWidth}" cy="${slideHeight}" type="screen16x9"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`)],
    ['ppt/_rels/presentation.xml.rels', rels([['rId1', 'slide', 'slides/slide1.xml'], ['rId2', 'slideMaster', 'slideMasters/slideMaster1.xml']])],
    ['ppt/slides/slide1.xml', slide], ['ppt/slides/_rels/slide1.xml.rels', rels(relationships)],
    ['ppt/slideMasters/slideMaster1.xml', xmlDoc(`<p:sldMaster xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}"><p:cSld><p:spTree>${groupShape}</p:spTree></p:cSld><p:clrMap accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" bg1="lt1" bg2="lt2" folHlink="folHlink" hlink="hlink" tx1="dk1" tx2="dk2"/><p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst><p:txStyles><p:titleStyle/><p:bodyStyle/><p:otherStyle/></p:txStyles></p:sldMaster>`)],
    ['ppt/slideMasters/_rels/slideMaster1.xml.rels', rels([['rId1', 'slideLayout', '../slideLayouts/slideLayout1.xml'], ['rId2', 'theme', '../theme/theme1.xml']])],
    ['ppt/slideLayouts/slideLayout1.xml', xmlDoc(`<p:sldLayout xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}" type="blank" preserve="1"><p:cSld name="Blank"><p:spTree>${groupShape}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`)],
    ['ppt/slideLayouts/_rels/slideLayout1.xml.rels', rels([['rId1', 'slideMaster', '../slideMasters/slideMaster1.xml']])],
    ['ppt/theme/theme1.xml', xmlDoc(`<a:theme xmlns:a="${NS_A}" name="Paperstream"><a:themeElements><a:clrScheme name="Paperstream">${[['dk1','263D34'],['lt1','FFFFFF'],['dk2','617369'],['lt2','F6F8F4'],['accent1','34694F'],['accent2','388C9D'],['accent3','8B6CB2'],['accent4','BB722F'],['accent5','C44848'],['accent6','A58C25'],['hlink','0563C1'],['folHlink','954F72']].map(([key,value])=>`<a:${key}><a:srgbClr val="${value}"/></a:${key}>`).join('')}</a:clrScheme><a:fontScheme name="Paperstream"><a:majorFont><a:latin typeface="Arial"/><a:ea typeface="Microsoft YaHei"/><a:cs typeface="Arial"/></a:majorFont><a:minorFont><a:latin typeface="Arial"/><a:ea typeface="Microsoft YaHei"/><a:cs typeface="Arial"/></a:minorFont></a:fontScheme><a:fmtScheme name="Paperstream"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst><a:lnStyleLst>${[6350,12700,19050].map(width=>`<a:ln w="${width}"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/></a:ln>`).join('')}</a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>`)],
  ];
  return [...xmlEntries.map(([name, value]) => ({ name, bytes: encoder.encode(value) })), ...files];
}
/** One slide per configured page; old graphs keep the familiar whole-graph slide. */
export function exportGraphPptx(document: JSONCanvasDocument, options: GraphExportOptions = {}): Uint8Array {
  serializeCanvas(document);
  const pages = presentationDocuments(document), output = new Map<string, Uint8Array>(), decoder = new TextDecoder();
  pages.forEach(({ page, document: view }, index) => {
    const number = index + 1;
    for (const entry of singleSlideEntries(view, options)) {
      if (entry.name === 'ppt/slides/slide1.xml') {
        output.set(`ppt/slides/slide${number}.xml`, encoder.encode(decoder.decode(entry.bytes).replace('name="Paperstream graph"', `name="${xml(page.title)}"`)));
      } else if (entry.name === 'ppt/slides/_rels/slide1.xml.rels') {
        output.set(`ppt/slides/_rels/slide${number}.xml.rels`, encoder.encode(decoder.decode(entry.bytes).replaceAll('../media/image', pages.length === 1 ? '../media/image' : `../media/slide${number}-image`)));
      } else if (entry.name.startsWith('ppt/media/')) output.set(pages.length === 1 ? entry.name : entry.name.replace('ppt/media/', `ppt/media/slide${number}-`), entry.bytes);
      else if (!index) output.set(entry.name, entry.bytes);
    }
  });
  const contentTypes = decoder.decode(output.get('[Content_Types].xml')!);
  output.set('[Content_Types].xml', encoder.encode(contentTypes.replace(/<Override PartName="\/ppt\/slides\/slide1.xml"[^>]*\/>/, pages.map((_, index) => `<Override PartName="/ppt/slides/slide${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`).join(''))));
  const presentation = decoder.decode(output.get('ppt/presentation.xml')!);
  output.set('ppt/presentation.xml', encoder.encode(presentation.replace(/<p:sldIdLst>.*?<\/p:sldIdLst>/, `<p:sldIdLst>${pages.map((_, index) => `<p:sldId id="${256 + index}" r:id="rId${index + 1}"/>`).join('')}</p:sldIdLst>`).replace('<p:sldMasterId id="2147483648" r:id="rId2"/>', `<p:sldMasterId id="2147483648" r:id="rId${pages.length + 1}"/>`)));
  output.set('ppt/_rels/presentation.xml.rels', encoder.encode(rels([
    ...pages.map((_, index) => [`rId${index + 1}`, 'slide', `slides/slide${index + 1}.xml`] as [string, string, string]),
    [`rId${pages.length + 1}`, 'slideMaster', 'slideMasters/slideMaster1.xml'],
  ])));
  return createStoredZip([...output].map(([name, bytes]) => ({ name, bytes })));
}
export function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob), link = globalThis.document.createElement('a');
  link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
/** A converted PNG must remain acceptable to readFigures, or it would silently
 * disappear from the slide. Keep this check independent of browser allocation. */
export function validatePresentationImageSize(byteLength: number): void {
  if (!Number.isSafeInteger(byteLength) || byteLength <= 0) throw new Error('PowerPoint 图片转换失败：PNG 数据为空或无效。');
  if (byteLength > MAX_FIGURE_BYTES) throw new Error('WebP 转换后的 PNG 超过 8 MB，无法导出 PowerPoint；请缩小图片后重试。');
}
/** Older PowerPoint versions cannot display WebP. Browser downloads normalize
 * those embedded figures to PNG while keeping the original Canvas untouched. */
async function presentationImages(document: JSONCanvasDocument): Promise<JSONCanvasDocument> {
  const nodes = await Promise.all(document.nodes.map(async node => {
    const meta = record(node.paperstreamCard);
    if (!Array.isArray(meta.figures)) return node;
    let changed = false;
    const figures = await Promise.all(meta.figures.map(async value => {
      const figure = record(value), data = figureData(figure.src);
      if (data?.mime !== 'image/webp') return value;
      const image = new Image(); image.src = data.src; await image.decode();
      if (image.naturalWidth * image.naturalHeight > 64_000_000) throw new Error('图片像素过大，无法转换为 PowerPoint 支持的 PNG。');
      const canvas = globalThis.document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d'); if (!context) throw new Error('浏览器无法转换 PowerPoint 图片。');
      context.drawImage(image, 0, 0); changed = true;
      const src = canvas.toDataURL('image/png'), prefix = 'data:image/png;base64,';
      if (!src.startsWith(prefix)) throw new Error('PowerPoint 图片转换失败：浏览器未生成 PNG。');
      const encodedLength = src.length - prefix.length;
      validatePresentationImageSize(encodedLength / 4 * 3 - (src.endsWith('==') ? 2 : src.endsWith('=') ? 1 : 0));
      return { ...figure, src, naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight };
    }));
    return changed ? { ...node, paperstreamCard: { ...meta, figures } } : node;
  }));
  return { ...document, nodes };
}

export async function downloadGraph(document: JSONCanvasDocument, format: GraphExportFormat, filename: string, options: GraphExportOptions = {}): Promise<void> {
  const stem = filename.replace(/\.(canvas|svg|png|pptx)$/i, '') || 'paperstream';
  if (format === 'pptx') { const bytes = exportGraphPptx(await presentationImages(document), options); downloadBlob(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' }), `${stem}.pptx`); return; }
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
