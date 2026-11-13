import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { build } from 'esbuild';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ComponentType } from 'react';
import type { PagePanelProps } from './PagePanel.tsx';
import { addNode, createCanvas, createPaperNode } from './canvas.ts';
import { createPresentationPage } from './presentation-pages.ts';

// Exercise the actual rendered component without a browser or an extra DOM
// dependency. esbuild handles its TSX and CSS just as the app build does.
const compiled = await build({
  entryPoints: [new URL('./PagePanel.tsx', import.meta.url).pathname],
  bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic',
  external: ['react', 'react/jsx-runtime'], loader: { '.css': 'empty' },
});
type RenderedControl = { type: string; props: Record<string, unknown> };
let controls: RenderedControl[] | null = null;
const require = createRequire(import.meta.url);
const runtime = require('react/jsx-runtime') as Record<string, (...args: unknown[]) => unknown>;
const trackedRuntime = { ...runtime };
for (const key of ['jsx', 'jsxs']) trackedRuntime[key] = (...args: unknown[]) => {
  const [type, props] = args;
  if ((type === 'input' || type === 'button') && controls) controls.push({ type, props: props as Record<string, unknown> });
  return runtime[key](...args);
};
const loaded = { exports: {} };
new Function('require', 'module', 'exports', compiled.outputFiles[0].text)(
  (name: string) => name === 'react/jsx-runtime' ? trackedRuntime : require(name), loaded, loaded.exports,
);
const { PagePanel } = loaded.exports as { PagePanel: ComponentType<PagePanelProps> };

function panel(options: Pick<PagePanelProps, 'busy' | 'readOnly'> = {}) {
  let document = addNode(createCanvas(), createPaperNode({ alias: 'A', takeaway: '' }, { id: 'paper' }));
  document = addNode(document, { id: 'insert', type: 'text', label: '插页', text: '', x: 400, y: 0, width: 300, height: 200, paperstreamCard: { kind: 'page' } });
  document = createPresentationPage(document, { title: '第一页', nodeIds: ['paper'] });
  document = createPresentationPage(document, { title: '第二页', nodeIds: ['insert'] });
  let changes = 0;
  const rendered: RenderedControl[] = [];
  controls = rendered;
  let markup: string;
  try { markup = renderToStaticMarkup(createElement(PagePanel, { document, onChange() { changes++; }, onFocus() {}, onClose() {}, ...options })); }
  finally { controls = null; }
  const buttons = [...markup.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)]
    .map(match => ({ attributes: match[1], label: match[2].replace(/<[^>]+>/g, '') }));
  const disabled = (label: string) => {
    const button = buttons.find(button => button.label === label);
    assert.ok(button, `Missing ${label} button`);
    return /\bdisabled(?:=|\s|$)/.test(button.attributes);
  };
  const attemptEdit = () => {
    const title = rendered.find(control => control.props['aria-label'] === '页面标题')!;
    const member = rendered.find(control => control.props.type === 'checkbox')!;
    const remove = rendered.find(control => control.props.title === '只删除页面配置，画布卡片保留')!;
    (title.props.onChange as (event: unknown) => void)({ target: { value: '等待时不应接受的修改' } });
    (member.props.onChange as (event: unknown) => void)({ target: { checked: false } });
    (remove.props.onClick as () => void)();
    return changes;
  };
  return { markup, disabled, attemptEdit };
}

test('an open page panel blocks all document edits while a file operation is pending', () => {
  const { markup, disabled, attemptEdit } = panel({ busy: true });
  for (const label of ['＋ 页面', '＋ 整图页', '从插页建页', '上移', '下移', '删除页', '▶ 放映', '导出多页 PPTX']) {
    assert.equal(disabled(label), true, label);
  }
  assert.match(markup, /<input\b[^>]*aria-label="页面标题"[^>]*readonly=""/);
  assert.match(markup, /<fieldset disabled=""><legend>本页卡片/);
  assert.equal(disabled('定位本页'), false, 'view navigation does not modify the document');
  assert.equal(attemptEdit(), 0, 'even direct callbacks cannot change a pending document');
});

test('read-only pages remain viewable and exportable while their content is locked', () => {
  const { markup, disabled, attemptEdit } = panel({ readOnly: true });
  for (const label of ['＋ 页面', '＋ 整图页', '从插页建页', '上移', '下移', '删除页']) assert.equal(disabled(label), true, label);
  assert.match(markup, /<input\b[^>]*aria-label="页面标题"[^>]*readonly=""/);
  assert.match(markup, /<fieldset disabled=""><legend>本页卡片/);
  assert.equal(disabled('▶ 放映'), false);
  assert.equal(disabled('导出多页 PPTX'), false);
  assert.equal(attemptEdit(), 0, 'read-only callbacks never reach the document owner');
});

test('normal editing keeps the page controls and member selection available', () => {
  const { markup, disabled, attemptEdit } = panel();
  for (const label of ['＋ 页面', '＋ 整图页', '从插页建页', '下移', '删除页']) assert.equal(disabled(label), false, label);
  assert.doesNotMatch(markup, /<input\b[^>]*aria-label="页面标题"[^>]*readonly=/);
  assert.match(markup, /<fieldset><legend>本页卡片/);
  assert.equal(attemptEdit(), 3, 'title, membership and deletion still reach the document owner');
});
