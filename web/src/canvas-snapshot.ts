import type { JSONCanvasDocument } from './canvas.ts';

/**
 * Compare the serialized value of immutable Editor snapshots without creating
 * two JSON strings. Both inputs must already pass validateCanvas and contain
 * plain JSON data (no accessors or toJSON hooks), as parsed Canvas files do.
 *
 * This is not a validator or a general JavaScript deep comparison. In
 * particular, invalid/cyclic input must be rejected before calling it. Shared
 * subtrees are skipped by reference, so callers must not mutate a snapshot in
 * place and expect it to retain its previous value. No results are cached
 * between calls; separately referenced objects are inspected each time.
 */
export function sameCanvasSnapshot(left: JSONCanvasDocument, right: JSONCanvasDocument): boolean {
  return sameJSONValue(left, right);
}

function sameJSONValue(left: unknown, right: unknown): boolean {
  // === matches JSON's treatment of -0 and 0. NaN and other non-JSON values are
  // outside the validated-input contract above.
  if (left === right) return true;
  if (left === null || right === null || typeof left !== 'object' || typeof right !== 'object') return false;

  if (Array.isArray(left)) {
    if (!Array.isArray(right) || left.length !== right.length) return false;
    // JSON.stringify serializes array elements in index order and ignores any
    // extra named properties. Validated JSON arrays have no holes/undefined.
    for (let index = 0; index < left.length; index++) {
      if (!sameJSONValue(left[index], right[index])) return false;
    }
    return true;
  }
  if (Array.isArray(right)) return false;

  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) return false;
  for (let index = 0; index < leftKeys.length; index++) {
    const key = leftKeys[index];
    // Object.keys uses the same property order as JSON.stringify, including
    // integer-like keys. Do not sort: order changes affect the saved source.
    if (key !== rightKeys[index]
      || !sameJSONValue((left as Record<string, unknown>)[key], (right as Record<string, unknown>)[key])) return false;
  }
  return true;
}
