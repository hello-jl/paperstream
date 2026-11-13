import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import { build } from 'esbuild';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ComponentType } from 'react';
import type { InlineTextEditorProps } from './InlineTextEditor.tsx';

// Record the actual textarea's JSX props and invoke the component's own event
// handlers. Layout effects require a browser and are deliberately excluded:
// these checks cover control wiring, not DOM focus or an OS candidate window.
const compiled = await build({
  entryPoints: [new URL('./InlineTextEditor.tsx', import.meta.url).pathname],
  bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic',
  external: ['react', 'react/jsx-runtime'],
});
const require = createRequire(import.meta.url);
const react = require('react');
const serverReact = { ...react, useLayoutEffect() {} };
const runtime = require('react/jsx-runtime') as Record<string, (...args: unknown[]) => unknown>;
const trackedRuntime = { ...runtime };
let textarea: Record<string, unknown> | null = null;
for (const key of ['jsx', 'jsxs']) trackedRuntime[key] = (...args: unknown[]) => {
  if (args[0] === 'textarea') textarea = args[1] as Record<string, unknown>;
  return runtime[key](...args);
};
const loaded = { exports: {} };
new Function('require', 'module', 'exports', compiled.outputFiles[0].text)(
  (name: string) => name === 'react/jsx-runtime' ? trackedRuntime : name === 'react' ? serverReact : require(name),
  loaded, loaded.exports,
);
const { InlineTextEditor } = loaded.exports as { InlineTextEditor: ComponentType<InlineTextEditorProps> };

function editor(options: Pick<InlineTextEditorProps, 'multiline' | 'readOnly'> = {}) {
  const changes: string[] = [];
  let finishes = 0;
  textarea = null;
  const markup = renderToStaticMarkup(createElement(InlineTextEditor, {
    label: '关系说明', value: '原有文本', onChange(value) { changes.push(value); }, onFinish() { finishes++; }, ...options,
  }));
  assert.ok(textarea, 'the real component must render its textarea');
  const input = textarea as Record<string, unknown>;
  const keyDown = (key: string, overrides: Record<string, unknown> = {}) => {
    let stopped = 0, prevented = 0;
    const keyCode = key === 'Enter' ? 13 : key === 'Escape' ? 27 : 65;
    (input.onKeyDown as (event: unknown) => void)({ key, keyCode, ctrlKey: false, metaKey: false,
      nativeEvent: { isComposing: false, keyCode }, stopPropagation() { stopped++; }, preventDefault() { prevented++; }, ...overrides });
    return { stopped, prevented };
  };
  return { markup, input, changes, keyDown, finishes: () => finishes };
}

test('the actual inline textarea is writable by default and stays enabled when temporarily read-only', () => {
  const normal = editor();
  assert.equal(normal.input.readOnly, false);
  assert.doesNotMatch(normal.markup, /readonly=|disabled=/);
  const locked = editor({ readOnly: true });
  assert.equal(locked.input.readOnly, true);
  assert.match(locked.markup, /readonly=""/);
  assert.doesNotMatch(locked.markup, /disabled=/, 'read-only keeps native selection and focus available');
  assert.equal(typeof locked.input.onBlur, 'function', 'normal completion remains wired');
  assert.equal(locked.input.value, '原有文本');
});

test('the actual inline key handler leaves IME Enter, Ctrl+Enter and Escape to composition', () => {
  for (const key of ['Enter', 'Escape']) {
    for (const composition of [
      { nativeEvent: { isComposing: true, keyCode: key === 'Enter' ? 13 : 27 } },
      { keyCode: 229, nativeEvent: { isComposing: false, keyCode: 13 } },
      { keyCode: 13, nativeEvent: { isComposing: false, keyCode: 229 } },
    ]) {
      const control = editor();
      assert.deepEqual(control.keyDown(key, composition), { stopped: 1, prevented: 0 });
      assert.equal(control.finishes(), 0, `composition ${key} must not close the editor`);
      assert.deepEqual(control.keyDown(key, { ...composition, ctrlKey: true }), { stopped: 1, prevented: 0 });
      assert.equal(control.finishes(), 0);
    }
  }
});

test('ordinary inline Enter and Escape finish immediately after composition has ended', () => {
  for (const key of ['Enter', 'Escape']) {
    const control = editor();
    assert.deepEqual(control.keyDown(key), { stopped: 1, prevented: 1 });
    assert.equal(control.finishes(), 1);
  }
  const control = editor();
  assert.deepEqual(control.keyDown('a'), { stopped: 1, prevented: 0 });
  assert.equal(control.finishes(), 0);
});

test('the actual multiline editor allows newline and finishes with Ctrl or Command Enter', () => {
  const control = editor({ multiline: true });
  assert.deepEqual(control.keyDown('Enter'), { stopped: 1, prevented: 0 });
  assert.equal(control.finishes(), 0);
  for (const modifier of ['ctrlKey', 'metaKey']) {
    assert.deepEqual(control.keyDown('Enter', { [modifier]: true }), { stopped: 1, prevented: 1 });
  }
  assert.equal(control.finishes(), 2);
});

test('the actual textarea forwards successive changes immediately without waiting for completion', () => {
  const control = editor();
  const change = control.input.onChange as (event: { target: { value: string } }) => void;
  for (const value of ['中', '中文', '中文 relation', '']) {
    change({ target: { value } });
    assert.equal(control.changes.at(-1), value);
  }
  assert.deepEqual(control.changes, ['中', '中文', '中文 relation', '']);
  assert.equal(control.finishes(), 0, 'writing does not implicitly close the input');
});
