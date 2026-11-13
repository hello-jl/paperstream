export interface ImageDimensions { width: number; height: number; }

/** Read only the raster header before asking the browser to allocate a bitmap.
 * This is not a replacement for image decoding/validation.
 * PNG IHDR: https://www.w3.org/TR/png/#11IHDR
 * WebP chunks: https://developers.google.com/speed/webp/docs/riff_container */
export function rasterDimensions(bytes: Uint8Array, mime: string): ImageDimensions | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const text = (offset: number, length: number) => String.fromCharCode(...bytes.subarray(offset, offset + length));
  if (mime === 'image/png') {
    if (bytes.length < 33 || view.getUint32(8) !== 13 || text(12, 4) !== 'IHDR') return null;
    return { width: view.getUint32(16), height: view.getUint32(20) };
  }
  if (mime === 'image/jpeg') {
    let offset = 2;
    while (offset < bytes.length) {
      if (bytes[offset++] !== 0xff) return null;
      while (offset < bytes.length && bytes[offset] === 0xff) offset++;
      if (offset >= bytes.length) return null;
      const marker = bytes[offset++];
      if (marker === 0xd9 || marker === 0xda || marker === 0) return null;
      if (marker === 0x01 || marker >= 0xd0 && marker <= 0xd8) continue;
      if (offset + 2 > bytes.length) return null;
      const size = view.getUint16(offset);
      if (size < 2 || offset + size > bytes.length) return null;
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return size < 8 ? null : { width: view.getUint16(offset + 5), height: view.getUint16(offset + 3) };
      }
      offset += size;
    }
    return null;
  }
  if (mime === 'image/webp') {
    if (bytes.length < 12) return null;
    const end = view.getUint32(4, true) + 8;
    if (end > bytes.length) return null;
    for (let offset = 12; offset + 8 <= end;) {
      const kind = text(offset, 4), size = view.getUint32(offset + 4, true), start = offset + 8;
      if (start + size > end) return null;
      if (kind === 'VP8X' && size >= 10) {
        const uint24 = (at: number) => bytes[at] | bytes[at + 1] << 8 | bytes[at + 2] << 16;
        return { width: uint24(start + 4) + 1, height: uint24(start + 7) + 1 };
      }
      if (kind === 'VP8 ' && size >= 10 && text(start + 3, 3) === '\x9d\x01\x2a') {
        return { width: view.getUint16(start + 6, true) & 0x3fff, height: view.getUint16(start + 8, true) & 0x3fff };
      }
      if (kind === 'VP8L' && size >= 5 && bytes[start] === 0x2f) {
        return { width: 1 + (bytes[start + 1] | (bytes[start + 2] & 0x3f) << 8),
          height: 1 + (bytes[start + 2] >> 6 | bytes[start + 3] << 2 | (bytes[start + 4] & 0xf) << 10) };
      }
      offset = start + size + (size & 1);
    }
  }
  return null;
}
