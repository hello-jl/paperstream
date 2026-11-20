import { createRequire } from 'node:module';
import { join } from 'node:path';

/** Bundle a React browser entrypoint into a single self-contained HTML page. */
export async function bundleSingleHtml({
  repository,
  entryPoint,
  outfile,
  title = 'Paperstream',
  metafile = false,
  esbuildBuild,
}) {
  let build = esbuildBuild;
  if (!build) {
    const requireWeb = createRequire(join(repository, 'web/package.json'));
    try {
      ({ build } = requireWeb('esbuild'));
    } catch {
      throw new Error(
        'The existing web dependencies are required. Run npm ci --prefix web before building; this build never installs packages.',
      );
    }
  }

  const app = await build({
    entryPoints: [entryPoint],
    outfile,
    bundle: true,
    write: false,
    minify: true,
    platform: 'browser',
    format: 'iife',
    metafile,
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

  const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>${css.replace(/<\/style/gi, '<\\/style')}</style></head><body><div id="root"></div><script>${js.replace(/<\/script/gi, '<\\/script')}</script></body></html>`;
  return { html, metafile: app.metafile };
}
