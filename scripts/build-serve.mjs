import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundleSingleHtml } from '../web/scripts/bundle-single-html.mjs';
import { copyDistributionNotices } from '../web/scripts/distribution-notices.mjs';

const repository = dirname(dirname(fileURLToPath(import.meta.url)));
const out = join(repository, 'dist', 'serve');
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });

const { html } = await bundleSingleHtml({
  repository,
  entryPoint: join(repository, 'web/src/local-bridge/app.tsx'),
  outfile: join(out, 'app.js'),
});

const htmlPath = join(out, 'app.html');
await writeFile(htmlPath, html);
await copyDistributionNotices(repository, out);

console.log(`Built Paperstream loopback browser editor: ${htmlPath}`);
