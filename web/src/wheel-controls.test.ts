import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeWheelDelta, panBy, wheelIntent, zoomAt, zoomByFactor } from './wheel-controls.ts';

test('canvas wheel pans on plain slide, scrolls over controls, and zooms on pinch or Ctrl/Meta', () => {
  assert.equal(wheelIntent({}), 'pan');
  assert.equal(wheelIntent({}, true), 'scroll');
  for (const overControls of [false, true]) {
    assert.equal(wheelIntent({ ctrlKey: true }, overControls), 'zoom');
    assert.equal(wheelIntent({ metaKey: true }, overControls), 'zoom');
    assert.equal(wheelIntent({ ctrlKey: true, metaKey: true }, overControls), 'zoom');
  }
});

test('two-finger slide and wheel pan along input deltas and support Shift horizontal scroll', () => {
  const initial = { x: 100, y: -40, zoom: 1.25 };
  assert.deepEqual(panBy(initial, { deltaX: 25, deltaY: -15 }), { x: 75, y: -25, zoom: 1.25 });
  assert.deepEqual(panBy(initial, { deltaX: 0, deltaY: 0 }), initial);
  assert.deepEqual(
    panBy(initial, { deltaX: 0, deltaY: 3, deltaMode: 1 }),
    { x: 100, y: -88, zoom: 1.25 },
  );
  assert.deepEqual(
    panBy(initial, { deltaX: 1, deltaY: -0.5, deltaMode: 2 }, { width: 600, height: 400 }),
    { x: -500, y: 160, zoom: 1.25 },
  );
  assert.deepEqual(
    panBy(initial, { deltaX: 0, deltaY: 120, shiftKey: true }),
    { x: -20, y: -40, zoom: 1.25 },
  );
  // Existing horizontal trackpad deltas are preserved even if Shift is held.
  assert.deepEqual(
    panBy(initial, { deltaX: 18, deltaY: 120, shiftKey: true }),
    { x: 82, y: -160, zoom: 1.25 },
  );
  assert.equal(normalizeWheelDelta(Number.NaN, 0), 0);
});

test('wheel and pinch zoom retain the graph point under the pointer across small and coarse deltas', () => {
  const original = { x: -210, y: 88, zoom: 0.7 }, pointer = { x: 315, y: 220 };
  for (const delta of [-5, 5, -12, 12, -120, 120, -100000, 100000]) {
    const next = zoomAt(original, delta, pointer);
    assert.ok(Math.abs((pointer.x - original.x) / original.zoom - (pointer.x - next.x) / next.zoom) < 1e-8);
    assert.ok(Math.abs((pointer.y - original.y) / original.zoom - (pointer.y - next.y) / next.zoom) < 1e-8);
    assert.ok(next.zoom >= 0.1 && next.zoom <= 2);
  }
  assert.ok(zoomAt(original, -5, pointer).zoom > zoomAt(original, 5, pointer).zoom);
  assert.ok(zoomAt(original, -120, pointer).zoom > zoomAt(original, -35, pointer).zoom);
});

test('zero wheel delta and invalid factor inputs leave the viewport unchanged', () => {
  const viewport = { x: 32, y: -70, zoom: 1.2 };
  const point = { x: 123, y: 456 };
  assert.deepEqual(zoomAt(viewport, 0, point), viewport);
  for (const invalid of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, 1]) {
    assert.deepEqual(zoomByFactor(viewport, invalid, point), viewport);
  }
  const doubled = zoomByFactor(viewport, 1.25, point);
  assert.ok(Math.abs((point.x - viewport.x) / viewport.zoom - (point.x - doubled.x) / doubled.zoom) < 1e-8);
  assert.ok(Math.abs((point.y - viewport.y) / viewport.zoom - (point.y - doubled.y) / doubled.zoom) < 1e-8);
});
