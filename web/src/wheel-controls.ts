export interface Viewport { x: number; y: number; zoom: number }
/** Selection never changes wheel behavior; local form controls retain scrolling. */
export function wheelIntent(keys: { ctrlKey?: boolean; metaKey?: boolean }, overControls = false): 'zoom' | 'scroll' {
  return overControls && !keys.ctrlKey && !keys.metaKey ? 'scroll' : 'zoom';
}
/** Keep the graph point under the mouse fixed while the wheel zooms. */
export function zoomAt(viewport: Viewport, deltaY: number, point: { x: number; y: number }): Viewport {
  const zoom = Math.max(0.1, Math.min(2, viewport.zoom * Math.exp(-deltaY * 0.004)));
  const ratio = zoom / viewport.zoom;
  return { x: point.x - (point.x - viewport.x) * ratio, y: point.y - (point.y - viewport.y) * ratio, zoom };
}
