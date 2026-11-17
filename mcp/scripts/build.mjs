import { createRequire } from 'node:module';
import { cp, mkdir, readFile, rm, writeFile, copyFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const repository = dirname(root), out = join(root, 'dist');
const requireWeb = createRequire(join(repository, 'web/package.json'));
const { build } = requireWeb('esbuild');
await mkdir(out, { recursive: true });
const app = await build({
  entryPoints: [join(root, 'src/app.tsx')], outfile: join(out, 'app.js'),
  bundle: true, write: false, minify: true, platform: 'browser', format: 'iife',
  metafile: true,
  target: 'es2022', jsx: 'automatic',
  nodePaths: [join(repository, 'web/node_modules')],
  alias: { react: join(repository, 'web/node_modules/react'), 'react-dom': join(repository, 'web/node_modules/react-dom') },
  define: { 'process.env.NODE_ENV': '"production"' },
});
const js = app.outputFiles.find(file => file.path.endsWith('.js'))?.text;
const css = app.outputFiles.find(file => file.path.endsWith('.css'))?.text ?? '';
if (!js || app.outputFiles.some(file => !/\.(js|css)$/.test(file.path))) throw new Error('Expected a self-contained JS and CSS bundle.');
const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Paperstream</title><style>${css.replace(/<\/style/gi, '<\\/style')}</style></head><body><div id="root"></div><script>${js.replace(/<\/script/gi, '<\\/script')}</script></body></html>`;
await writeFile(join(out, 'app.html'), html);
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
for (const name of ['LICENSE', 'THIRD_PARTY_NOTICES.md']) await copyFile(join(repository, name), join(pack, name));
await cp(join(repository, 'licenses'), join(pack, 'licenses'), { recursive: true });
await copyFile(join(root, 'README.md'), join(pack, 'README.md'));
console.log(`Built standard Paperstream MCP Apps package: ${pack}`);
