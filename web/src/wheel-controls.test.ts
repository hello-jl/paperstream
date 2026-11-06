import { test } from 'node:test';
import assert from 'node:assert/strict';
import { zoomAt, wheelIntent } from './wheel-controls.ts';

test('canvas wheel always zooms; controls scroll ordinarily and Ctrl or Meta retain zoom', () => {
  assert.equal(wheelIntent({}), 'zoom');
  assert.equal(wheelIntent({}, true), 'scroll');
  for (const overControls of [false, true]) {
    assert.equal(wheelIntent({ ctrlKey: true }, overControls), 'zoom');
    assert.equal(wheelIntent({ metaKey: true }, overControls), 'zoom');
    assert.equal(wheelIntent({ ctrlKey: true, metaKey: true }, overControls), 'zoom');
  }
});

test('wheel zoom retains the graph point under the pointer for translated negative-coordinate views', () => {
  const original = { x: -210, y: 88, zoom: 0.7 }, pointer = { x: 315, y: 220 };
  for (const delta of [-120, 120, -100000, 100000]) {
    const next = zoomAt(original, delta, pointer);
    assert.ok(Math.abs((pointer.x - original.x) / original.zoom - (pointer.x - next.x) / next.zoom) < 1e-8);
    assert.ok(Math.abs((pointer.y - original.y) / original.zoom - (pointer.y - next.y) / next.zoom) < 1e-8);
    assert.ok(next.zoom >= 0.1 && next.zoom <= 2);
  }
});
test('horizontal-only wheel input does not change viewport', () => {
  const viewport = { x: 32, y: -70, zoom: 1.2 };
  assert.deepEqual(zoomAt(viewport, 0, { x: 123, y: 456 }), viewport);
});
