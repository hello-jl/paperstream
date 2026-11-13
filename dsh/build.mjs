import { createRequire } from 'node:module'
import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { copyDistributionNotices } from '../web/scripts/distribution-notices.mjs'

const packageDir = dirname(fileURLToPath(import.meta.url))
const webDir = join(packageDir, '..', 'web')
const manifest = JSON.parse(await readFile(join(packageDir, 'package.json'), 'utf8'))
const requireWeb = createRequire(join(webDir, 'package.json'))

let build
try {
  ;({ build } = requireWeb('esbuild'))
} catch {
  throw new Error('Install the web/ dependencies first; the DSH build reuses web/node_modules (including esbuild).')
}

// DSH PLATFORM_MODULES supplies these exact module instances. Only these
// baseline imports are external; React Flow and its own dependencies bundle in.
const sharedModules = ['react', 'react/jsx-runtime', 'react-dom', 'react-dom/client']
const result = await build({
  entryPoints: [join(packageDir, 'src', 'client.tsx')],
  outfile: join(packageDir, 'lib', 'client.js'),
  absWorkingDir: packageDir,
  bundle: true,
  platform: 'browser',
  format: 'cjs',
  target: ['es2022'],
  jsx: 'automatic',
  external: sharedModules,
  nodePaths: [join(webDir, 'node_modules')],
  define: { 'process.env.NODE_ENV': '"production"' },
  minify: true,
  write: false,
  metafile: true,
  logLevel: 'warning',
})

const js = result.outputFiles.find(file => file.path.endsWith('.js'))?.text
const css = result.outputFiles.find(file => file.path.endsWith('.css'))?.text ?? ''
if (!js) throw new Error('The DSH build did not produce a JavaScript entry.')
for (const output of Object.values(result.metafile.outputs)) {
  for (const imported of output.imports) {
    if (imported.external && !sharedModules.includes(imported.path)) {
      throw new Error(`Unexpected browser external: ${imported.path}`)
    }
  }
}

// This is DSH's documented closure-factory format, not a regular ESM module.
// Matching upstream packages/client/tsdown.client.ts, the injected require
// resolves React from the shell and each materialized factory returns exports.
const client = [
  `window.__ModuleLoader__.load({ id: ${JSON.stringify(manifest.name)}, factory: (require) => {`,
  'var module = { exports: {} }; var exports = module.exports;',
  `const __PAPERSTREAM_CSS__ = ${JSON.stringify(css)};`,
  js,
  'return module.exports; } });',
  '',
].join('\n')

await mkdir(join(packageDir, 'lib'), { recursive: true })
await writeFile(join(packageDir, 'lib', 'client.js'), client)
await copyFile(join(packageDir, 'src', 'index.mjs'), join(packageDir, 'lib', 'index.js'))
await copyDistributionNotices(dirname(packageDir), packageDir)
console.log('Built dsh/lib/client.js and dsh/lib/index.js using web/node_modules.')
