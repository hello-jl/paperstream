import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { execFile } from 'node:child_process'
import { isIP } from 'node:net'
import { promisify } from 'node:util'

// Uses the same webServer route registration and connection trust fence as
// DSH 0.2.2-rc.1's official host-open-in-app plugin. Canvas files remain local
// browser documents: this route stores only global appearance preferences.
export const name = 'paperstream'
export const inject = ['webServer', 'connection']
export const PREFERENCES_PATH = '/paperstream/preferences'
export const THEMES = ['sage', 'paper', 'night', 'custom']
export const CUSTOM_THEME_KEYS = ['canvas', 'surface', 'ink', 'accent']
export const CONNECTION_STYLES = ['orthogonal', 'rounded', 'curved']
export const OPEN_URL_PATH = '/paperstream/open-url'
const execFileAsync = promisify(execFile)

export function preferencesFilePath(env = process.env, home = homedir()) {
  const configured = typeof env.DSH_HOME === 'string' ? env.DSH_HOME.trim() : ''
  const base = !configured ? join(home, '.dsh') : configured === '~' ? home
    : configured.startsWith('~/') ? join(home, configured.slice(2)) : resolve(configured)
  return join(base, 'paperstream', 'preferences.json')
}

function themeValue(value) {
  if (!THEMES.includes(value)) throw new TypeError('Unknown Paperstream theme')
  return value
}

export function customThemeValue(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('Invalid Paperstream custom theme')
  const keys = Object.keys(value)
  if (keys.length !== CUSTOM_THEME_KEYS.length || !CUSTOM_THEME_KEYS.every(key => Object.hasOwn(value, key))) {
    throw new TypeError('Invalid Paperstream custom theme')
  }
  const normalized = {}
  for (const key of CUSTOM_THEME_KEYS) {
    if (typeof value[key] !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(value[key])) {
      throw new TypeError('Invalid Paperstream custom theme')
    }
    normalized[key] = value[key].toLowerCase()
  }
  return normalized
}

function connectionStyleValue(value) {
  if (!CONNECTION_STYLES.includes(value)) throw new TypeError('Unknown Paperstream connection style')
  return value
}

function preferencePatch(value) {
  // Keep the old store.save(theme) API and { theme } HTTP requests working.
  const patch = typeof value === 'string' ? { theme: value } : value
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)
    || !Object.keys(patch).length || Object.keys(patch).some(key => !['theme', 'connectionStyle', 'customTheme'].includes(key))) {
    throw new TypeError('Expected supported appearance preferences')
  }
  const normalized = { ...patch }
  if (Object.hasOwn(normalized, 'theme')) themeValue(normalized.theme)
  if (Object.hasOwn(normalized, 'connectionStyle')) connectionStyleValue(normalized.connectionStyle)
  if (Object.hasOwn(normalized, 'customTheme')) normalized.customTheme = customThemeValue(normalized.customTheme)
  return normalized
}
function publicPreferences(record) {
  return {
    theme: record.theme ?? 'sage',
    connectionStyle: record.connectionStyle ?? 'rounded',
    ...(Object.hasOwn(record, 'customTheme') ? { customTheme: customThemeValue(record.customTheme) } : {}),
  }
}

export function createPreferencesStore(filePath = preferencesFilePath()) {
  let writes = Promise.resolve()
  async function readRecord() {
    let source
    try { source = await readFile(filePath, 'utf8') }
    catch (error) { if (error.code === 'ENOENT') return {}; throw error }
    const record = JSON.parse(source)
    if (!record || typeof record !== 'object' || Array.isArray(record)) throw new TypeError('Invalid appearance preferences')
    if (Object.hasOwn(record, 'theme')) themeValue(record.theme)
    if (Object.hasOwn(record, 'connectionStyle')) connectionStyleValue(record.connectionStyle)
    if (Object.hasOwn(record, 'customTheme')) customThemeValue(record.customTheme)
    return record
  }
  return {
    async load() {
      await writes
      const record = await readRecord()
      return publicPreferences(record)
    },
    save(value) {
      const patch = preferencePatch(value)
      const operation = writes.then(async () => {
        const record = { ...await readRecord(), ...patch }
        await mkdir(dirname(filePath), { recursive: true })
        const temporary = `${filePath}.${randomUUID()}.tmp`
        try {
          await writeFile(temporary, JSON.stringify(record, null, 2) + '\n', { flag: 'wx', mode: 0o600 })
          await rename(temporary, filePath)
        } finally {
          await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error })
        }
        return publicPreferences(record)
      })
      // One failed write must not poison later attempts, but its caller still
      // receives the rejection and no successful UI sync is announced.
      writes = operation.then(() => undefined, () => undefined)
      return operation
    },
  }
}

function sendJson(res, status, value) {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(JSON.stringify(value))
}

export function registerHostPreferences(ctx, store = createPreferencesStore()) {
  if (typeof ctx?.connection?.requestRejection !== 'function' || typeof ctx?.webServer?.register !== 'function') {
    throw new Error('Paperstream preferences require DSH webServer and connection services')
  }
  return ctx.webServer.register({ kind: 'exact', path: PREFERENCES_PATH, handler: async (req, res) => {
    const rejection = ctx.connection.requestRejection(req)
    if (rejection !== undefined) { res.statusCode = rejection; res.end(); return }
    if (req.method !== 'GET' && req.method !== 'PUT') {
      res.setHeader('allow', 'GET, PUT'); res.statusCode = 405; res.end(); return
    }
    try {
      if (req.method === 'GET') { sendJson(res, 200, await store.load()); return }
      if (String(req.headers['content-type']).split(';', 1)[0].trim().toLowerCase() !== 'application/json') {
        sendJson(res, 415, { error: 'Expected application/json' }); return
      }
      const chunks = []; let size = 0
      for await (const chunk of req) {
        size += chunk.byteLength
        if (size > 4096) { req.resume(); sendJson(res, 413, { error: 'Preference request too large' }); return }
        chunks.push(chunk)
      }
      let body
      try { body = JSON.parse(Buffer.concat(chunks, size).toString('utf8')) }
      catch { sendJson(res, 400, { error: 'Invalid JSON' }); return }
      let patch
      try {
        // Unlike the legacy store API, HTTP always requires a JSON object.
        if (typeof body === 'string') throw new TypeError('Expected object')
        patch = preferencePatch(body)
      } catch { sendJson(res, 400, { error: 'Expected supported appearance preferences' }); return }
      sendJson(res, 200, await store.save(patch))
    } catch {
      sendJson(res, 500, { error: 'Paperstream appearance preferences could not be synchronized' })
    }
  } })
}

export function isLoopbackAddress(address) {
  if (typeof address !== 'string') return false
  if (address === '::1' || address === '0:0:0:0:0:0:0:1') return true
  const ipv4 = address.toLowerCase().startsWith('::ffff:') ? address.slice(7) : address
  return isIP(ipv4) === 4 && ipv4.split('.')[0] === '127'
}

export function validateExternalUrl(value) {
  if (typeof value !== 'string' || !/^https?:\/\//i.test(value)
    || /[\s\u0000-\u001f\u007f-\u009f\\]/u.test(value)) throw new TypeError('Expected an absolute HTTP(S) URL')
  const parsed = new URL(value)
  const authority = value.replace(/^https?:\/\//i, '').split(/[/?#]/, 1)[0]
  if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname
    || parsed.username || parsed.password || authority.includes('@')) throw new TypeError('URL credentials are not allowed')
  return value
}

/** OS dispatch receives one URL argument; no shell expansion or browser setting changes. */
export async function openUrlInDefaultBrowser(url, { platform = process.platform, run = execFileAsync } = {}) {
  validateExternalUrl(url)
  const command = platform === 'darwin' ? '/usr/bin/open' : platform === 'linux' ? 'xdg-open' : null
  if (!command) {
    const error = new Error('System browser opening is unavailable on this platform')
    error.code = 'UNSUPPORTED_PLATFORM'
    throw error
  }
  await run(command, [url], { timeout: 10000, windowsHide: true })
}

export function registerHostOpenUrl(ctx, open = openUrlInDefaultBrowser) {
  if (typeof ctx?.connection?.requestRejection !== 'function' || typeof ctx?.webServer?.register !== 'function') {
    throw new Error('Paperstream URL opening requires DSH webServer and connection services')
  }
  return ctx.webServer.register({ kind: 'exact', path: OPEN_URL_PATH, handler: async (req, res) => {
    const rejection = ctx.connection.requestRejection(req)
    if (rejection !== undefined) { res.statusCode = rejection; res.end(); return }
    if (!isLoopbackAddress(req.socket?.remoteAddress)) {
      sendJson(res, 403, { error: 'System browser opening requires a local connection' }); return
    }
    if (req.method !== 'POST') { res.setHeader('allow', 'POST'); res.statusCode = 405; res.end(); return }
    if (String(req.headers['content-type']).split(';', 1)[0].trim().toLowerCase() !== 'application/json') {
      sendJson(res, 415, { error: 'Expected application/json' }); return
    }
    try {
      const chunks = []; let size = 0
      for await (const chunk of req) {
        size += chunk.byteLength
        if (size > 4096) { req.resume(); sendJson(res, 413, { error: 'URL request too large' }); return }
        chunks.push(chunk)
      }
      let url
      try {
        const body = JSON.parse(Buffer.concat(chunks, size).toString('utf8'))
        if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== 1) throw new TypeError('Invalid request')
        url = validateExternalUrl(body.url)
      } catch { sendJson(res, 400, { error: 'Expected one HTTP(S) URL without credentials or control characters' }); return }
      await open(url)
      sendJson(res, 200, { opened: true })
    } catch (error) {
      sendJson(res, error.code === 'UNSUPPORTED_PLATFORM' ? 501 : 500,
        { error: 'The system browser could not be opened; use the ordinary article link instead' })
    }
  } })
}

export function apply(ctx) {
  ctx.effect(() => registerHostPreferences(ctx), 'paperstream: local appearance preferences')
  ctx.effect(() => registerHostOpenUrl(ctx), 'paperstream: local default-browser URL opening')
}
