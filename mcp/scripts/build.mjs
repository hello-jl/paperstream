import { createRequire } from 'node:module';
import { cp, mkdir, rm, writeFile, copyFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundleSingleHtml } from '../../web/scripts/bundle-single-html.mjs';
import { copyDistributionNotices } from '../../web/scripts/distribution-notices.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const repository = dirname(root), out = join(root, 'dist');
const requireWeb = createRequire(join(repository, 'web/package.json'));
const { build } = requireWeb('esbuild');
await mkdir(out, { recursive: true });
const app = await bundleSingleHtml({
  repository,
  entryPoint: join(root, 'src/app.tsx'),
  outfile: join(out, 'app.js'),
  metafile: true,
  esbuildBuild: build,
});
await writeFile(join(out, 'app.html'), app.html);
const server = await build({
  entryPoints: [join(root, 'src/server.ts')], outfile: join(out, 'server.mjs'),
  bundle: true, platform: 'node', format: 'esm', target: 'node22',
  metafile: true,
  banner: { js: 'import { createRequire } from "node:module"; const require = createRequire(import.meta.url);' },
});
await writeFile(join(out, 'bundle-inputs.json'), JSON.stringify({ ui: app.metafile, server: server.metafile }, null, 2));
const pack = join(out, 'package');
await rm(pack, { recursive: true, force: true });
await mkdir(join(pack, 'dist'), { recursive: true });
for (const name of ['server.mjs', 'app.html']) await copyFile(join(out, name), join(pack, 'dist', name));
await cp(join(repository, 'paperstream'), join(pack, 'paperstream'), {
  recursive: true, filter: path => basename(path) !== '__pycache__' && !/\.py[co]$/.test(path),
});
await copyDistributionNotices(repository, pack);
await copyFile(join(root, 'README.md'), join(pack, 'README.md'));
console.log(`Built standard Paperstream MCP Apps package: ${pack}`);
