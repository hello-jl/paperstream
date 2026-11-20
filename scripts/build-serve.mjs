import { createRequire } from 'node:module';
import { copyFile, cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repository = dirname(dirname(fileURLToPath(import.meta.url)));
const requireWeb = createRequire(join(repository, 'web/package.json'));

let build;
try {
  ({ build } = requireWeb('esbuild'));
} catch {
  throw new Error(
    'The existing web dependencies are required. Run npm ci --prefix web before building; this build never installs packages.',
  );
}

const out = join(repository, 'dist', 'serve');
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });

const app = await build({
  entryPoints: [join(repository, 'claude/src/app.tsx')],
  outfile: join(out, 'app.js'),
  bundle: true,
  write: false,
  minify: true,
  platform: 'browser',
  format: 'iife',
  target: 'es2022',
  jsx: 'automatic',
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
const htmlPath = join(out, 'app.html');
await writeFile(htmlPath, html);

for (const name of ['LICENSE', 'THIRD_PARTY_NOTICES.md']) {
  await copyFile(join(repository, name), join(out, name));
}
await cp(join(repository, 'licenses'), join(out, 'licenses'), { recursive: true });

console.log(`Built Paperstream loopback browser editor: ${htmlPath}`);
