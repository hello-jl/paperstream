#!/usr/bin/env node
/** Read a saved history Canvas through the CLI and make a compact share poster.
 * node --experimental-strip-types scripts/export-history-poster.mjs INPUT.canvas OUTPUT_BASE [RENDERER_PACKAGE_JSON]
 * This is an alternate static composition, not an editor layout or Canvas write.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { figureLayout } from '../web/src/figure-layout.ts';
import { wrapExportText } from '../web/src/graph-export.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const [input, output, rendererPackage] = process.argv.slice(2);
if (!input?.endsWith('.canvas') || !output || /\.(?:canvas|mmd)$/i.test(output)) {
  throw new Error('Usage: export-history-poster.mjs INPUT.canvas OUTPUT_BASE [RENDERER_PACKAGE_JSON]');
}
const source = resolve(input), sourceBytes = await readFile(source);
const result = spawnSync('python3', ['-m', 'paperstream', 'show', source, '--raw'], {
  cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024,
});
if (result.error || result.status !== 0) throw new Error(result.error?.message ?? result.stderr);
const response = JSON.parse(result.stdout);
if (response.ok !== true || !response.document) throw new Error('Canvas API did not return a full document.');
const doc = response.document;
const paperRows = new Map(response.nodes.map(paper => [paper.id, paper]));
const rows = doc.nodes.filter(node => paperRows.has(node.id)).map(node => ({ node, paper: paperRows.get(node.id) }));
if (rows.length !== 16) throw new Error('This 4×4 poster expects the 16-milestone computing/AI history.');
const title = doc.nodes.find(node => node.id === 'history_title');
const credits = doc.nodes.find(node => node.id === 'history_scope_and_credits');
if (!title || !credits) throw new Error('The history title and source/credit note are required.');
const xml = value => String(value).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ud800-\udfff\ufffe\uffff]/gu, '\ufffd')
  .replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
const W = 2560, H = 1820, margin = 80, gap = 44;
const cw = (W - margin * 2 - gap * 3) / 4, ch = 238, rowStep = 330, top = 300;
const ink = '#293f34', muted = '#687c70', background = '#f4f7f1';
const accents = ['#43856a', '#448995', '#8977a4', '#b07a48'];
const labels = ['电子计算与早期智能', '规则、搜索与学习', '深度模型的突破', '语言、科学与 Agent'];
const blocks = [], clips = [], geometry = [];
const text = (value, x, y, width, size, lineHeight, { fill = muted, weight = 400, anchor = 'start' } = {}) => {
  const lines = wrapExportText(value, width, size);
  const xText = anchor === 'middle' ? x + width / 2 : anchor === 'end' ? x + width : x;
  return { lines, height: lines.length * lineHeight,
    svg: `<text x="${xText}" y="${y + size}" fill="${fill}" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}" xml:space="preserve">${lines.map((line, i) => `<tspan x="${xText}" dy="${i ? lineHeight : 0}">${xml(line)}</tspan>`).join('')}</text>` };
};
for (let row = 0; row < 4; row++) {
  const y = top + row * rowStep, color = accents[row];
  const first = rows[row * 4].paper.year, last = rows[row * 4 + 3].paper.year;
  blocks.push(`<circle cx="${margin + 5}" cy="${y - 22}" r="5" fill="${color}"/>`);
  blocks.push(text(`${String(row + 1).padStart(2, '0')}  /  ${labels[row]}`, margin + 22, y - 40, 900, 19, 24, { fill: color, weight: 600 }).svg);
  blocks.push(text(`${first} — ${last}`, W - margin - 250, y - 40, 250, 18, 24, { anchor: 'end' }).svg);
  for (let col = 0; col < 4; col++) {
    const index = row * 4 + col, { node, paper } = rows[index], x = margin + col * (cw + gap);
    const figure = node.paperstreamCard?.figures?.[0];
    if (!figure?.src || !/^data:image\/(?:jpeg|png|webp);base64,/.test(figure.src)) throw new Error(`Missing portable illustration: ${node.id}`);
    const diagram = String(figure.id ?? '').startsWith('diagram_');
    // Diagrams retain their native landscape aspect and all source pixels.
    // Only portraits use the existing per-person 3:4 crop and left-hand slot.
    const crop = figureLayout(diagram ? { ...figure, frame: undefined } : figure, diagram ? 220 : 112);
    const photo = { x: x + 24, y: y + (diagram ? 82 : 24), width: crop.width, height: crop.height };
    if (diagram && crop.height > 128) throw new Error(`Diagram needs a landscape image to fit this poster: ${node.id}`);
    if (!diagram && Math.abs(crop.height - 112 / .75) > 1e-6) throw new Error(`The saved portrait must use a 3:4 frame: ${node.id}`);
    const headingX = x + (diagram ? 24 : 158), headingY = y + (diagram ? 22 : 28);
    const headingWidth = cw - (diagram ? 48 : 184);
    const heading = text(paper.alias, headingX, headingY, headingWidth, 24, 34, { fill: ink, weight: 600 });
    if (diagram && headingY + heading.height > photo.y - 12) throw new Error(`Diagram heading does not fit: ${node.id}`);
    const tx = x + (diagram ? 270 : 158), tw = cw - (diagram ? 294 : 184);
    const bodyY = diagram ? photo.y : headingY + heading.height + 14;
    const body = text(paper.takeaway, tx, bodyY, tw, 18, diagram ? 26 : 28);
    if (bodyY + body.height > y + ch - 43) throw new Error(`Summary does not fit: ${node.id}`);
    const captionY = photo.y + photo.height + (diagram ? 5 : 10);
    const caption = text(figure.caption, photo.x - (diagram ? 6 : 12), captionY,
      photo.width + (diagram ? 12 : 24), diagram ? 12 : 14, diagram ? 16 : 19, { anchor: 'middle' });
    if (captionY + caption.height > y + ch - (diagram ? 9 : 14)) throw new Error(`Caption does not fit: ${node.id}`);
    const cropId = `illustration-${index}`;
    clips.push(`<clipPath id="${cropId}" clipPathUnits="userSpaceOnUse"><rect x="${photo.x}" y="${photo.y}" width="${photo.width}" height="${photo.height}" rx="${diagram ? 0 : 10}"/></clipPath>`);
    const link = /^https?:\/\//i.test(paper.url ?? '') ? paper.url : null;
    blocks.push(`${link ? `<a href="${xml(link)}" target="_blank" rel="noopener noreferrer">` : ''}<g data-node-id="${xml(node.id)}" data-figure-kind="${diagram ? 'diagram' : 'portrait'}">`
      + `<rect x="${x}" y="${y}" width="${cw}" height="${ch}" rx="24" fill="#fff" stroke="${color}" stroke-opacity=".48" stroke-width="1.5"/>`
      + `<rect x="${photo.x}" y="${photo.y}" width="${photo.width}" height="${photo.height}" rx="${diagram ? 0 : 10}" fill="${diagram ? '#fff' : '#eef3ed'}"/>`
      + `<image x="${photo.x + crop.image.x}" y="${photo.y + crop.image.y}" width="${crop.image.width}" height="${crop.image.height}" preserveAspectRatio="none" clip-path="url(#${cropId})" href="${xml(figure.src)}"/>`
      + caption.svg + heading.svg + body.svg
      + text(String(paper.year ?? ''), x + cw - 104, y + ch - 43, 80, 22, 26, { fill: color, weight: 600, anchor: 'end' }).svg
      + `</g>${link ? '</a>' : ''}`);
    geometry.push({ id: node.id, kind: diagram ? 'diagram' : 'portrait', x, y, width: cw, height: ch, photo,
      heading: { x: headingX, y: headingY, width: headingWidth, height: heading.height },
      body: { x: tx, y: bodyY, width: tw, height: body.height } });
    if (col < 3) {
      const edge = doc.edges.find(edge => edge.fromNode === node.id && edge.toNode === rows[index + 1].node.id);
      if (edge) {
        if (edge.label) throw new Error(`A labeled relation needs a different poster route: ${edge.id}`);
        const sx = x + cw + 6, ex = x + cw + gap - 8, ey = y + ch / 2;
        blocks.push(`<g data-edge-id="${xml(edge.id)}" fill="none" stroke="${color}" stroke-opacity=".6" stroke-width="1.5" stroke-linecap="round"><path d="M${sx} ${ey}H${ex}"/><path d="M${ex - 5} ${ey - 4}l5 4-5 4"/></g>`);
      }
    }
  }
}
const footerY = top + 3 * rowStep + ch + 47;
const footer = text(credits.text, margin, footerY + 30, W - margin * 2, 15, 24);
if (footerY + 30 + footer.height > H - 34) throw new Error('Source credits exceed the poster bounds.');
const years = rows.map(({ paper }) => paper.year).filter(Number.isFinite);
const svg = `<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="poster-title poster-desc">
<title id="poster-title">${xml(title.label)} · 紧凑海报版</title><desc id="poster-desc">16 个时间里程碑，混用人物肖像与原理示意图，按行从左至右阅读。肖像取景、原理图完整比例与事实文字保留；连线表示时间顺序，不表示直接技术继承。完整来源与插图许可见 computing-ai-history-sources.md。</desc><defs>${clips.join('')}</defs>
<rect width="${W}" height="${H}" rx="32" fill="${background}"/>
<g font-family="Arial, Microsoft YaHei, sans-serif">
<path d="M82 58h20q16 0 16 16v13q0 16 16 16h20M82 75h9q10 0 10 10v12q0 18 18 18h35" fill="none" stroke="#6c8e78" stroke-width="5" stroke-linecap="round"/>
${text('Paperstream', 174, 58, 650, 36, 42, { fill: ink, weight: 600 }).svg}
${text(`AI HISTORY  /  ${Math.min(...years)}—${Math.max(...years)}`, W - margin - 650, 70, 650, 20, 26, { anchor: 'end' }).svg}
${text('从电子计算，到人工智能', margin, 135, 2200, 54, 64, { fill: ink, weight: 600 }).svg}
${text('16 个里程碑，以人物与原理串起。按行从左至右阅读；连线表示时间顺序。', margin, 213, 2200, 22, 30).svg}
<path d="M${margin} 250H${W - margin}" stroke="#dce6dc"/>
${blocks.join('\n')}
<path d="M${margin} ${footerY - 8}H${W - margin}" stroke="#dce6dc"/>
${text(credits.label, margin, footerY, 1200, 18, 24, { fill: ink, weight: 600 }).svg}
${footer.svg}</g></svg>`;
await mkdir(dirname(resolve(output)), { recursive: true });
await writeFile(`${output}.svg`, svg);
if (rendererPackage) {
  const requireRenderer = createRequire(resolve(rendererPackage));
  const { Resvg } = requireRenderer('@resvg/resvg-js');
  const fonts = [];
  if (process.env.PAPERSTREAM_EXPORT_FONT) {
    await access(process.env.PAPERSTREAM_EXPORT_FONT);
    fonts.push(process.env.PAPERSTREAM_EXPORT_FONT);
  } else {
    const macFont = '/System/Library/Fonts/STHeiti Medium.ttc';
    try { await access(macFont); fonts.push(macFont); } catch { /* Other systems use installed fonts. */ }
  }
  const image = new Resvg(svg, { fitTo: { mode: 'width', value: 3200 },
    font: { loadSystemFonts: true, fontFiles: fonts, defaultFontFamily: 'sans-serif' } }).render();
  await writeFile(`${output}.png`, image.asPng());
}
if (!(await readFile(source)).equals(sourceBytes)) throw new Error('The source changed during export; regenerate from the latest saved version.');
console.log(JSON.stringify({ ok: true, source: input, sourceSha256: createHash('sha256').update(sourceBytes).digest('hex'),
  svg: `${output}.svg`, png: rendererPackage ? `${output}.png` : null,
  cards: rows.length, portraits: geometry.filter(item => item.kind === 'portrait').length,
  diagrams: geometry.filter(item => item.kind === 'diagram').length, canvas: [W, H], ids: rows.map(row => row.node.id) }));
