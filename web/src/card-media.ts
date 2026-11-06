import { CanvasError } from './canvas.ts';
import type { CanvasNode } from './canvas.ts';

export type CardKind = 'paper' | 'note' | 'relation' | 'page';
export interface CardFigure {
  id: string;
  src: string;
  caption: string;
  widthPercent: number;
  naturalWidth?: number;
  naturalHeight?: number;
  [key: string]: unknown;
}
export const MAX_FIGURE_BYTES = 8 * 1024 * 1024;
const DATA_IMAGE = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/;

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function extension(node: CanvasNode): Record<string, unknown> {
  if (node.paperstreamCard === undefined) return {};
  if (!object(node.paperstreamCard)) throw new CanvasError('卡片扩展格式不兼容，原数据已保留。');
  return node.paperstreamCard;
}
export function getCardKind(node: CanvasNode, isPaper = false): CardKind {
  const kind = object(node.paperstreamCard) ? node.paperstreamCard.kind : undefined;
  return kind === 'paper' || kind === 'note' || kind === 'relation' || kind === 'page' ? kind : isPaper ? 'paper' : 'note';
}
export function cardKindPatch(node: CanvasNode, kind: CardKind): Partial<CanvasNode> {
  if (!['paper', 'note', 'relation', 'page'].includes(kind)) throw new CanvasError('卡片类型必须是 paper、note、relation 或 page。');
  return { paperstreamCard: { ...extension(node), kind } };
}
function validImage(src: unknown): src is string {
  if (typeof src !== 'string') return false;
  const match = DATA_IMAGE.exec(src);
  if (!match || match[2].length % 4) return false;
  const bytes = match[2].length / 4 * 3 - (match[2].endsWith('==') ? 2 : match[2].endsWith('=') ? 1 : 0);
  return bytes > 0 && bytes <= MAX_FIGURE_BYTES;
}
function isFigure(value: unknown): value is CardFigure {
  return object(value) && typeof value.id === 'string' && Boolean(value.id)
    && validImage(value.src) && typeof value.caption === 'string'
    && typeof value.widthPercent === 'number' && Number.isFinite(value.widthPercent)
    && value.widthPercent >= 15 && value.widthPercent <= 100;
}
/** Unsupported entries stay on disk; only valid embedded raster images render. */
export function readFigures(node: CanvasNode): CardFigure[] {
  const figures = object(node.paperstreamCard) ? node.paperstreamCard.figures : undefined;
  return Array.isArray(figures) ? figures.filter(isFigure).map(figure => ({ ...figure })) : [];
}
function rawFigures(node: CanvasNode): unknown[] {
  const figures = extension(node).figures;
  if (figures === undefined) return [];
  if (!Array.isArray(figures)) throw new CanvasError('图片扩展格式不兼容，原数据已保留。');
  return figures;
}
function figuresPatch(node: CanvasNode, figures: unknown[]): Partial<CanvasNode> {
  return { paperstreamCard: { ...extension(node), figures } };
}
export function addFigurePatch(node: CanvasNode, figure: CardFigure): Partial<CanvasNode> {
  if (!isFigure(figure)) throw new CanvasError('图片必须是 8 MB 以内的 PNG、JPEG 或 WebP，宽度为 15–100%。');
  const figures = rawFigures(node);
  if (figures.some(item => object(item) && item.id === figure.id)) throw new CanvasError('图片 ID 已存在。');
  return figuresPatch(node, [...figures, { ...figure }]);
}
export function updateFigurePatch(node: CanvasNode, id: string,
  patch: Partial<Pick<CardFigure, 'caption' | 'widthPercent'>>): Partial<CanvasNode> {
  if (!Object.keys(patch).every(key => ['caption', 'widthPercent'].includes(key))) {
    throw new CanvasError('只可调整图片说明和宽度。');
  }
  let found = false;
  const figures = rawFigures(node).map(item => {
    if (!isFigure(item) || item.id !== id) return item;
    const next = { ...item, ...patch };
    if (!isFigure(next)) throw new CanvasError('图片宽度须为 15–100%，说明为文本。');
    found = true;
    return next;
  });
  if (!found) throw new CanvasError('图片不存在或格式不受支持。');
  return figuresPatch(node, figures);
}
export function removeFigurePatch(node: CanvasNode, id: string): Partial<CanvasNode> {
  return figuresPatch(node, rawFigures(node).filter(item => !isFigure(item) || item.id !== id));
}

function rasterMime(bytes: Uint8Array): string | null {
  if (bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((byte, i) => bytes[i] === byte)) return 'image/png';
  if (bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg';
  if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF'
    && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP') return 'image/webp';
  return null;
}
export async function figureFromFile(file: File): Promise<CardFigure> {
  if (!file.size || file.size > MAX_FIGURE_BYTES) throw new CanvasError('请选择 8 MB 以内的 PNG、JPEG 或 WebP 图片。');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime = rasterMime(bytes);
  if (!mime) throw new CanvasError('只支持 PNG、JPEG 或 WebP 图片。');
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  const src = `data:${mime};base64,${btoa(binary)}`;
  let naturalWidth: number, naturalHeight: number;
  try {
    const bitmap = await createImageBitmap(file);
    naturalWidth = bitmap.width; naturalHeight = bitmap.height; bitmap.close();
  } catch { throw new CanvasError('图片无法解码，请使用有效的 PNG、JPEG 或 WebP。'); }
  return { id: crypto.randomUUID().replaceAll('-', ''), src,
    caption: file.name, widthPercent: 100, naturalWidth, naturalHeight };
}

export type TakeawayBlock = { type: 'paragraph'; text: string } | { type: 'list'; items: string[] };
/** A deliberately small, safe list syntax: consecutive '- ' lines form a list. */
export function takeawayBlocks(text: string): TakeawayBlock[] {
  const blocks: TakeawayBlock[] = [];
  for (const line of text.replaceAll('\r\n', '\n').split('\n')) {
    const bullet = /^\s*-\s+(.+)$/.exec(line);
    const previous = blocks[blocks.length - 1];
    if (bullet) {
      if (previous?.type === 'list') previous.items.push(bullet[1]);
      else blocks.push({ type: 'list', items: [bullet[1]] });
    } else if (previous?.type === 'paragraph') previous.text += `\n${line}`;
    else blocks.push({ type: 'paragraph', text: line });
  }
  return blocks;
}
