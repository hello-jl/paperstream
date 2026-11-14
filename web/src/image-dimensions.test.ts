import assert from 'node:assert/strict';
import test from 'node:test';
import { deflateSync } from 'node:zlib';
import { figureFromFile } from './card-media.ts';
import { figureDimensions, figureLayout } from './figure-layout.ts';
import { rasterDimensions } from './image-dimensions.ts';

function png(width: number, height: number) {
  function chunk(kind: string, data: Buffer) {
    const type = Buffer.from(kind), result = Buffer.alloc(data.length + 12);
    result.writeUInt32BE(data.length); type.copy(result, 4); data.copy(result, 8);
    let crc = 0xffffffff;
    for (const byte of Buffer.concat([type, data])) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit++) crc = crc >>> 1 ^ ((crc & 1) ? 0xedb88320 : 0);
    }
    result.writeUInt32BE((crc ^ 0xffffffff) >>> 0, data.length + 8);
    return result;
  }
  const header = Buffer.alloc(13); header.writeUInt32BE(width); header.writeUInt32BE(height, 4); header[8] = 1;
  // Real 1-bit grayscale PNG: compressed size can be tiny despite its pixels.
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.alloc((Math.ceil(width / 8) + 1) * height))), chunk('IEND', Buffer.alloc(0))]);
}
function jpeg(width: number, height: number, marker = 0xc0) {
  const header = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0xff, marker, 0, 11, 8, 0, 0, 0, 0, 1, 1, 0x11, 0]);
  header.writeUInt16BE(height, 13); header.writeUInt16BE(width, 15);
  return header;
}
function jpegExif(width: number, height: number, orientation: number, little = true, afterFrame = false) {
  const tiff = Buffer.alloc(26);
  tiff.write(little ? 'II' : 'MM');
  const short = (value: number, offset: number) => little ? tiff.writeUInt16LE(value, offset) : tiff.writeUInt16BE(value, offset);
  const long = (value: number, offset: number) => little ? tiff.writeUInt32LE(value, offset) : tiff.writeUInt32BE(value, offset);
  short(42, 2); long(8, 4); short(1, 8); short(0x112, 10); short(3, 12); long(1, 14); short(orientation, 18);
  const app = Buffer.concat([Buffer.from([0xff, 0xe1, 0, 34]), Buffer.from('Exif\0\0'), tiff]);
  const original = jpeg(width, height);
  return afterFrame ? Buffer.concat([original, app]) : Buffer.concat([original.subarray(0, 2), app, original.subarray(2)]);
}
function webp(kind: 'VP8 ' | 'VP8L' | 'VP8X', width: number, height: number) {
  const payload = Buffer.alloc(kind === 'VP8L' ? 5 : 10);
  if (kind === 'VP8 ') {
    payload.set([0x9d, 0x01, 0x2a], 3); payload.writeUInt16LE(width, 6); payload.writeUInt16LE(height, 8);
  } else if (kind === 'VP8L') {
    payload[0] = 0x2f; payload.writeUInt32LE((width - 1) | (height - 1) << 14, 1);
  } else {
    payload.writeUIntLE(width - 1, 4, 3); payload.writeUIntLE(height - 1, 7, 3);
  }
  const header = Buffer.alloc(20); header.write('RIFF'); header.writeUInt32LE(12 + payload.length + (payload.length & 1), 4);
  header.write('WEBP', 8); header.write(kind, 12); header.writeUInt32LE(payload.length, 16);
  return Buffer.concat([header, payload, Buffer.alloc(payload.length & 1)]);
}

test('raster preflight reads PNG, baseline/progressive JPEG and all WebP container dimensions', () => {
  assert.deepEqual(rasterDimensions(png(11, 7), 'image/png'), { width: 11, height: 7 });
  for (const marker of [0xc0, 0xc1, 0xc2]) {
    assert.deepEqual(rasterDimensions(jpeg(1920, 1080, marker), 'image/jpeg'), { width: 1920, height: 1080 });
  }
  for (const kind of ['VP8 ', 'VP8L', 'VP8X'] as const) {
    assert.deepEqual(rasterDimensions(webp(kind, 2345, 3456), 'image/webp'), { width: 2345, height: 3456 });
  }
  const padded = Buffer.concat([Buffer.alloc(5), png(1, 2), Buffer.alloc(5)]);
  assert.deepEqual(rasterDimensions(padded.subarray(5, padded.length - 5), 'image/png'), { width: 1, height: 2 });
});

test('truncated/invalid headers fail without out-of-bounds reads or unbounded scanning', () => {
  for (const [bytes, mime] of [[png(2, 1), 'image/png'], [jpeg(2, 1), 'image/jpeg'], [webp('VP8L', 2, 1), 'image/webp']] as const) {
    for (let size = 0; size < (mime === 'image/png' ? 33 : bytes.length - (bytes.length & 1)); size++) {
      assert.equal(rasterDimensions(bytes.subarray(0, size), mime), null);
    }
  }
  const invalidJpeg = jpeg(2, 1); invalidJpeg.writeUInt16BE(0, 4);
  assert.equal(rasterDimensions(invalidJpeg, 'image/jpeg'), null);
  assert.equal(rasterDimensions(new Uint8Array([0xff, 0xd8, 0xff, 0xff, 0xff]), 'image/jpeg'), null);
});

test('JPEG EXIF orientation uses the browser display aspect for legacy figures without changing source bytes', () => {
  for (const little of [true, false]) for (const afterFrame of [true, false]) for (let orientation = 1; orientation <= 8; orientation++) {
    const bytes = jpegExif(40, 20, orientation, little, afterFrame), before = Buffer.from(bytes);
    const dimensions = orientation >= 5 ? { width: 20, height: 40 } : { width: 40, height: 20 };
    assert.deepEqual(rasterDimensions(bytes, 'image/jpeg'), dimensions);
    const src = `data:image/jpeg;base64,${bytes.toString('base64')}`, figure = { src };
    assert.deepEqual(figureDimensions(figure), dimensions);
    assert.equal(figureLayout(figure, 100).height, orientation >= 5 ? 200 : 50);
    const square = figureLayout({ ...figure, frame: { aspectRatio: 1, fit: 'cover' } }, 100);
    assert.deepEqual(square.image, orientation >= 5 ? { x: 0, y: -50, width: 100, height: 200 }
      : { x: -50, y: 0, width: 200, height: 100 });
    assert.deepEqual(figureDimensions({ ...figure, naturalWidth: 20, naturalHeight: 40 }), { width: 20, height: 40 }, 'decoded metadata is already oriented');
    assert.deepEqual(bytes, before);
    assert.equal(figure.src, src);
  }
});

test('malformed EXIF offsets, counts and orientation values stay bounded and leave the raw aspect usable', () => {
  for (const corrupt of [(bytes: Buffer) => bytes.writeUInt32LE(0xffffffff, 16),
    (bytes: Buffer) => bytes.writeUInt16LE(0xffff, 20), (bytes: Buffer) => bytes.writeUInt16LE(9, 30),
    (bytes: Buffer) => bytes.writeUInt16LE(4, 24), (bytes: Buffer) => bytes.writeUInt32LE(2, 26)]) {
    const bytes = jpegExif(40, 20, 6); corrupt(bytes);
    assert.deepEqual(rasterDimensions(bytes, 'image/jpeg'), { width: 40, height: 20 });
    for (let length = 0; length <= bytes.length; length++) assert.doesNotThrow(() => rasterDimensions(bytes.subarray(0, length), 'image/jpeg'));
  }
  const bytes = jpegExif(40, 20, 6), padded = Buffer.concat([Buffer.alloc(5), bytes, Buffer.alloc(7)]);
  assert.deepEqual(rasterDimensions(padded.subarray(5, 5 + bytes.length), 'image/jpeg'), { width: 20, height: 40 });
});

test('a valid 12 KB PNG with 100 million pixels is rejected before browser decoding', async () => {
  const bytes = png(10000, 10000);
  assert.ok(bytes.length < 13000);
  const original = globalThis.createImageBitmap;
  let calls = 0;
  globalThis.createImageBitmap = (async () => { calls++; throw new Error('must not allocate'); }) as typeof createImageBitmap;
  try {
    await assert.rejects(figureFromFile(new File([bytes], 'large-pixels.png')), /像素过大/);
    for (const bytes of [jpeg(12000, 12000), webp('VP8 ', 12000, 12000), webp('VP8L', 12000, 12000), webp('VP8X', 20000, 1)]) {
      await assert.rejects(figureFromFile(new File([bytes], 'large-image')), /像素过大/);
    }
    assert.equal(calls, 0);
  } finally { globalThis.createImageBitmap = original; }
});

test('decoded dimensions are checked again and every decoded bitmap closes, including failures', async () => {
  const original = globalThis.createImageBitmap;
  try {
    for (const [width, height] of [[0, 1], [NaN, 1], [1, Infinity], [1.5, 1], [10000, 10000], [20000, 1]]) {
      let closed = false;
      globalThis.createImageBitmap = (async () => ({ width, height, close() { closed = true; } })) as typeof createImageBitmap;
      await assert.rejects(figureFromFile(new File([png(2, 1)], 'changed-decoder.png')), /图片尺寸无效|像素过大/);
      assert.equal(closed, true);
    }
  } finally { globalThis.createImageBitmap = original; }
});

test('pixel and single-side limits accept their exact boundary', async () => {
  const original = globalThis.createImageBitmap;
  try {
    for (const [width, height] of [[8000, 4000], [16384, 1]]) {
      let closed = false;
      globalThis.createImageBitmap = (async () => ({ width, height, close() { closed = true; } })) as typeof createImageBitmap;
      const figure = await figureFromFile(new File([jpeg(width, height)], 'boundary.jpg'));
      assert.equal(figure.naturalWidth, width);
      assert.equal(figure.naturalHeight, height);
      assert.equal(closed, true);
    }
  } finally { globalThis.createImageBitmap = original; }
});
