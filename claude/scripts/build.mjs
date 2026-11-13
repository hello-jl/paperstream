import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { cp, mkdir, readFile, rm, writeFile, copyFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const repository = dirname(root);
const requireWeb = createRequire(join(repository, 'web/package.json'));
let build;
try {
  ({ build } = requireWeb('esbuild'));
} catch {
  throw new Error('The existing web dependencies are required. Run npm ci --prefix web before building; this build never installs packages.');
}

const out = join(root, 'dist');
await mkdir(out, { recursive: true });
const app = await build({
  entryPoints: [join(root, 'src/app.tsx')], outfile: join(out, 'app.js'),
  bundle: true, write: false, minify: true, platform: 'browser', format: 'iife',
  target: 'es2022', jsx: 'automatic',
  nodePaths: [join(repository, 'web/node_modules')],
  alias: {
    react: join(repository, 'web/node_modules/react'),
    'react-dom': join(repository, 'web/node_modules/react-dom'),
  },
  define: { 'process.env.NODE_ENV': '"production"' },
});
const js = app.outputFiles.find(file => file.path.endsWith('.js'))?.text;
const css = app.outputFiles.find(file => file.path.endsWith('.css'))?.text ?? '';
if (!js || app.outputFiles.some(file => !/\.(js|css)$/.test(file.path))) {
  throw new Error('Expected a self-contained JS and CSS bundle.');
}
const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Paperstream</title><style>${css.replace(/<\/style/gi, '<\\/style')}</style></head><body><div id="root"></div><script>${js.replace(/<\/script/gi, '<\\/script')}</script></body></html>`;
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
await copyFile(join(repository, 'THIRD_PARTY_NOTICES.md'), join(plugin, 'THIRD_PARTY_NOTICES.md'));
await cp(join(repository, 'licenses'), join(plugin, 'licenses'), { recursive: true });
try {
  await copyFile(join(repository, 'LICENSE'), join(plugin, 'LICENSE'));
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
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
