export interface Viewport { x: number; y: number; zoom: number }
export function wheelIntent(keys: { altKey?: boolean; ctrlKey?: boolean; metaKey?: boolean }, selected: boolean): 'zoom' | 'weight' {
  return selected && !keys.ctrlKey && !keys.metaKey ? 'weight' : 'zoom';
}
/** Keep the graph point under the mouse fixed while Ctrl-wheel zooms. */
export function zoomAt(viewport: Viewport, deltaY: number, point: { x: number; y: number }): Viewport {
  const zoom = Math.max(0.1, Math.min(2, viewport.zoom * Math.exp(-deltaY * 0.004)));
  const ratio = zoom / viewport.zoom;
  return { x: point.x - (point.x - viewport.x) * ratio, y: point.y - (point.y - viewport.y) * ratio, zoom };
}
export function wheelStroke(width: number, deltaY: number): number {
  return deltaY === 0 ? width : Math.round(Math.max(0.5, Math.min(8, width + (deltaY < 0 ? 0.2 : -0.2))) * 10) / 10;
}
