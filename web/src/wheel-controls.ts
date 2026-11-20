export interface Viewport { x: number; y: number; zoom: number }
export type WheelAction = 'pan' | 'zoom' | 'scroll';

/** Touchpad pinch / Ctrl+wheel zoom; form controls scroll; plain slide/wheel pans. */
export function wheelIntent(keys: { ctrlKey?: boolean; metaKey?: boolean }, overControls = false): WheelAction {
  if (keys.ctrlKey || keys.metaKey) return 'zoom';
  return overControls ? 'scroll' : 'pan';
}

export function normalizeWheelDelta(delta: number, deltaMode = 0, pageSize = 800): number {
  if (!Number.isFinite(delta)) return 0;
  if (deltaMode === 1) return delta * 16;
  if (deltaMode === 2) return delta * pageSize;
  return delta;
}

/** Move the canvas with two-finger slide or scroll wheel (Shift+wheel pans horizontally). */
export function panBy(
  viewport: Viewport,
  delta: { deltaX: number; deltaY: number; deltaMode?: number; shiftKey?: boolean },
  pageSize: { width?: number; height?: number } = {},
): Viewport {
  const mode = delta.deltaMode ?? 0;
  let dx = normalizeWheelDelta(delta.deltaX, mode, pageSize.width ?? 800);
  let dy = normalizeWheelDelta(delta.deltaY, mode, pageSize.height ?? 800);
  if (delta.shiftKey && dx === 0 && dy !== 0) {
    dx = dy;
    dy = 0;
  }
  if (dx === 0 && dy === 0) return viewport;
  return { x: viewport.x - dx, y: viewport.y - dy, zoom: viewport.zoom };
}

/** Keep the graph point under the pointer fixed while scaling by a relative factor. */
export function zoomByFactor(viewport: Viewport, factor: number, point: { x: number; y: number }): Viewport {
  if (!Number.isFinite(factor) || factor <= 0 || factor === 1) return viewport;
  const zoom = Math.max(0.1, Math.min(2, viewport.zoom * factor));
  const ratio = zoom / viewport.zoom;
  return {
    x: point.x - (point.x - viewport.x) * ratio,
    y: point.y - (point.y - viewport.y) * ratio,
    zoom,
  };
}

/** Keep the graph point under the pointer fixed while zooming from pinch or wheel deltaY. */
export function zoomAt(
  viewport: Viewport,
  deltaY: number,
  point: { x: number; y: number },
  options?: { deltaMode?: number; pageHeight?: number },
): Viewport {
  const dy = normalizeWheelDelta(deltaY, options?.deltaMode ?? 0, options?.pageHeight ?? 800);
  if (dy === 0) return viewport;
  const abs = Math.abs(dy);
  const magnitude = abs <= 35 ? abs * 0.008 : 0.28 + (abs - 35) * 0.002;
  return zoomByFactor(viewport, Math.exp(-Math.sign(dy) * magnitude), point);
}
