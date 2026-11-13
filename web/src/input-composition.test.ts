import assert from 'node:assert/strict';
import test from 'node:test';
import { isComposingKey } from './input-composition.ts';

test('IME Enter and Escape never execute input shortcuts during native composition', () => {
  for (const keyCode of [13, 27]) {
    assert.equal(isComposingKey({ isComposing: true, keyCode }), true);
    assert.equal(isComposingKey({ nativeEvent: { isComposing: true, keyCode } }), true);
  }
});

test('IME 229 stays protected when a browser clears isComposing before confirmation', () => {
  assert.equal(isComposingKey({ isComposing: false, keyCode: 229 }), true);
  assert.equal(isComposingKey({ keyCode: 229, nativeEvent: { isComposing: false, keyCode: 13 } }), true);
  assert.equal(isComposingKey({ keyCode: 13, nativeEvent: { isComposing: false, keyCode: 229 } }), true);
});

test('ordinary keys after composition can edit, finish or search normally', () => {
  for (const keyCode of [13, 27, 65, 8]) {
    assert.equal(isComposingKey({ isComposing: false, keyCode }), false);
    assert.equal(isComposingKey({ keyCode, nativeEvent: { isComposing: false, keyCode } }), false);
  }
  assert.equal(isComposingKey({}), false);
});
