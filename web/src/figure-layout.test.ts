import assert from 'node:assert/strict';
import { test } from 'node:test';
import { figureAlign, figureDimensions, figureLayout, readFigureFrame, validFigureFrame } from './figure-layout.ts';

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAADklEQVR4nGMwmJDwH4QBEOMEP0iNvQ8AAAAASUVORK5CYII=';

test('legacy images keep natural aspect and unknown top-level aspectRatio does not become a crop', () => {
  const figure = { naturalWidth: 200, naturalHeight: 100, aspectRatio: 99 };
  assert.equal(readFigureFrame(figure), null);
  assert.deepEqual(figureLayout(figure, 120), { width: 120, height: 60, framed: false, radius: 6,
    image: { x: 0, y: 0, width: 120, height: 60 } });
});

test('portrait and landscape sources use the same square viewport without stretching', () => {
  const frame = { aspectRatio: 1, fit: 'cover' };
  const wide = figureLayout({ naturalWidth: 200, naturalHeight: 100, frame }, 100);
  const tall = figureLayout({ naturalWidth: 100, naturalHeight: 200, frame }, 100);
  assert.equal(wide.height, 100); assert.equal(tall.height, 100);
  assert.deepEqual(wide.image, { x: -50, y: 0, width: 200, height: 100 });
  assert.deepEqual(tall.image, { x: 0, y: -50, width: 100, height: 200 });
});

test('3:4 framing, crop focus and zoom share an explicit image rectangle', () => {
  const source = { naturalWidth: 100, naturalHeight: 200 };
  const frame = { aspectRatio: .75, fit: 'cover', positionX: 25, positionY: 30, zoom: 2 };
  const layout = figureLayout({ ...source, frame }, 108);
  assert.equal(layout.height, 144);
  assert.equal(layout.image.x, -27); assert.equal(layout.image.width, 216); assert.equal(layout.image.height, 432);
  assert.ok(Math.abs(layout.image.y + 86.4) < 1e-9);
  const top = figureLayout({ ...source, frame: { aspectRatio: 1, fit: 'cover', positionY: 0 } }, 100);
  const bottom = figureLayout({ ...source, frame: { aspectRatio: 1, fit: 'cover', positionY: 100 } }, 100);
  assert.equal(top.image.y, 0); assert.equal(bottom.image.y, -100);
});

test('contain preserves the complete source inside a uniform frame', () => {
  const layout = figureLayout({ naturalWidth: 200, naturalHeight: 100, frame: { aspectRatio: 1, fit: 'contain' } }, 100);
  assert.deepEqual(layout.image, { x: 0, y: 25, width: 100, height: 50 });
});

test('frame ranges are finite and unsupported formats are preserved without affecting layout', () => {
  const valid = { aspectRatio: 1, fit: 'cover', future: { keep: true } };
  assert.ok(validFigureFrame(valid));
  assert.deepEqual(readFigureFrame({ frame: valid }), { aspectRatio: 1, fit: 'cover', positionX: 50, positionY: 50, zoom: 1 });
  for (const frame of [null, 'future', { ...valid, aspectRatio: .249 }, { ...valid, aspectRatio: 4.01 },
    { ...valid, aspectRatio: NaN }, { ...valid, fit: 'stretch' }, { ...valid, zoom: .99 }, { ...valid, zoom: Infinity },
    { ...valid, positionX: -1 }, { ...valid, positionY: 101 }]) {
    const figure = { frame, naturalWidth: 200, naturalHeight: 100 }, before = JSON.stringify(figure);
    assert.equal(readFigureFrame(figure), null);
    assert.equal(figureLayout(figure, 120).height, 60);
    assert.equal(JSON.stringify(figure), before);
  }
  assert.equal(figureAlign({ align: 'center' }), 'center');
  assert.equal(figureAlign({ align: 'right' }), 'right');
  assert.equal(figureAlign({ align: { future: true } }), 'left');
});

test('embedded raster headers supply missing or invalid dimensions for both UI and export', () => {
  for (const dimensions of [{}, { naturalWidth: 0, naturalHeight: 3 }, { naturalWidth: NaN }, { naturalWidth: 2, naturalHeight: Infinity }]) {
    const figure = { src: PNG, ...dimensions };
    assert.deepEqual(figureDimensions(figure), { width: 2, height: 1 });
    assert.equal(figureLayout(figure, 120).height, 60);
  }
});
