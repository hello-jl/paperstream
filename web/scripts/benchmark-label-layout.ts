/**
 * Reproduce label-layout CPU costs without writing graph files or opening a UI.
 * node --experimental-strip-types web/scripts/benchmark-label-layout.ts
 * Optional original-module path compares every coordinate before timing:
 * node --experimental-strip-types web/scripts/benchmark-label-layout.ts /tmp/original-layout.mts
 * These are CPU microbenchmarks, not browser frame-rate guarantees.
 */
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { layoutEdgeLabels } from '../src/edge-label-layout.ts';
import type { LabelRequest, Rect } from '../src/edge-label-layout.ts';

type Layout = typeof layoutEdgeLabels;
const reference: Layout | undefined = process.argv[2]
  ? (await import(pathToFileURL(resolve(process.argv[2])).href)).layoutEdgeLabels : undefined;
if (reference !== undefined) assert.equal(typeof reference, 'function');

function medianMilliseconds(run: () => unknown): number {
  run();
  const times = Array.from({ length: 5 }, () => {
    const start = performance.now();
    run();
    return performance.now() - start;
  }).sort((a, b) => a - b);
  return Number(times[2].toFixed(3));
}

function fixture(count: number, crowded: boolean): { labels: LabelRequest[]; obstacles: Rect[] } {
  const obstacles = Array.from({ length: count }, (_, index) => ({
    x: (index % 10) * 440, y: Math.floor(index / 10) * 400, width: 360, height: 220,
  }));
  const labels = obstacles.map((rect, index) => ({
    id: `edge-${String(index).padStart(5, '0')}`, width: 180, height: 40,
    // Crowded deliberately covers the anchor, as when manually overlapping
    // cards/labels. Sparse keeps the anchor in a clear inter-card corridor.
    anchor: { x: rect.x + 180, y: rect.y + (crowded ? 110 : 310) },
    pathPoints: [{ x: rect.x + 180, y: rect.y + 220 }, { x: rect.x + 180, y: rect.y + 400 }],
  }));
  return { labels, obstacles };
}

let matchedLayouts = 0;
for (const count of [100, 200, 500]) {
  for (const crowded of [false, true]) {
    const { labels, obstacles } = fixture(count, crowded);
    if (reference) {
      assert.deepEqual(layoutEdgeLabels(labels, obstacles), reference(labels, obstacles));
      matchedLayouts++;
    }
    console.log(JSON.stringify({ cards: count, labels: count, crowded,
      currentMs: medianMilliseconds(() => layoutEdgeLabels(labels, obstacles)),
      ...(reference ? { referenceMs: medianMilliseconds(() => reference(labels, obstacles)) } : {}),
    }));
  }
}

if (reference) {
  let seed = 20261113;
  const random = () => ((seed = (1664525 * seed + 1013904223) >>> 0) / 4294967296);
  for (let sample = 0; sample < 100; sample++) {
    const obstacles = Array.from({ length: 20 }, () => ({ x: Math.round(random() * 1000 - 500),
      y: Math.round(random() * 1000 - 500), width: Math.round(random() * 300 + 10), height: Math.round(random() * 300 + 10) }));
    const labels: LabelRequest[] = Array.from({ length: 15 }, (_, index) => ({ id: `edge-${index}`,
      anchor: { x: Math.round(random() * 1000 - 500), y: Math.round(random() * 1000 - 500) },
      width: Math.round(random() * 300 + 10), height: Math.round(random() * 150 + 10),
      ...(sample % 2 ? { pathPoints: Array.from({ length: 3 }, () => ({
        x: Math.round(random() * 1600 - 800), y: Math.round(random() * 1600 - 800),
      })) } : {}),
    }));
    assert.deepEqual(layoutEdgeLabels(labels, obstacles), reference(labels, obstacles), `seeded sample ${sample}`);
    matchedLayouts++;
  }
  console.log(JSON.stringify({ matchedLayouts, randomSeed: 20261113, coordinatesMatchExactly: true }));
}
