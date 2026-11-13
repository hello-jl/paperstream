import assert from 'node:assert/strict';
import { test } from 'node:test';
import { appendFiguresPatch, extractClipboardImages, readClipboardFigures } from './clipboard-images.ts';
import { readFigures } from './card-media.ts';
import type { CardFigure } from './card-media.ts';
import type { CanvasNode } from './canvas.ts';

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAADklEQVR4nGMwmJDwH4QBEOMEP0iNvQ8AAAAASUVORK5CYII=', 'base64');
function file(name = 'image.png', type = 'image/png') {
  return new File([png], name, { type, lastModified: 123 });
}
function item(image: File) { return { kind: 'file', type: image.type, getAsFile: () => image }; }
const figure = (id: string): CardFigure => ({ id, src: 'data:image/png;base64,iVBORw0KGgo=', caption: '', widthPercent: 100 });
const node = (): CanvasNode => ({ id: 'paper', type: 'text', text: 'latest edited text', x: 12, y: 34, width: 320, height: 200,
  futureNodeField: ['keep'], paperstreamCard: { kind: 'page', futureCardField: { value: 42 },
    figures: [{ unknownFigure: true }, { ...figure('existing'), caption: 'latest caption', futureFigureField: 7 }] } });

test('ordinary text and HTML paste are untouched and never read as image URLs', () => {
  const text = { kind: 'string', type: 'text/plain', getAsFile: () => { throw new Error('must not read text'); } };
  const html = { ...text, type: 'text/html' };
  assert.deepEqual(extractClipboardImages({ items: [text, html], files: [] }), { files: [], hasImages: false, unsupportedTypes: [] });
  assert.deepEqual(extractClipboardImages(null), { files: [], hasImages: false, unsupportedTypes: [] });
});

test('image plus HTML imports the local image only', () => {
  const image = file();
  const html = { kind: 'string', type: 'text/html', getAsFile: () => { throw new Error('must not read HTML'); } };
  assert.deepEqual(extractClipboardImages({ items: [html, item(image)], files: [image] }),
    { files: [image], hasImages: true, unsupportedTypes: [] });
});

test('deduplicates images mirrored by items/files even with separate File wrappers', () => {
  const image = file(), wrapper = file();
  assert.notEqual(image, wrapper);
  assert.deepEqual(extractClipboardImages({ items: [item(image)], files: [wrapper] }).files, [image]);
  assert.deepEqual(extractClipboardImages({ items: [item(image), item(image)], files: [image] }).files, [image]);
});

test('multiple images retain order and equal metadata does not erase distinct clipboard items', () => {
  const first = file(), second = file(), third = file('third.webp', 'image/webp');
  const result = extractClipboardImages({ items: [item(first), item(second)], files: [file(), file(), third] });
  assert.equal(result.files.length, 3);
  assert.equal(result.files[0], first);
  assert.equal(result.files[1], second);
  assert.equal(result.files[2], third);
});

test('files fallback and missing MIME metadata recognize supported raster filenames', () => {
  const jpeg = file('photo.JPG', ''), image = file();
  assert.deepEqual(extractClipboardImages({ files: [jpeg, image] }).files, [jpeg, image]);
  const noName = file('', '');
  assert.deepEqual(extractClipboardImages({ items: [{ kind: 'file', type: 'image/png', getAsFile: () => noName }] }).files, [noName]);
});

test('unsupported images and unreadable image items report a clear reason; other files remain ordinary paste', () => {
  const gif = file('animated.gif', 'image/gif'), svg = file('vector.svg', ''), pdf = file('paper.pdf', 'application/pdf');
  const result = extractClipboardImages({ items: [item(gif), item(svg), item(pdf)], files: [gif, svg, pdf] });
  assert.equal(result.hasImages, true);
  assert.deepEqual(result.files, []);
  assert.deepEqual(result.unsupportedTypes, ['image/gif', 'image/svg']);
  assert.equal(extractClipboardImages({ files: [pdf] }).hasImages, false);
  const unreadable = extractClipboardImages({ items: [{ kind: 'file', type: 'image/png', getAsFile: () => null }] });
  assert.equal(unreadable.hasImages, true);
  assert.match(unreadable.unsupportedTypes[0], /无法读取/);
});

test('decodes all pasted raster files with empty captions and rejects a corrupt batch', async () => {
  const original = globalThis.createImageBitmap;
  let closed = 0;
  globalThis.createImageBitmap = (async () => ({ width: 100, height: 200, close() { closed++; } })) as typeof createImageBitmap;
  try {
    const figures = await readClipboardFigures([file('first.png'), file('second.png')]);
    assert.equal(figures.length, 2);
    assert.notEqual(figures[0].id, figures[1].id);
    assert.ok(figures.every(value => value.caption === '' && value.naturalWidth === 100 && value.naturalHeight === 200));
    assert.equal(closed, 2);
    await assert.rejects(readClipboardFigures([file(), new File(['<svg/>'], 'fake.png', { type: 'image/png' })]), /只支持/);
  } finally { globalThis.createImageBitmap = original; }
});

test('merges one complete image batch against the latest metadata without changing unknown data', () => {
  const latest = node(), before = structuredClone(latest);
  const patch = appendFiguresPatch(latest, [figure('first'), figure('second')]);
  assert.deepEqual(Object.keys(patch), ['paperstreamCard']);
  const next = { ...latest, ...patch };
  assert.deepEqual(readFigures(next).map(value => value.id), ['existing', 'first', 'second']);
  assert.deepEqual(next.paperstreamCard, { kind: 'page', futureCardField: { value: 42 }, figures: [
    { unknownFigure: true }, { ...figure('existing'), caption: 'latest caption', futureFigureField: 7 }, figure('first'), figure('second'),
  ] });
  assert.equal(next.text, 'latest edited text');
  assert.deepEqual(next.futureNodeField, ['keep']);
  assert.deepEqual(latest, before);
});

test('invalid batch and incompatible existing metadata cannot partially mutate the card', () => {
  const latest = node(), before = structuredClone(latest);
  assert.throws(() => appendFiguresPatch(latest, [figure('first'), figure('existing')]), /ID/);
  assert.deepEqual(latest, before);
  assert.throws(() => appendFiguresPatch({ ...latest, paperstreamCard: { figures: 'future format' } }, [figure('first')]), /原数据已保留/);
  assert.deepEqual(appendFiguresPatch(latest, []), {});
});
