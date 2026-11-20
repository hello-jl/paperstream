import { spawnSync } from 'node:child_process';
import { cp, mkdir, readFile, rm, writeFile, copyFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundleSingleHtml } from '../../web/scripts/bundle-single-html.mjs';
import { copyDistributionNotices } from '../../web/scripts/distribution-notices.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const repository = dirname(root);
const out = join(root, 'dist');
await mkdir(out, { recursive: true });

const { html } = await bundleSingleHtml({
  repository,
  entryPoint: join(root, 'src/app.tsx'),
  outfile: join(out, 'app.js'),
});
await writeFile(join(out, 'app.html'), html);

// Rebuild this generated directory so removed source modules cannot survive an
// upgrade. The portable package contains no npm dependencies or Python caches.
const plugin = join(out, 'plugin');
await rm(plugin, { recursive: true, force: true });
for (const directory of ['.claude-plugin', 'scripts', 'app']) {
  await mkdir(join(plugin, directory), { recursive: true });
}
await copyFile(join(root, '.claude-plugin/plugin.json'), join(plugin, '.claude-plugin/plugin.json'));
await copyFile(join(root, 'scripts/paperstream.py'), join(plugin, 'scripts/paperstream.py'));
await copyFile(join(out, 'app.html'), join(plugin, 'app/app.html'));
await cp(join(root, 'skills'), join(plugin, 'skills'), { recursive: true });
await cp(join(repository, 'skills/paperstream'), join(plugin, 'skills/paperstream'), { recursive: true });
await cp(join(repository, 'paperstream'), join(plugin, 'paperstream'), {
  recursive: true,
  filter: path => basename(path) !== '__pycache__' && !/\.py[co]$/.test(path),
});
await copyDistributionNotices(repository, plugin);
try {
  await copyFile(join(root, 'README.md'), join(plugin, 'README.md'));
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
const manifest = JSON.parse(await readFile(join(plugin, '.claude-plugin/plugin.json'), 'utf8'));
const archive = join(out, `paperstream-claude-${manifest.version}.zip`);
const zipped = spawnSync('python3', ['-c', [
  'from pathlib import Path',
  'import sys, zipfile',
  'source, target = Path(sys.argv[1]), Path(sys.argv[2])',
  'with zipfile.ZipFile(target, "w", compression=zipfile.ZIP_DEFLATED) as output:',
  '    for path in sorted(source.rglob("*")):',
  '        if path.is_file(): output.write(path, Path("paperstream") / path.relative_to(source))',
].join('\n'), plugin, archive], { encoding: 'utf8' });
if (zipped.error || zipped.status !== 0) throw new Error(`Unable to package plugin: ${zipped.error?.message ?? zipped.stderr}`);
console.log(`Built ${manifest.name} ${manifest.version}: ${plugin}`);
console.log(`Portable archive: ${archive}`);
