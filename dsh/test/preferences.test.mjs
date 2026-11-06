import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { createPreferencesStore, preferencesFilePath, registerHostPreferences, PREFERENCES_PATH } from '../src/index.mjs'

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'paperstream-preferences-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const path = join(directory, 'preferences.json')
  return { path, store: createPreferencesStore(path) }
}

test('preferences live in one DSH home and persist across store instances without touching canvas files', async t => {
  assert.equal(preferencesFilePath({ DSH_HOME: '/tmp/dsh-test' }, '/tmp/home'), '/tmp/dsh-test/paperstream/preferences.json')
  assert.equal(preferencesFilePath({ DSH_HOME: ' ' }, '/tmp/home'), '/tmp/home/.dsh/paperstream/preferences.json')
  assert.equal(preferencesFilePath({ DSH_HOME: '~/shared-dsh' }, '/tmp/home'), '/tmp/home/shared-dsh/paperstream/preferences.json')
  const { path, store } = await fixture(t)
  assert.deepEqual(await store.load(), { theme: 'sage' })
  await writeFile(path, JSON.stringify({ future: { retained: true }, theme: 'paper' }))
  await Promise.all([store.save('night'), store.save('sage'), store.save('paper')])
  assert.deepEqual(await createPreferencesStore(path).load(), { theme: 'paper' })
  assert.deepEqual(JSON.parse(await readFile(path, 'utf8')), { future: { retained: true }, theme: 'paper' })
  assert.throws(() => store.save('unsupported'), TypeError)
})

test('malformed stored preferences fail closed and are not overwritten', async t => {
  const { path, store } = await fixture(t)
  for (const source of ['{broken', 'null', '{"theme":"unsupported"}']) {
    await writeFile(path, source)
    await assert.rejects(store.load())
    await assert.rejects(store.save('night'))
    assert.equal(await readFile(path, 'utf8'), source)
  }
})

function routeHarness(store, rejection) {
  let route, disposed = false, calls = 0
  const ctx = { connection: { requestRejection() { calls++; return rejection } },
    webServer: { register(value) { route = value; return () => { disposed = true } } } }
  const dispose = registerHostPreferences(ctx, store)
  return { get route() { return route }, get calls() { return calls }, get disposed() { return disposed }, dispose }
}
async function call(harness, method, body = '', contentType = 'application/json') {
  const req = Readable.from([Buffer.from(body)])
  req.method = method; req.headers = { 'content-type': contentType }
  const response = { statusCode: 200, headers: {}, body: '', setHeader(key, value) { this.headers[key] = value }, end(text = '') { this.body = text } }
  await harness.route.handler(req, response)
  return response
}

test('the host connection fence runs before any preference read or write and routes dispose normally', async () => {
  const forbidden = routeHarness({ load() { assert.fail('must not read') }, save() { assert.fail('must not write') } }, 403)
  assert.equal(forbidden.route.kind, 'exact'); assert.equal(forbidden.route.path, PREFERENCES_PATH)
  assert.equal((await call(forbidden, 'GET')).statusCode, 403)
  assert.equal((await call(forbidden, 'PUT', '{"theme":"night"}')).statusCode, 403)
  assert.equal(forbidden.calls, 2)
  forbidden.dispose(); assert.equal(forbidden.disposed, true)
})

test('authenticated requests validate method, media type, bounded body and theme before durable writes', async t => {
  const { store } = await fixture(t), harness = routeHarness(store)
  const initial = await call(harness, 'GET')
  assert.equal(initial.statusCode, 200); assert.deepEqual(JSON.parse(initial.body), { theme: 'sage' })
  assert.equal(initial.headers['cache-control'], 'no-store')
  assert.equal((await call(harness, 'POST', '{}')).statusCode, 405)
  assert.equal((await call(harness, 'PUT', '{}', 'text/plain')).statusCode, 415)
  assert.equal((await call(harness, 'PUT', 'x'.repeat(4097))).statusCode, 413)
  for (const body of ['broken', '{}', '{"theme":"unknown"}', '{"theme":"night","path":"ignored"}']) {
    assert.equal((await call(harness, 'PUT', body)).statusCode, 400)
  }
  assert.deepEqual(await store.load(), { theme: 'sage' })
  const saved = await call(harness, 'PUT', '{"theme":"night"}')
  assert.equal(saved.statusCode, 200); assert.deepEqual(JSON.parse(saved.body), { theme: 'night' })
  assert.deepEqual(await store.load(), { theme: 'night' })
})
