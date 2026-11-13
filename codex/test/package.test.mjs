import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cp, lstat, mkdir, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const plugin = join(root, 'dist/plugin');

test('portable Codex package contains the shared agent skill and dependency-free document runtime', async () => {
  const manifest = JSON.parse(await readFile(join(plugin, '.codex-plugin/plugin.json'), 'utf8'));
  assert.equal(manifest.skills, './skills/');
  assert.deepEqual(await readFile(join(plugin, 'LICENSE')), await readFile(join(root, '../LICENSE')));
  for (const path of ['SKILL.md', 'references/api.md', 'agents/openai.yaml']) {
    assert.equal(await readFile(join(plugin, 'skills/paperstream', path), 'utf8'),
      await readFile(join(root, '../skills/paperstream', path), 'utf8'));
  }
  assert.equal(await readFile(join(plugin, 'THIRD_PARTY_NOTICES.md'), 'utf8'),
    await readFile(join(root, '../THIRD_PARTY_NOTICES.md'), 'utf8'));
  async function checkLicenses(directory, relative = '') {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(relative, entry.name);
      if (entry.isDirectory()) await checkLicenses(join(directory, entry.name), path);
      else assert.deepEqual(await readFile(join(plugin, 'licenses', path)), await readFile(join(directory, entry.name)));
    }
  }
  await checkLicenses(join(root, '../licenses'));
  async function inspect(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      assert.notEqual(entry.name, 'node_modules');
      assert.notEqual(entry.name, '__pycache__');
      assert.doesNotMatch(entry.name, /\.py[co]$/);
      const path = join(directory, entry.name);
      assert.equal((await lstat(path)).isSymbolicLink(), false, path);
      if (entry.isDirectory()) await inspect(path);
    }
  }
  await inspect(plugin);
  assert.match(await readFile(join(plugin, 'paperstream/__main__.py'), 'utf8'), /def main\(/);
});

test('the packaged skill launcher edits a relocated Canvas without source checkout or globally installed Python packages', async () => {
  const temporary = await mkdtemp(join(tmpdir(), 'paperstream codex plugin '));
  try {
    const copied = join(temporary, 'portable copy');
    const cwd = join(temporary, 'unrelated working directory');
    await cp(plugin, copied, { recursive: true });
    await mkdir(cwd);
    const launcher = join(copied, 'scripts/paperstream.py');
    const environment = { ...process.env, PYTHONPATH: join(temporary, 'missing source') };
    const run = (...args) => {
      const result = spawnSync('python3', [launcher, ...args], {
        cwd, env: environment, encoding: 'utf8', timeout: 10000,
      });
      assert.ifError(result.error);
      assert.equal(result.status, 0, result.stderr || result.stdout);
      return result.stdout;
    };
    assert.ok(run('--help').includes('update-node'));
    const serveEnvironment = { ...environment };
    delete serveEnvironment.PAPERSTREAM_APP_PATH;
    const nativeServe = spawnSync('python3', [launcher, 'serve', '/no-document.canvas'], {
      cwd, env: serveEnvironment, encoding: 'utf8', timeout: 10000,
    });
    assert.ifError(nativeServe.error);
    assert.equal(nativeServe.status, 1);
    assert.match(JSON.parse(nativeServe.stderr).message, /native host editor/);
    const explicitServe = spawnSync('python3', [launcher, 'serve', '/no-document.canvas'], {
      cwd, env: { ...environment, PAPERSTREAM_APP_PATH: join(cwd, 'missing-http-editor.html') },
      encoding: 'utf8', timeout: 10000,
    });
    assert.ifError(explicitServe.error);
    assert.equal(explicitServe.status, 1);
    assert.match(JSON.parse(explicitServe.stderr).message, /Browser editor not built/);
    const file = join(cwd, '论文 with spaces.canvas');
    assert.equal(JSON.parse(run('init', file)).ok, true);
    const first = JSON.parse(run('add-node', file, '--alias', 'Initial', '--takeaway', '')).node;
    const second = JSON.parse(run('add-node', file, '--alias', 'Follow-up', '--takeaway', '')).node;
    const edge = JSON.parse(run('add-edge', file, first.id, second.id, '--relation', '')).edge;
    // Unknown properties are introduced through the packaged CanvasGraph API.
    const setup = spawnSync('python3', ['-c', [
      'import sys',
      'sys.dont_write_bytecode = True',
      'sys.path.insert(0, sys.argv[1])',
      'from paperstream import CanvasGraph',
      'graph = CanvasGraph.load(sys.argv[2])',
      'document = graph.to_dict()',
      'document["future"] = {"kept": [True, None, {"nested": "value"}]}',
      'document["nodes"][1]["futureNode"] = "keep"',
      'graph.set_document(document)',
      'graph.save()',
    ].join('\n'), copied, file], { cwd, env: environment, encoding: 'utf8', timeout: 10000 });
    assert.ifError(setup.error);
    assert.equal(setup.status, 0, setup.stderr);
    const before = JSON.parse(run('show', file, '--raw'));
    run('update-node', file, first.id, '--takeaway', '- First\n- Second');
    run('update-edge', file, edge.id, '--relation', 'Builds on');
    const after = JSON.parse(run('show', file, '--raw'));
    assert.deepEqual(after.document.future, before.document.future);
    assert.deepEqual(after.document.nodes[1], before.document.nodes[1]);
    assert.deepEqual(after.nodes.map(row => row.id), [first.id, second.id]);
    assert.equal(after.nodes[0].takeaway, '- First\n- Second');
    assert.equal(after.edges[0].id, edge.id);
    assert.equal(after.edges[0].relation, 'Builds on');
    assert.equal(JSON.parse(run('validate', file)).valid, true);
    assert.equal((await readdir(join(copied, 'paperstream'))).includes('__pycache__'), false);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});
