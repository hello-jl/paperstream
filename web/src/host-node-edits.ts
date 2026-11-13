import type { CanvasNode, JSONCanvasDocument } from './canvas.ts';

/** Authorize automatic size persistence for user-edited node snapshots only.
 * History restores the original node objects: an edited ID must not grant
 * permission to change an untouched host snapshot when that snapshot returns.
 * The authority stays outside the document and does not retain discarded nodes.
 */
export function createHostNodeEdits() {
  const edited = new WeakSet<CanvasNode>();

  return {
    has(node: CanvasNode): boolean { return edited.has(node); },

    /** A user edit, drag or insertion authorizes its changed node snapshots. */
    markChanges(previous: JSONCanvasDocument, next: JSONCanvasDocument): void {
      const before = new Map(previous.nodes.map(node => [node.id, node]));
      for (const node of next.nodes) {
        if (node !== before.get(node.id)) edited.add(node);
      }
    },

    /** Derived measurements keep existing authority without granting it to
     * untouched neighbors that were also copied by layout or relation follow.
     */
    inheritMeasurements(previous: JSONCanvasDocument, next: JSONCanvasDocument): void {
      const before = new Map(previous.nodes.map(node => [node.id, node]));
      for (const node of next.nodes) {
        const old = before.get(node.id);
        if (old && edited.has(old)) edited.add(node);
      }
    },
  };
}
