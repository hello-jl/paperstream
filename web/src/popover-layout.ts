export interface PopoverPoint { x: number; y: number }
export interface PopoverSize { width: number; height: number }

/** Place a contextual panel next to its anchor, entirely inside the workspace. */
export function placePopover(anchor: PopoverPoint, panel: PopoverSize, viewport: PopoverSize): PopoverPoint {
  const margin = Math.min(12, viewport.width / 2, viewport.height / 2);
  const gap = 12;
  const maxX = Math.max(margin, viewport.width - panel.width - margin);
  const maxY = Math.max(margin, viewport.height - panel.height - margin);
  const x = anchor.x + gap + panel.width <= viewport.width - margin
    ? anchor.x + gap : anchor.x - panel.width - gap;
  const y = anchor.y + gap + panel.height <= viewport.height - margin
    ? anchor.y + gap : anchor.y - panel.height - gap;
  return { x: Math.max(margin, Math.min(maxX, x)), y: Math.max(margin, Math.min(maxY, y)) };
}
