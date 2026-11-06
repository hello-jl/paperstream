import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getContentBounds, layoutEdgeLabels } from './edge-label-layout.ts';
import type { LabelRequest, Point, Rect } from './edge-label-layout.ts';

function label(id: string, anchor: Point, width = 160, height = 40): LabelRequest {
  return { id, anchor, width, height };
}

// Check separation geometrically, independently of how candidate positions are found.
function assertSeparated(a: Rect, b: Rect): void {
  const horizontalGap = Math.max(b.x - a.x - a.width, a.x - b.x - b.width);
  const verticalGap = Math.max(b.y - a.y - a.height, a.y - b.y - b.height);
  assert.ok(horizontalGap >= 8 - 1e-7 || verticalGap >= 8 - 1e-7,
    `Insufficient separation: ${JSON.stringify(a)} and ${JSON.stringify(b)}`);
}

function assertLayout(labels: readonly LabelRequest[], obstacles: readonly Rect[], positions: Map<string, Point>): void {
  assert.equal(positions.size, labels.length);
  const placed: Rect[] = [];
  for (const request of labels) {
    const center = positions.get(request.id);
    assert.ok(center);
    assert.ok(Number.isFinite(center.x) && Number.isFinite(center.y));
    const rect = { x: center.x - request.width / 2, y: center.y - request.height / 2,
      width: request.width, height: request.height };
    for (const obstacle of [...obstacles, ...placed]) assertSeparated(rect, obstacle);
    placed.push(rect);
  }
}

test('a clear connection keeps its anchor exactly and leaves inputs untouched', () => {
  const labels = [label('edge', { x: 210, y: 50 })];
  const obstacles = [{ x: 0, y: 0, width: 100, height: 100 }, { x: 320, y: 0, width: 100, height: 100 }];
  const before = JSON.stringify({ labels, obstacles });
  const result = layoutEdgeLabels(labels, obstacles);
  assert.deepEqual(result.get('edge'), labels[0].anchor);
  assertLayout(labels, obstacles, result);
  assert.equal(JSON.stringify({ labels, obstacles }), before);
});

test('long and tall labels avoid overlapping cards and one another at negative coordinates', () => {
  const obstacles = [
    { x: -400, y: -250, width: 500, height: 350 },
    { x: -160, y: -100, width: 450, height: 400 },
    { x: 360, y: -250, width: 160, height: 550 },
  ];
  const labels = [label('c', { x: 0, y: 0 }, 400, 220), label('a', { x: 0, y: 0 }, 440, 48),
    label('b', { x: -200, y: -120 }, 90, 360), label('d', { x: 0, y: 0 }, 260, 130)];
  for (const request of labels) request.pathPoints = [{ x: -500, y: -50 }, { x: 600, y: -50 }];
  assertLayout(labels, obstacles, layoutEdgeLabels(labels, obstacles));
});

test('placement is stable across repeated calls and shuffled label or obstacle order', () => {
  const labels = [label('z', { x: 0, y: 0 }), label('a', { x: 0, y: 0 }), label('m', { x: 60, y: 0 })];
  const obstacles = [{ x: -60, y: -40, width: 200, height: 120 }, { x: 100, y: 80, width: 150, height: 160 }];
  const result = layoutEdgeLabels(labels, obstacles);
  assert.deepEqual(layoutEdgeLabels(labels, obstacles), result);
  assert.deepEqual(layoutEdgeLabels([...labels].reverse(), [...obstacles].reverse()), result);
  assertLayout(labels, obstacles, result);
});

test('moving a card onto a label reroutes it and moving the card away restores its anchor', () => {
  const labels = [label('edge', { x: 0, y: 0 }, 180, 70)];
  const away = [{ x: 500, y: 500, width: 300, height: 200 }];
  const initial = layoutEdgeLabels(labels, away);
  const blocking = [{ ...away[0], x: -100, y: -60 }];
  const displaced = layoutEdgeLabels(labels, blocking);
  assert.notDeepEqual(displaced.get('edge'), initial.get('edge'));
  assertLayout(labels, blocking, displaced);
  assert.deepEqual(layoutEdgeLabels(labels, away), initial);
});

test('nearby open path segments are preferred to distant empty space', () => {
  const labels: LabelRequest[] = [{ ...label('edge', { x: 0, y: 0 }, 80, 30),
    pathPoints: [{ x: -250, y: 0 }, { x: 250, y: 0 }] }];
  const obstacles = [{ x: -50, y: -100, width: 100, height: 200 }];
  const result = layoutEdgeLabels(labels, obstacles);
  assertLayout(labels, obstacles, result);
  assert.equal(result.get('edge')?.y, 0);
  assert.ok(Math.abs(result.get('edge')!.x) < 150);
});

test('enormous obstacles and crowded paths still have a finite collision-free fallback', () => {
  const obstacles = [{ x: -10000000, y: -20000000, width: 20000000, height: 40000000 },
    { x: -20000000, y: -10000000, width: 40000000, height: 20000000 }];
  const labels = Array.from({ length: 12 }, (_, index) => label(`edge-${index}`, { x: 0, y: 0 },
    1000 + index * 137, 400 + index * 61));
  assertLayout(labels, obstacles, layoutEdgeLabels(labels, obstacles));
});

test('invalid dimensions, nonfinite coordinates, and duplicate IDs fail explicitly', () => {
  assert.throws(() => layoutEdgeLabels([label('a', { x: NaN, y: 0 })], []), RangeError);
  assert.throws(() => layoutEdgeLabels([label('a', { x: 0, y: 0 }, 0)], []), RangeError);
  assert.throws(() => layoutEdgeLabels([], [{ x: 0, y: 0, width: Infinity, height: 20 }]), RangeError);
  assert.throws(() => layoutEdgeLabels([label('a', { x: 0, y: 0 }), label('a', { x: 50, y: 0 })], []), /Duplicate/);
});

test('fit bounds include cards and labels displaced above and left of the graph', () => {
  const rects = [
    { x: 40, y: 30, width: 360, height: 240 },
    { x: 540, y: 330, width: 320, height: 220 },
    { x: -180, y: 120, width: 140, height: 60 },
    { x: 180, y: -140, width: 260, height: 70 },
  ];
  const bounds = getContentBounds(rects);
  assert.deepEqual(bounds, { x: -180, y: -140, width: 1040, height: 690 });
  assert.ok(bounds);
  for (const rect of rects) {
    assert.ok(bounds.x <= rect.x && bounds.y <= rect.y);
    assert.ok(bounds.x + bounds.width >= rect.x + rect.width);
    assert.ok(bounds.y + bounds.height >= rect.y + rect.height);
  }
  assert.deepEqual(getContentBounds([...rects].reverse()), bounds);
});

test('fit bounds handle an empty graph and retain a usable extent for subpixel content', () => {
  assert.equal(getContentBounds([]), null);
  assert.deepEqual(getContentBounds([{ x: -2, y: -3, width: 0.25, height: 0.5 }]),
    { x: -2, y: -3, width: 1, height: 1 });
  assert.throws(() => getContentBounds([{ x: NaN, y: 0, width: 1, height: 1 }]), RangeError);
  assert.throws(() => getContentBounds([{ x: 0, y: 0, width: -1, height: 1 }]), RangeError);
});
