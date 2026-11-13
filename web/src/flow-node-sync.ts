import type { Node } from '@xyflow/react';

function sameData(previous: object, next: object): boolean {
  if (Object.is(previous, next)) return true;
  if (Object.getPrototypeOf(previous) !== Object.getPrototypeOf(next)) return false;
  const keys = Reflect.ownKeys(previous);
  return keys.length === Reflect.ownKeys(next).length && keys.every(key =>
    Object.hasOwn(next, key) && Object.is(Reflect.get(previous, key), Reflect.get(next, key)));
}

/** Keep React Flow's DOM measurements when refreshing nodes from Canvas data.
 * Dropping `measured` also clears handle bounds, briefly unmounting every
 * connected edge (including any active label input). Reuse shallowly identical
 * data so an unrelated edit does not rerender every memoized card. All other
 * state comes from the new projection; measurements never become Canvas data.
 * No Canvas objects are cached or compared by their serialized contents.
 */
export function preserveNodeMeasurements<T extends Node>(previous: T[], next: T[]): T[] {
  const byId = new Map(previous.map(node => [node.id, node]));
  return next.map(node => {
    const old = byId.get(node.id);
    if (!old || old.type !== node.type) return node;
    const data = sameData(old.data, node.data) ? old.data : node.data;
    const measured = node.measured ?? old.measured;
    return data === node.data && measured === node.measured
      ? node : { ...node, data, ...(measured ? { measured } : {}) };
  });
}
