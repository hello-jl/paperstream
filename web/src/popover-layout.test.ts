import assert from 'node:assert/strict';
import { test } from 'node:test';
import { placePopover } from './popover-layout.ts';

test('contextual details stay near the clicked point when space is available', () => {
  assert.deepEqual(placePopover({ x: 120, y: 80 }, { width: 340, height: 400 }, { width: 1000, height: 700 }), { x: 132, y: 92 });
});

test('details opened at every viewport edge remain fully accessible', () => {
  const viewport = { width: 700, height: 550 }, panel = { width: 340, height: 500 };
  for (const x of [-200, 0, 350, 700, 1000]) for (const y of [-200, 0, 275, 550, 900]) {
    const position = placePopover({ x, y }, panel, viewport);
    assert.ok(position.x >= 12 && position.y >= 12);
    assert.ok(position.x + panel.width <= viewport.width - 12);
    assert.ok(position.y + panel.height <= viewport.height - 12);
  }
});

test('a panel constrained to a narrow workspace stays inside its margins', () => {
  const panel = { width: 256, height: 316 }, viewport = { width: 280, height: 340 };
  assert.deepEqual(placePopover({ x: 278, y: 338 }, panel, viewport), { x: 12, y: 12 });
});
