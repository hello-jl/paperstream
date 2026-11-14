import { CanvasError } from './canvas.ts';
import type { CanvasNode } from './canvas.ts';
import { rasterDimensions } from './image-dimensions.ts';
import { validFigureFrame } from './figure-layout.ts';
import type { FigureAlign, FigureFrame } from './figure-layout.ts';

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
export interface FigurePatch {
  caption?: string;
  widthPercent?: number;
  /** null explicitly returns to the original, uncropped image. */
  frame?: FigureFrame | null;
  align?: FigureAlign;
}
export const MAX_FIGURE_BYTES = 8 * 1024 * 1024;
export const MAX_FIGURE_PIXELS = 32_000_000;
export const MAX_FIGURE_SIDE = 16384;
const DATA_IMAGE = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/;

/** Older imports used the source filename as a caption. Hide that visual noise
 * without rewriting the stored document or discarding an authored description. */
export function figureCaption(figure: Pick<CardFigure, 'caption'>): string {
  const text = figure.caption.trim();
  return /^[^\r\n]+\.(?:png|jpe?g|webp)$/i.test(text) ? '' : figure.caption;
}

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
  patch: FigurePatch): Partial<CanvasNode> {
  if (!Object.keys(patch).every(key => ['caption', 'widthPercent', 'frame', 'align'].includes(key))) {
    throw new CanvasError('只可调整图片说明、宽度、取景框和对齐。');
  }
  if (Object.hasOwn(patch, 'frame') && patch.frame !== null && !validFigureFrame(patch.frame)) {
    throw new CanvasError('图片取景框须使用 0.25–4 的比例、cover/contain、0–100 的位置及 1–4 的缩放。');
  }
  if (Object.hasOwn(patch, 'align') && !['left', 'center', 'right'].includes(patch.align!)) {
    throw new CanvasError('图片对齐须为 left、center 或 right。');
  }
  let found = false;
  const figures = rawFigures(node).map(item => {
    if (!isFigure(item) || item.id !== id) return item;
    const next = { ...item, ...patch };
    if (Object.hasOwn(patch, 'frame')) {
      if (patch.frame === null) delete next.frame;
      else {
        const frame = { ...(object(item.frame) ? item.frame : {}), ...patch.frame };
        if (!validFigureFrame(frame)) throw new CanvasError('图片取景框包含无效的原有位置或缩放，请完整设置取景框。');
        next.frame = frame;
      }
    }
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
  const dimensions = rasterDimensions(bytes, mime);
  if (!dimensions) throw new CanvasError('图片无法解码，请使用有效的 PNG、JPEG 或 WebP。');
  function checkDimensions(width: number, height: number) {
    if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1) {
      throw new CanvasError('图片尺寸无效，请使用有效的 PNG、JPEG 或 WebP。');
    }
    if (width > MAX_FIGURE_SIDE || height > MAX_FIGURE_SIDE || width * height > MAX_FIGURE_PIXELS) {
      throw new CanvasError('图片像素过大，请缩小至 3200 万像素以内，且单边不超过 16384 像素。');
    }
  }
  checkDimensions(dimensions.width, dimensions.height);
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch { throw new CanvasError('图片无法解码，请使用有效的 PNG、JPEG 或 WebP。'); }
  let naturalWidth: number, naturalHeight: number;
  try {
    naturalWidth = bitmap.width; naturalHeight = bitmap.height;
    checkDimensions(naturalWidth, naturalHeight);
  } finally { bitmap.close(); }
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  const src = `data:${mime};base64,${btoa(binary)}`;
  return { id: crypto.randomUUID().replaceAll('-', ''), src,
    caption: '', widthPercent: 100, naturalWidth, naturalHeight };
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
