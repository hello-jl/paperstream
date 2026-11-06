import { build } from 'esbuild';
import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const out = join(root, 'dist');
await mkdir(out, { recursive: true });
const app = await build({
  entryPoints: [join(root, 'src/app.tsx')], outfile: join(out, 'app.js'),
  bundle: true, write: false, minify: true, platform: 'browser', format: 'iife',
  target: 'es2022', jsx: 'automatic',
  nodePaths: [join(root, '../web/node_modules')],
  alias: { react: join(root, '../web/node_modules/react'), 'react-dom': join(root, '../web/node_modules/react-dom') },
  define: { 'process.env.NODE_ENV': '"production"' },
});
const js = app.outputFiles.find(file => file.path.endsWith('.js'))?.text;
const css = app.outputFiles.find(file => file.path.endsWith('.css'))?.text ?? '';
if (!js || app.outputFiles.some(file => !/\.(js|css)$/.test(file.path))) throw new Error('Expected a self-contained JS and CSS bundle.');
const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Paperstream</title><style>${css.replace(/<\/style/gi, '<\\/style')}</style></head><body><div id="root"></div><script>${js.replace(/<\/script/gi, '<\\/script')}</script></body></html>`;
await writeFile(join(out, 'app.html'), html);
await build({
  entryPoints: [join(root, 'src/server.ts')], outfile: join(out, 'server.mjs'),
  bundle: true, platform: 'node', format: 'esm', target: 'node22', minify: false,
  banner: { js: 'import { createRequire } from "node:module"; const require = createRequire(import.meta.url);' },
});
// A fully portable local marketplace package, containing no node_modules and
// requiring only Node at runtime. The source tree remains the development copy.
const plugin = join(out, 'plugin');
await mkdir(join(plugin, '.codex-plugin'), { recursive: true });
await mkdir(join(plugin, 'dist'), { recursive: true });
for (const name of ['server.mjs', 'app.html']) await copyFile(join(out, name), join(plugin, 'dist', name));
await copyFile(join(root, '.mcp.json'), join(plugin, '.mcp.json'));
await copyFile(join(root, '.codex-plugin/plugin.json'), join(plugin, '.codex-plugin/plugin.json'));
const manifest = JSON.parse(await readFile(join(root, '.codex-plugin/plugin.json'), 'utf8'));
console.log(`Built ${manifest.name} ${manifest.version}: ${plugin}`);
