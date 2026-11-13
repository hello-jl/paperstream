import assert from 'node:assert/strict';
import { once } from 'node:events';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

test('portable ZIP extracts, serves and safely updates its explicit file outside the repository', { timeout: 15000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'paperstream preview '));
  let child;
  try {
    const manifest = JSON.parse(await readFile(new URL('../.claude-plugin/plugin.json', import.meta.url), 'utf8'));
    const archive = fileURLToPath(new URL(`../dist/paperstream-claude-${manifest.version}.zip`, import.meta.url));
    const extracted = spawnSync('python3', ['-c', [
      'from pathlib import Path, PurePosixPath',
      'import sys, zipfile',
      'with zipfile.ZipFile(sys.argv[1]) as source:',
      '    assert source.testzip() is None, "Archive checksum failed"',
      '    for entry in source.infolist():',
      '        path = PurePosixPath(entry.filename)',
      '        assert not path.is_absolute() and ".." not in path.parts, "Unsafe archive path"',
      '        assert path.parts[0] == "paperstream", "Unexpected archive root"',
      '        assert "node_modules" not in path.parts and "__pycache__" not in path.parts',
      '        assert not entry.filename.endswith((".pyc", ".pyo"))',
      '        assert (entry.external_attr >> 16) & 0o170000 != 0o120000, "Archive contains a symlink"',
      '    source.extractall(Path(sys.argv[2]))',
    ].join('\n'), archive, directory], { encoding: 'utf8', timeout: 10000 });
    assert.ifError(extracted.error);
    assert.equal(extracted.status, 0, extracted.stderr);
    const plugin = join(directory, 'paperstream');
    const launcher = join(plugin, 'scripts/paperstream.py'), canvas = join(directory, '论文 with spaces.canvas');
    const run = args => {
      const result = spawnSync('python3', [launcher, ...args], { cwd: directory, encoding: 'utf8' });
      assert.equal(result.status, 0, result.stderr);
      return JSON.parse(result.stdout);
    };
    run(['init', canvas]);
    const paper = run(['add-node', canvas, '--alias', 'Original', '--takeaway', 'Preserved note']);
    child = spawn('python3', [launcher, 'serve', canvas, '--port', '0'], { cwd: directory, stdio: ['ignore', 'pipe', 'pipe'] });
    const info = await new Promise((resolve, reject) => {
      let output = '', errors = '';
      const timer = setTimeout(() => reject(new Error('Preview did not become ready')), 7000);
      child.stderr.setEncoding('utf8'); child.stderr.on('data', data => { errors += data; });
      child.once('error', error => { clearTimeout(timer); reject(error); });
      child.once('exit', code => { clearTimeout(timer); reject(new Error(`Preview exited ${code}: ${errors}`)); });
      child.stdout.setEncoding('utf8');
      child.stdout.on('data', data => {
        output += data;
        try { const value = JSON.parse(output); clearTimeout(timer); resolve(value); } catch { /* Wait for complete startup JSON. */ }
      });
    });
    const url = new URL(info.url), token = new URLSearchParams(url.hash.slice(1)).get('token');
    assert.ok(token);
    const headers = { Authorization: `Bearer ${token}` };
    const page = await fetch(url.origin);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /Paperstream/);
    const result = await (await fetch(`${url.origin}/api/canvas`, { headers })).json();
    assert.equal(result.name, '论文 with spaces.canvas');
    assert.ok(result.writable);
    const changed = JSON.parse(result.text);
    changed.nodes[0].text = changed.nodes[0].text.replace('Original', 'Saved from browser bridge');
    changed.future = { keep: [null, true, 'unknown'] };
    const save = await fetch(`${url.origin}/api/canvas`, { method: 'PUT', headers: { ...headers,
      Origin: url.origin, 'Content-Type': 'application/json', 'If-Match': result.etag }, body: JSON.stringify(changed) });
    assert.equal(save.status, 200);
    assert.equal(run(['show', canvas]).nodes[0].alias, 'Saved from browser bridge');
    assert.equal(run(['show', canvas]).nodes[0].id, paper.node.id);
    assert.deepEqual(JSON.parse(await readFile(canvas, 'utf8')).future, changed.future);
    run(['update-node', canvas, paper.node.id, '--takeaway', 'External edit']);
    const conflict = await fetch(`${url.origin}/api/canvas`, { method: 'PUT', headers: { ...headers,
      Origin: url.origin, 'Content-Type': 'application/json', 'If-Match': result.etag }, body: result.text });
    assert.equal(conflict.status, 409);
    assert.equal(run(['show', canvas]).nodes[0].takeaway, 'External edit');
  } finally {
    if (child && child.exitCode === null) { const finished = once(child, 'exit'); child.kill('SIGINT'); await finished; }
    await rm(directory, { recursive: true, force: true });
  }
});

test('preview CLI rejects invalid ports and reports an absent bundle without changing a file', async () => {
  const launcher = fileURLToPath(new URL('../dist/plugin/scripts/paperstream.py', import.meta.url));
  const missing = spawnSync('python3', [launcher, 'serve', '/no-document.canvas', '--port', '70000'], { encoding: 'utf8' });
  assert.equal(missing.status, 2);
  assert.equal(JSON.parse(missing.stderr).error, 'UsageError');
  const bundle = spawnSync('python3', [launcher, 'serve', '/no-document.canvas'], { encoding: 'utf8', env: {
    ...process.env, PAPERSTREAM_APP_PATH: '/no-such-paperstream-bundle.html',
  } });
  assert.equal(bundle.status, 1);
  assert.match(JSON.parse(bundle.stderr).message, /not built/);
});
