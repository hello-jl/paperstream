/** Run: node --experimental-strip-types web/scripts/benchmark-snapshot-comparison.ts */
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { patchEdge, validateCanvas } from '../src/canvas.ts';
import type { JSONCanvasDocument } from '../src/canvas.ts';
import { sameCanvasSnapshot } from '../src/canvas-snapshot.ts';

function fixture(count: number, totalImageBytes: number): JSONCanvasDocument {
  // Deliberately use one deterministic, valid JSON string per card, not real
  // image decoding. Flattening each value avoids timing string construction.
  const length = Math.floor(totalImageBytes / count);
  const nodes = Array.from({ length: count }, (_, index) => {
    const image = length ? Buffer.from(`${index.toString(16).padStart(8, '0')}${'A'.repeat(Math.max(0, length - 8))}`).toString() : '';
    return {
      id: `n${index}`, type: 'text' as const, text: `Paper ${index}`,
      x: 0, y: index * 200, width: 240, height: 120,
      paperstreamCard: { figures: image ? [{ id: `figure-${index}`, src: `data:image/png;base64,${image}`, widthPercent: 100, caption: '' }] : [] },
    };
  });
  return { nodes, edges: [{ id: 'relation', fromNode: 'n0', toNode: `n${count - 1}`, label: '' }] };
}

function median(values: number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
}

function measure(action: () => boolean, iterations: number): number {
  // Retain every result so the measured work cannot be optimized away.
  const results: boolean[] = [];
  for (let warmup = 0; warmup < 2; warmup++) assert.equal(action(), false);
  const samples: number[] = [];
  for (let index = 0; index < iterations; index++) {
    const start = performance.now();
    results.push(action());
    samples.push(performance.now() - start);
  }
  assert.ok(results.every(result => result === false));
  return median(samples);
}

console.log('Node JSON comparison only; immutable snapshots, one edge label changed. Not browser FPS.');
console.log('nodes\tstring MiB\tdouble stringify median ms\tordered comparison median ms');
for (const count of [100, 1000]) {
  for (const imageMiB of [0, 8, 32]) {
    const original = fixture(count, imageMiB * 1024 * 1024);
    const changed = patchEdge(original, 'relation', { label: 'Inheritance relation' });
    validateCanvas(original);
    validateCanvas(changed);
    assert.strictEqual(changed.nodes, original.nodes);
    assert.ok(changed.nodes.every((node, index) => node === original.nodes[index]));
    const oldComparison = () => JSON.stringify(original) === JSON.stringify(changed);
    const newComparison = () => sameCanvasSnapshot(original, changed);
    assert.equal(newComparison(), oldComparison());
    const iterations = imageMiB === 32 ? 5 : 9;
    const before = measure(oldComparison, iterations);
    const after = measure(newComparison, iterations);
    console.log(`${count}\t${imageMiB}\t${before.toFixed(3)}\t${after.toFixed(6)}`);
  }
}
