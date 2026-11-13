import type { Node } from '@xyflow/react';

/** Keep React Flow's DOM measurements when refreshing nodes from Canvas data.
 * Dropping `measured` also clears handle bounds, briefly unmounting every
 * connected edge (including any active label input). Other state comes from
 * the new projection; measurements never become part of the Canvas document.
 */
export function preserveNodeMeasurements<T extends Node>(previous: T[], next: T[]): T[] {
  const byId = new Map(previous.map(node => [node.id, node]));
  return next.map(node => {
    const old = byId.get(node.id);
    return !node.measured && old?.measured && old.type === node.type
      ? { ...node, measured: old.measured } : node;
  });
}
