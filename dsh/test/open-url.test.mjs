import test from 'node:test'
import assert from 'node:assert/strict'
import { Readable } from 'node:stream'
import { isLoopbackAddress, validateExternalUrl, openUrlInDefaultBrowser, registerHostOpenUrl, OPEN_URL_PATH } from '../src/index.mjs'

test('only loopback peers and strict credential-free HTTP(S) URLs are accepted', () => {
  for (const address of ['127.0.0.1', '127.2.3.4', '::1', '::ffff:127.0.0.1']) assert.equal(isLoopbackAddress(address), true)
  for (const address of ['192.168.1.2', '10.0.0.1', '::ffff:10.0.0.1', '127.evil.test', '127.999.1.1', undefined]) assert.equal(isLoopbackAddress(address), false)
  for (const url of ['https://example.org/paper?a=1&b=2', 'http://example.org/#figure', 'https://example.org/$(safe-as-one-argument)']) assert.equal(validateExternalUrl(url), url)
  for (const url of ['file:///tmp/test', 'javascript:alert(1)', 'https:example.org', 'https://user:password@example.org/', 'https://@example.org', 'https://example.org/\n', 'https://example.org/\u007f', 'https://example.org/\\other', '//example.org', null]) assert.throws(() => validateExternalUrl(url))
})

test('native opening uses an argv URL without a shell and explicitly rejects unsupported platforms', async () => {
  const calls = [], run = async (...args) => { calls.push(args) }
  const url = 'https://example.org/paper?term=$(do-not-execute)&quote=%22'
  await openUrlInDefaultBrowser(url, { platform: 'darwin', run })
  await openUrlInDefaultBrowser(url, { platform: 'linux', run })
  assert.equal(calls[0][0], '/usr/bin/open'); assert.equal(calls[1][0], 'xdg-open')
  assert.deepEqual(calls[0][1], [url]); assert.deepEqual(calls[1][1], [url])
  assert.equal(calls[0][2].shell, undefined)
  await assert.rejects(openUrlInDefaultBrowser(url, { platform: 'win32', run }), { code: 'UNSUPPORTED_PLATFORM' })
  assert.equal(calls.length, 2)
})

function harness(rejection, open = async () => {}) {
  let route, checked = 0
  registerHostOpenUrl({ connection: { requestRejection() { checked++; return rejection } }, webServer: { register(value) { route = value; return () => {} } } }, open)
  return { get route() { return route }, get checked() { return checked } }
}
async function call(harness, { method = 'POST', address = '127.0.0.1', body = '{"url":"https://example.org/paper"}', media = 'application/json' } = {}) {
  const req = Readable.from([Buffer.from(body)])
  req.method = method; req.headers = { 'content-type': media }; req.socket = { remoteAddress: address }
  const res = { statusCode: 200, headers: {}, body: '', setHeader(k, v) { this.headers[k] = v }, end(text = '') { this.body = text } }
  await harness.route.handler(req, res)
  return res
}

test('auth and loopback checks precede native dispatch; malformed requests never open anything', async () => {
  let calls = 0
  const open = async () => { calls++ }, denied = harness(401, open), local = harness(undefined, open)
  assert.equal(local.route.path, OPEN_URL_PATH)
  assert.equal((await call(denied)).statusCode, 401)
  assert.equal((await call(local, { address: '10.0.0.2' })).statusCode, 403)
  assert.equal((await call(local, { method: 'GET' })).statusCode, 405)
  assert.equal((await call(local, { media: 'text/plain' })).statusCode, 415)
  assert.equal((await call(local, { body: 'x'.repeat(4097) })).statusCode, 413)
  for (const body of ['broken', '{}', '{"url":"file:///tmp/test"}', '{"url":"https://example.org","other":true}']) assert.equal((await call(local, { body })).statusCode, 400)
  assert.equal(calls, 0)
  const response = await call(local)
  assert.equal(response.statusCode, 200); assert.deepEqual(JSON.parse(response.body), { opened: true }); assert.equal(calls, 1)
})

test('dispatch failure and unsupported hosts report failure instead of faking success', async () => {
  const failed = harness(undefined, async () => { throw new Error('open failed') })
  assert.equal((await call(failed)).statusCode, 500)
  const unsupported = harness(undefined, async () => { const error = new Error('unsupported'); error.code = 'UNSUPPORTED_PLATFORM'; throw error })
  assert.equal((await call(unsupported)).statusCode, 501)
})
