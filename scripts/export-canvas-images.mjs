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

// resvg 2.x does not handle SVG 2's auto-start-reverse orientation. Adapt only
// this exporter's markers for rasterization; the saved SVG keeps its originals.
function svgForRasterizer(svg) {
  const startIds = new Map();
  const withMarkers = svg.replace(/<marker\b([^>]*)>([\s\S]*?)<\/marker>/g, (marker, attributes, contents) => {
    const id = attributes.match(/\bid="(arrow-\d+)"/)?.[1];
    const refX = Number(attributes.match(/\brefX="([^"]+)"/)?.[1]);
    const refY = Number(attributes.match(/\brefY="([^"]+)"/)?.[1]);
    if (!id || !attributes.includes('orient="auto-start-reverse"')
      || !Number.isFinite(refX) || !Number.isFinite(refY)
      || !/^<(?:path|circle)\b[^>]*\/>$/.test(contents)) return marker;
    const endAttributes = attributes.replace('orient="auto-start-reverse"', 'orient="auto"');
    const startId = `${id}-raster-start`;
    startIds.set(id, startId);
    const startAttributes = endAttributes.replace(/\bid="[^"]+"/, `id="${startId}"`)
      .replace(/\s+overflow="[^"]*"/g, '') + ' overflow="visible"';
    // Rotate about the attachment point. The reversed shape may extend outside
    // its original viewBox, so its marker must not clip the arrowhead.
    return `<marker${endAttributes}>${contents}</marker>`
      + `<marker${startAttributes}><g transform="rotate(180 ${refX} ${refY})">${contents}</g></marker>`;
  });
  return withMarkers.replace(/\bmarker-start="url\(#([^)]+)\)"/g, (reference, id) =>
    startIds.has(id) ? `marker-start="url(#${startIds.get(id)})"` : reference);
}

const [input, output, rendererPackage] = process.argv.slice(2);
if (!input || !output || !input.endsWith('.canvas') || /\.(canvas|mmd)$/i.test(output)) {
  throw new Error('Usage: node --experimental-strip-types scripts/export-canvas-images.mjs INPUT.canvas OUTPUT_BASE [RENDERER_PACKAGE_JSON]');
}
const styleEnv = process.env.PAPERSTREAM_EXPORT_STYLE;
const connectionStyle = styleEnv === 'orthogonal' || styleEnv === 'rounded' || styleEnv === 'curved' ? styleEnv : 'rounded';
const paddingEnv = Number(process.env.PAPERSTREAM_EXPORT_PADDING);
const padding = process.env.PAPERSTREAM_EXPORT_PADDING !== undefined && Number.isFinite(paddingEnv)
  ? paddingEnv : (connectionStyle === 'curved' ? 36 : 40);
const document = parseCanvas(await readFile(input, 'utf8'));
const svg = exportGraphSvg(document, { connectionStyle, padding });
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
  const image = new Resvg(svgForRasterizer(svg), {
    fitTo: { mode: 'width', value: 3000 },
    font: { loadSystemFonts: true, fontFiles: fonts, defaultFontFamily: 'sans-serif' },
  }).render();
  await writeFile(`${output}.png`, image.asPng());
  console.log(`${output}.png (${image.width} × ${image.height})`);
}
