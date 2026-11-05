import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

const directory = dirname(fileURLToPath(import.meta.url))
const manifest = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'))
let client
try {
  await readFile(join(directory, 'lib', 'index.js'), 'utf8')
  client = await readFile(join(directory, 'lib', 'client.js'), 'utf8')
} catch {
  throw new Error('Build the plugin first: npm --prefix dsh run build')
}
let registration
vm.runInNewContext(client, {
  window: { __ModuleLoader__: { load: value => { registration = value } } },
}, { timeout: 5000 })
if (registration?.id !== manifest.name || typeof registration.factory !== 'function') {
  throw new Error('The browser artifact is not a DSH module-loader factory for this package.')
}
console.log('Verified DSH package artifacts and loader registration; this is not a host integration test.')
