import { defineConfig } from 'vite';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { copyDistributionNotices } from './scripts/distribution-notices.mjs';

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export default defineConfig({
  base: './',
  plugins: [{
    name: 'paperstream-distribution-notices',
    apply: 'build',
    async writeBundle(output) {
      if (!output.dir) throw new Error('The browser build needs an output directory for license notices.');
      await copyDistributionNotices(repository, output.dir);
    },
  }],
});
