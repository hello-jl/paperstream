#!/usr/bin/env node
/**
 * Original, editable principle diagrams for the history canvases. MIT License.
 * Usage: node scripts/build-history-diagrams.mjs [RENDERER_PACKAGE_JSON]
 * Requires @resvg/resvg-js only for PNG rendering; never modifies a Canvas.
 */
import { createHash } from 'node:crypto';
import { access, mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const destination = resolve(root, 'assets/history/principles');
const requireRenderer = createRequire(resolve(process.argv[2] || resolve(root, '.local/history-renderer/package.json')));
const { Resvg } = requireRenderer('@resvg/resvg-js');
const C = { paper: '#f5f7ee', white: '#ffffff', ink: '#2b4437', line: '#648b71', soft: '#e2ecdd', faint: '#b7cbb5', accent: '#bf8d55' };
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
const label = (s, x, y, size = 36, fill = C.ink, weight = 500, anchor = 'middle') =>
  `<text x="${x}" y="${y}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}">${escape(s)}</text>`;
const box = (x, y, w, h, text, { fill = C.white, size = 36, color = C.ink, stroke = C.faint } = {}) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="19" fill="${fill}" stroke="${stroke}" stroke-width="2.5"/>${label(text, x + w / 2, y + h / 2 + size * .35, size, color)}`;
const arrow = (path, { color = C.line, dashed = false } = {}) =>
  `<path d="${path}" fill="none" stroke="${color}" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"${dashed ? ' stroke-dasharray="9 8"' : ''} marker-end="url(#arrow)"/>`;
const note = text => label(text, 450, 462, 30, C.line, 400);
const illustration = (id, title, subtitle, body, description) => `<?xml version="1.0" encoding="UTF-8"?>
<!-- Original artwork by Paperstream contributors. SPDX-License-Identifier: MIT -->
<svg xmlns="http://www.w3.org/2000/svg" width="900" height="500" viewBox="0 0 900 500" role="img" aria-labelledby="${id}-title ${id}-desc">
<title id="${id}-title">${escape(title)}</title><desc id="${id}-desc">${escape(description)}</desc>
<metadata>Original illustration: Paperstream contributors. MIT License: https://opensource.org/license/mit</metadata>
<defs><marker id="arrow" viewBox="0 0 10 10" refX="8.6" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10Z" fill="${C.line}"/></marker></defs>
<rect width="900" height="500" rx="26" fill="${C.paper}"/>
<g font-family="Arial, Microsoft YaHei, sans-serif">
${label(title, 38, 55, 34, C.ink, 600, 'start')}
${label(subtitle, 38, 94, 22, C.line, 400, 'start')}
${body}
</g></svg>\n`;

const definitions = [
  {
    id: 'in-context', title: '上下文学习', subtitle: 'GPT-3 · In-context learning',
    sourceUrl: 'https://arxiv.org/abs/2005.14165', caption: '上下文学习示意',
    context: 'Original conceptual summary of Brown et al. (2020), Language Models are Few-Shot Learners. This depicts inference with few-shot examples, not gradient-based training.',
    description: '任务说明、示例与待补输入组成提示，经 GPT-3 得到答案；推理期间模型参数不更新。',
    body: `<rect x="38" y="140" width="312" height="237" rx="23" fill="${C.white}" stroke="${C.faint}" stroke-width="2.5"/>
      ${box(61, 160, 266, 52, '任务说明', { fill: C.soft, size: 36, stroke: 'none' })}
      ${box(61, 233, 266, 52, '示例：问 → 答', { fill: C.soft, size: 32, stroke: 'none' })}
      ${box(61, 306, 266, 52, '待补输入：…', { fill: C.soft, size: 32, stroke: 'none' })}
      ${arrow('M364 258H421')}
      ${box(438, 202, 167, 112, 'GPT-3', { fill: C.soft, size: 38, stroke: C.line })}
      ${arrow('M620 258H690')}
      ${box(708, 202, 151, 112, '答案', { size: 38 })}
      ${label('提示', 195, 412, 32, C.line)}${label('参数不更新', 522, 366, 32, C.line)}
      ${note('给示例 → 在上下文中完成新任务')}`,
  },
  {
    id: 'agent-loop', title: 'Agent 工作循环', subtitle: '任务、工具与环境反馈',
    sourceUrl: 'https://www.anthropic.com/research/building-effective-agents', caption: 'Agent 工作循环',
    context: 'Original generic agent-loop illustration informed by Anthropic, Building effective agents (2024). It is not a diagram of the internal architecture of Claude or any specific model.',
    description: '任务进入模型，模型调用工具，环境结果返回模型；模型可以继续循环或退出并完成任务。这是通用 Agent 工作循环，不是 Claude 内部架构。',
    body: `${box(40, 215, 130, 80, '任务', { size: 36 })}
      ${arrow('M184 255H243')}
      ${box(260, 215, 160, 80, '模型', { fill: C.soft, size: 38, stroke: C.line })}
      ${arrow('M437 255H511')}
      ${box(530, 215, 140, 80, '工具', { size: 36 })}
      ${arrow('M686 255H702')}
      ${box(720, 215, 140, 80, '环境', { size: 36 })}
      ${arrow('M340 201V185')}${box(280, 109, 120, 60, '完成', { size: 36 })}
      ${arrow('M790 312V369Q790 386 773 386H357Q340 386 340 369V311')}
      ${label('返回环境结果', 580, 369, 32, C.line)}
      ${note('通用工作循环 · 非 Claude 内部架构')}`,
  },
  {
    id: 'self-attention', title: '自注意力', subtitle: 'Single-head self-attention',
    sourceUrl: 'https://arxiv.org/abs/1706.03762', caption: '单头自注意力',
    context: 'Original simplified single-head scaled dot-product self-attention diagram after Vaswani et al. (2017), Attention Is All You Need. Linear projections are implied by the X-to-Q/K/V arrows; masks, multi-head concatenation and output projection are omitted.',
    description: '同一输入 X 分别投影为 Q、K、V。QK 转置除以根号 d 得到相似度，softmax 得到权重，再加权 V 得到输出 Y。省略掩码、多头拼接及输出投影。',
    body: `${box(41, 231, 100, 83, 'X', { size: 36, fill: C.soft, stroke: C.line })}
      <path d="M153 272H194M194 167V377" fill="none" stroke="${C.line}" stroke-width="4" stroke-linecap="round"/>
      ${arrow('M194 167H238')}${arrow('M194 272H238')}${arrow('M194 377H238')}
      ${box(256, 133, 85, 68, 'Q', { size: 40 })}${box(256, 238, 85, 68, 'K', { size: 40 })}${box(256, 343, 85, 68, 'V', { size: 40 })}
      ${arrow('M358 167H403V198H420')}${arrow('M358 272H403V235H420')}
      ${box(438, 176, 174, 88, 'QKᵀ / √d', { size: 34, fill: C.soft, stroke: C.line })}
      ${arrow('M627 220H658')}${box(676, 182, 180, 76, 'softmax', { size: 36 })}
      ${arrow('M766 274V318')}${label('权重', 817, 305, 30, C.line)}
      ${arrow('M358 377H631')}${box(649, 338, 192, 77, '加权 V → Y', { size: 32, fill: C.soft, stroke: C.line })}
      ${note('单头示意 · 省略掩码与输出投影')}`,
  },
  {
    id: 'residual', title: '残差连接', subtitle: 'Residual learning · identity shortcut',
    sourceUrl: 'https://arxiv.org/abs/1512.03385', caption: '残差连接示意',
    context: 'Original simplified identity residual block after He et al. (2015 preprint; CVPR 2016), Deep Residual Learning for Image Recognition. The merge is elementwise addition, not concatenation; normalization and the post-add activation are omitted.',
    description: '输入 x 分为两路：两层主路产生 F(x)，恒等支路直接传递 x，两路在单一加法节点相加，得到 y = F(x) + x。省略归一化与加法后的激活。',
    body: `${label('x', 62, 222, 38)}${arrow('M88 209H209')}
      <circle cx="153" cy="209" r="5" fill="${C.line}"/>
      ${box(227, 165, 192, 88, '层1 + ReLU', { size: 32 })}
      ${arrow('M436 209H470')}${box(488, 165, 163, 88, '层 2', { size: 36 })}
      ${arrow('M668 209H708')}
      <circle cx="742" cy="209" r="28" fill="${C.soft}" stroke="${C.line}" stroke-width="3"/>
      ${label('+', 742, 221, 38)}${arrow('M785 209H833')}${label('y', 861, 221, 38)}
      ${arrow('M153 215V346Q153 364 171 364H724Q742 364 742 346V252')}
      ${label('F(x)', 440, 305, 36, C.line)}${label('identity：x', 448, 405, 36, C.line)}
      ${note('y = F(x) + x · 简化示意')}`,
  },
  {
    id: 'diffusion-structure', title: '扩散式结构生成', subtitle: 'AlphaFold 3 · diffusion-based structure prediction',
    sourceUrl: 'https://www.nature.com/articles/s41586-024-07487-w', caption: '条件扩散去噪',
    context: 'Original high-level illustration of AlphaFold 3 (Abramson et al., Nature 2024). This is a schematic of conditional coordinate generation through denoising, not an atomic structure from the paper, an exact network architecture, or a simulation of physical folding dynamics.',
    description: '序列与分子信息作为条件，噪声原子坐标经逐步去噪形成复合物结构。右侧自绘形状不对应真实分子；这不是实际折叠动力学。',
    body: `${box(261, 118, 380, 62, '序列 / 分子信息', { fill: C.white, size: 36 })}${arrow('M450 194V222')}
      <g fill="${C.line}" opacity=".88">${[[91,247],[142,234],[199,271],[104,291],[159,303],[216,321],[130,342],[190,354],[79,327],[224,243],[170,264],[84,365]].map(([x,y],i)=>`<circle cx="${x}" cy="${y}" r="${i%3+6}"/>`).join('')}</g>
      ${arrow('M247 293H311')}${box(330, 240, 240, 108, '逐步去噪', { fill: C.soft, size: 38, stroke: C.line })}${arrow('M587 293H649')}
      <path d="M690 325C664 274 713 242 749 258S822 249 825 290S777 329 752 302S704 293 716 327S772 362 814 337" fill="none" stroke="${C.line}" stroke-width="12" stroke-linecap="round"/>
      <path d="M751 267L775 278L774 305L749 319L725 305L726 280Z" fill="none" stroke="${C.accent}" stroke-width="5" stroke-linejoin="round"/>
      <g fill="${C.accent}"><circle cx="751" cy="267" r="6"/><circle cx="775" cy="278" r="6"/><circle cx="774" cy="305" r="6"/><circle cx="749" cy="319" r="6"/><circle cx="725" cy="305" r="6"/><circle cx="726" cy="280" r="6"/></g>
      ${label('噪声原子坐标', 153, 403, 34)}${label('复合物结构', 753, 403, 34)}
      ${note('结构生成示意 · 非实际折叠动力学')}`,
  },
];

const fonts = [];
if (process.env.PAPERSTREAM_EXPORT_FONT) {
  await access(process.env.PAPERSTREAM_EXPORT_FONT);
  fonts.push(process.env.PAPERSTREAM_EXPORT_FONT);
} else {
  const macFont = '/System/Library/Fonts/STHeiti Medium.ttc';
  try { await access(macFont); fonts.push(macFont); } catch { /* Use installed fonts on other systems. */ }
}
await mkdir(destination, { recursive: true });
const manifest = { checked: '2026-11-14', diagrams: {} };
for (const diagram of definitions) {
  const svg = illustration(diagram.id, diagram.title, diagram.subtitle, diagram.body, diagram.description);
  const png = new Resvg(svg, { font: { loadSystemFonts: true, fontFiles: fonts, defaultFontFamily: 'sans-serif' } }).render().asPng();
  await writeFile(resolve(destination, `${diagram.id}.svg`), svg);
  await writeFile(resolve(destination, `${diagram.id}.png`), png);
  manifest.diagrams[diagram.id] = {
    file: `assets/history/principles/${diagram.id}.png`, sourceSvg: `assets/history/principles/${diagram.id}.svg`, width: 900, height: 500,
    sha256: createHash('sha256').update(png).digest('hex'), sourceSvgSha256: createHash('sha256').update(svg).digest('hex'),
    caption: diagram.caption, author: 'Paperstream contributors', license: 'MIT', licenseUrl: 'https://opensource.org/license/mit',
    sourceUrl: diagram.sourceUrl, context: diagram.context,
    changes: 'Newly drawn, simplified conceptual illustration in editable SVG; no source figures copied. PNG rendered from the SVG without cropping.',
  };
}
await writeFile(resolve(destination, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({ ok: true, directory: destination, count: definitions.length, dimensions: [900, 500], ids: definitions.map(d => d.id) }));
