import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { cp, lstat, mkdir, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const plugin = join(root, 'dist/plugin');

test('portable plugin has its own manifest, manual skill and one browser resource', async () => {
  const manifest = JSON.parse(await readFile(join(plugin, '.claude-plugin/plugin.json'), 'utf8'));
  assert.equal(manifest.name, 'paperstream');
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
  assert.equal(typeof manifest.description, 'string');
  assert.equal(typeof manifest.author.name, 'string');
  assert.equal(manifest.license, 'MIT');
  assert.deepEqual(await readFile(join(plugin, 'LICENSE')), await readFile(join(root, '../LICENSE')));
  assert.equal(manifest.interface, undefined);
  const skill = await readFile(join(plugin, 'skills/open/SKILL.md'), 'utf8');
  assert.match(skill, /^---\nname: open\n/);
  assert.match(skill, /^disable-model-invocation: true$/m);
  assert.ok(skill.includes('"${CLAUDE_PLUGIN_ROOT}/scripts/paperstream.py"'));
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
  const html = await readFile(join(plugin, 'app/app.html'), 'utf8');
  assert.match(html, /^<!doctype html>/i);
  assert.ok(html.includes('<div id="root"></div>'));
  assert.ok(html.includes('<script>'));
  assert.doesNotMatch(html, /<script\s[^>]*\bsrc\s*=|<link\s[^>]*\brel\s*=\s*["']?stylesheet/i);
});

test('portable package excludes runtime dependencies, bytecode and symlinks', async () => {
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
});

test('relocated launcher creates and edits graphs from an unrelated working directory', async () => {
  const temporary = await mkdtemp(join(tmpdir(), 'paperstream plugin '));
  try {
    const copied = join(temporary, 'portable copy');
    const cwd = join(temporary, 'different working directory');
    await cp(plugin, copied, { recursive: true });
    await mkdir(cwd);
    const launcher = join(copied, 'scripts/paperstream.py');
    // A hostile PYTHONPATH must not replace the packaged implementation.
    const environment = { ...process.env, PYTHONPATH: join(temporary, 'missing source') };
    function run(...args) {
      const result = spawnSync('python3', [launcher, ...args], {
        cwd, env: environment, encoding: 'utf8', timeout: 10000,
      });
      assert.ifError(result.error);
      assert.equal(result.status, 0, result.stderr || result.stdout);
      return result.stdout;
    }
    const help = run('--help');
    assert.ok(help.includes('serve'));
    const file = join(cwd, 'graph with spaces.canvas');
    assert.equal(JSON.parse(run('init', file)).ok, true);
    const added = JSON.parse(run('add-node', file, '--alias', 'Fixture', '--takeaway', 'Initial'));
    assert.equal(added.ok, true);
    assert.ok(added.node.id);
    const id = added.node.id;
    const setup = spawnSync('python3', ['-c', [
      'import sys',
      'sys.dont_write_bytecode = True',
      'sys.path.insert(0, sys.argv[1])',
      'from paperstream import CanvasGraph',
      'graph = CanvasGraph.load(sys.argv[2])',
      'document = graph.to_dict()',
      'document["portableUnknown"] = {"kept": [1, {"nested": True}]}',
      'document["nodes"][0]["unrelated"] = "preserved"',
      'graph.set_document(document)',
      'graph.save()',
    ].join('\n'), copied, file], {
      cwd, env: environment, encoding: 'utf8', timeout: 10000,
    });
    assert.ifError(setup.error);
    assert.equal(setup.status, 0, setup.stderr);
    assert.equal(JSON.parse(run('update-node', file, id, '--takeaway', 'Changed through API')).ok, true);
    const shown = JSON.parse(run('show', file, '--raw'));
    assert.equal(shown.nodes.length, 1);
    assert.equal(shown.nodes[0].id, id);
    assert.equal(shown.nodes[0].takeaway, 'Changed through API');
    assert.deepEqual(shown.document.portableUnknown, { kept: [1, { nested: true }] });
    assert.equal(shown.document.nodes[0].unrelated, 'preserved');
    assert.equal(JSON.parse(run('validate', file)).valid, true);
    assert.equal((await readdir(join(copied, 'paperstream'))).includes('__pycache__'), false);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});
