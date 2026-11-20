import { build } from 'esbuild';
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
  esbuildBuild: build,
});
await writeFile(join(out, 'app.html'), html);
await build({
  entryPoints: [join(root, 'src/server.ts')], outfile: join(out, 'server.mjs'),
  bundle: true, platform: 'node', format: 'esm', target: 'node22', minify: false,
  banner: { js: 'import { createRequire } from "node:module"; const require = createRequire(import.meta.url);' },
});
// The editor needs only Node. Agent document commands additionally use the
// bundled standard-library Python runtime, without a global installation.
const plugin = join(out, 'plugin');
await rm(plugin, { recursive: true, force: true });
await mkdir(join(plugin, '.codex-plugin'), { recursive: true });
await mkdir(join(plugin, 'dist'), { recursive: true });
await mkdir(join(plugin, 'scripts'), { recursive: true });
for (const name of ['server.mjs', 'app.html']) await copyFile(join(out, name), join(plugin, 'dist', name));
await copyFile(join(root, '.mcp.json'), join(plugin, '.mcp.json'));
await copyFile(join(root, '.codex-plugin/plugin.json'), join(plugin, '.codex-plugin/plugin.json'));
await copyFile(join(root, 'README.md'), join(plugin, 'README.md'));
await copyFile(join(root, 'scripts/paperstream.py'), join(plugin, 'scripts/paperstream.py'));
await cp(join(repository, 'skills/paperstream'), join(plugin, 'skills/paperstream'), { recursive: true });
await cp(join(repository, 'paperstream'), join(plugin, 'paperstream'), {
  recursive: true,
  filter: path => basename(path) !== '__pycache__' && !/\.py[co]$/.test(path),
});
await copyDistributionNotices(repository, plugin);
const manifest = JSON.parse(await readFile(join(root, '.codex-plugin/plugin.json'), 'utf8'));
console.log(`Built ${manifest.name} ${manifest.version}: ${plugin}`);
