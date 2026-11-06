import { test } from 'node:test';
import assert from 'node:assert/strict';
import { zoomAt, wheelStroke, wheelIntent } from './wheel-controls.ts';

test('selection switches ordinary wheel to line weight; Ctrl and Meta always zoom', () => {
  for (const selected of [false, true]) {
    assert.equal(wheelIntent({}, selected), selected ? 'weight' : 'zoom');
    assert.equal(wheelIntent({ ctrlKey: true }, selected), 'zoom');
    assert.equal(wheelIntent({ metaKey: true }, selected), 'zoom');
    assert.equal(wheelIntent({ ctrlKey: true, altKey: true }, selected), 'zoom');
    assert.equal(wheelIntent({ metaKey: true, altKey: true }, selected), 'zoom');
  }
  assert.equal(wheelIntent({ altKey: true }, false), 'zoom');
  assert.equal(wheelIntent({ altKey: true }, true), 'weight');
});

test('Ctrl-wheel retains the same graph point under the pointer for translated negative-coordinate views', () => {
  const original = { x: -210, y: 88, zoom: 0.7 }, pointer = { x: 315, y: 220 };
  for (const delta of [-120, 120, -100000, 100000]) {
    const next = zoomAt(original, delta, pointer);
    assert.ok(Math.abs((pointer.x - original.x) / original.zoom - (pointer.x - next.x) / next.zoom) < 1e-8);
    assert.ok(Math.abs((pointer.y - original.y) / original.zoom - (pointer.y - next.y) / next.zoom) < 1e-8);
    assert.ok(next.zoom >= 0.1 && next.zoom <= 2);
  }
});
test('line weight changes independently in bounded tenths and ignores horizontal-only input', () => {
  assert.equal(wheelStroke(1, -1), 1.2); assert.equal(wheelStroke(1.8, 1), 1.6);
  assert.equal(wheelStroke(0.5, 1), 0.5); assert.equal(wheelStroke(8, -1), 8);
  assert.equal(wheelStroke(3, 0), 3);
});
