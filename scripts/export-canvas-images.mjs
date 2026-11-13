#!/usr/bin/env node
/**
 * Export a saved Canvas with Paperstream's own renderer; never changes the graph.
 * node --experimental-strip-types scripts/export-canvas-images.mjs INPUT.canvas OUTPUT_BASE [RENDERER_PACKAGE_JSON]
 * SVG needs no extra dependency. For PNG, pass the package.json of a local
 * installation containing @resvg/resvg-js; the renderer is not bundled.
 * Optional PAPERSTREAM_EXPORT_FONT points to an installed CJK font file.
 */
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { parseCanvas } from '../web/src/canvas.ts';
import { exportGraphSvg } from '../web/src/graph-export.ts';

const [input, output, rendererPackage] = process.argv.slice(2);
if (!input || !output || !input.endsWith('.canvas') || /\.(canvas|mmd)$/i.test(output)) {
  throw new Error('Usage: node --experimental-strip-types scripts/export-canvas-images.mjs INPUT.canvas OUTPUT_BASE [RENDERER_PACKAGE_JSON]');
}
const document = parseCanvas(await readFile(input, 'utf8'));
const svg = exportGraphSvg(document, { connectionStyle: 'rounded', padding: 40 });
await mkdir(dirname(resolve(output)), { recursive: true });
await writeFile(`${output}.svg`, svg);
console.log(`${output}.svg`);
if (rendererPackage) {
  const width = Number(svg.match(/<svg\b[^>]*\bwidth="(\d+)"/)?.[1]);
  const height = Number(svg.match(/<svg\b[^>]*\bheight="(\d+)"/)?.[1]);
  const targetHeight = Math.ceil(3000 * height / width);
  if (!Number.isSafeInteger(targetHeight) || targetHeight < 1 || 3000 * targetHeight > 32_000_000) {
    throw new Error('Export exceeds the 32 MP artifact budget.');
  }
  const requireRenderer = createRequire(resolve(rendererPackage));
  const { Resvg } = requireRenderer('@resvg/resvg-js');
  const fonts = [];
  const preferred = process.env.PAPERSTREAM_EXPORT_FONT;
  if (preferred) { await access(preferred); fonts.push(preferred); }
  else {
    const macFont = '/System/Library/Fonts/STHeiti Medium.ttc';
    try { await access(macFont); fonts.push(macFont); } catch { /* Use system fonts. */ }
  }
  const image = new Resvg(svg, {
    fitTo: { mode: 'width', value: 3000 },
    font: { loadSystemFonts: true, fontFiles: fonts, defaultFontFamily: 'sans-serif' },
  }).render();
  await writeFile(`${output}.png`, image.asPng());
  console.log(`${output}.png (${image.width} × ${image.height})`);
}
