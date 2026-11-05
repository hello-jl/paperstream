import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { parseCanvas, patchEdge, patchNode, readPaper, serializeCanvas, updatePaper } from '../src/canvas.ts';

const [path, phase] = process.argv.slice(2);
if (!path || !['edit', 'verify'].includes(phase)) throw new Error('Use check_python_roundtrip.py to run the fixture.');
let document = parseCanvas(await readFile(path, 'utf8'));
if (phase === 'edit') {
  document = updatePaper(document, 'first', { alias: '方法 A 修订', takeaway: '第一行\n第二行', year: null });
  document = patchNode(document, 'first', { x: -120, y: 250 });
  document = patchEdge(document, 'connection', { label: '改进后关系' });
  await writeFile(path, serializeCanvas(document));
} else {
  assert.equal(readPaper(document.nodes[1]).takeaway, '由 Python 再次更新');
  assert.deepEqual(document.custom, { keep: [1, '中文', null] });
  assert.equal(document.nodes.length, 3);
}
