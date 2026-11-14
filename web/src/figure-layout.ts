import { rasterDimensions } from './image-dimensions.ts';

export type FigureAlign = 'left' | 'center' | 'right';
export interface FigureFrame {
  aspectRatio: number;
  fit: 'cover' | 'contain';
  positionX?: number;
  positionY?: number;
  zoom?: number;
  [key: string]: unknown;
}
interface FigureInput {
  src?: string;
  naturalWidth?: unknown;
  naturalHeight?: unknown;
  frame?: unknown;
  align?: unknown;
}
export const FIGURE_RADIUS = 6;
const object = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const range = (value: unknown, min: number, max: number) => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
export function validFigureFrame(value: unknown): value is FigureFrame {
  return object(value) && range(value.aspectRatio, .25, 4) && (value.fit === 'cover' || value.fit === 'contain')
    && (value.positionX === undefined || range(value.positionX, 0, 100))
    && (value.positionY === undefined || range(value.positionY, 0, 100))
    && (value.zoom === undefined || range(value.zoom, 1, 4));
}
/** Unknown frame formats stay stored and render like legacy natural images. */
export function readFigureFrame(figure: FigureInput): Required<Pick<FigureFrame, 'aspectRatio' | 'fit' | 'positionX' | 'positionY' | 'zoom'>> | null {
  const frame = figure.frame;
  return validFigureFrame(frame) ? { aspectRatio: frame.aspectRatio, fit: frame.fit,
    positionX: frame.positionX ?? 50, positionY: frame.positionY ?? 50, zoom: frame.zoom ?? 1 } : null;
}
export function figureAlign(figure: FigureInput): FigureAlign {
  return figure.align === 'center' || figure.align === 'right' ? figure.align : 'left';
}
const pixelDimension = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0 && value <= 16384;
const dimensionCache = new Map<string, { width: number; height: number } | null>();
/** Browser imports record decoded dimensions. Legacy embedded images can omit
 * them, so read their header rather than inventing a different export aspect. */
export function figureDimensions(figure: FigureInput): { width: number; height: number } {
  if (pixelDimension(figure.naturalWidth) && pixelDimension(figure.naturalHeight)) {
    return { width: figure.naturalWidth, height: figure.naturalHeight };
  }
  const src = figure.src;
  if (src) {
    if (!dimensionCache.has(src)) {
      let size: { width: number; height: number } | null = null;
      const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(src);
      if (match && match[2].length <= 12 * 1024 * 1024) {
        try {
          const binary = atob(match[2]);
          const result = rasterDimensions(Uint8Array.from(binary, char => char.charCodeAt(0)), match[1]);
          if (result && pixelDimension(result.width) && pixelDimension(result.height)) size = result;
        } catch { /* Invalid legacy metadata remains nonfatal and untouched. */ }
      }
      if (dimensionCache.size >= 8) dimensionCache.delete(dimensionCache.keys().next().value!);
      dimensionCache.set(src, size);
    }
    const size = dimensionCache.get(src);
    if (size) return size;
  }
  return { width: 4, height: 3 };
}
/** Image coordinates are relative to the viewport. UI and SVG use this same
 * rectangle, including zoom, so a saved crop has identical framing in both. */
export function figureLayout(figure: FigureInput, width: number) {
  const source = figureDimensions(figure), frame = readFigureFrame(figure);
  const height = width / (frame?.aspectRatio ?? source.width / source.height);
  const scale = (frame?.fit === 'cover' ? Math.max(width / source.width, height / source.height)
    : Math.min(width / source.width, height / source.height)) * (frame?.zoom ?? 1);
  const imageWidth = source.width * scale, imageHeight = source.height * scale;
  return { width, height, framed: Boolean(frame), radius: FIGURE_RADIUS,
    image: { x: (width - imageWidth) * (frame?.positionX ?? 50) / 100 || 0,
      y: (height - imageHeight) * (frame?.positionY ?? 50) / 100 || 0, width: imageWidth, height: imageHeight } };
}
