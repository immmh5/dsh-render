// End-to-end client test against a running dsh web instance: it drives the
// browser half's own `call()` helper through the real /api RPC channel, so the
// whole chain (contribution → args envelope → gateway → host → yamlkit) is
// exercised against the live cordis.patch.yml.
//
//   PORT=3099 node test/host.test.mjs
//
// Skips cleanly when no instance is listening. Authentication uses the
// authority-bound session cookie from $DSH_HOME/.credentials.yaml — the same
// signing secret dsh web uses — so no browser is involved.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createHmac, createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const PROFILE = path.join(process.env.DSH_HOME || path.join(os.homedir(), '.dsh'), 'profiles', 'web')
const PORT = String(process.env.PORT || '3099')

let failures = 0
const check = (name, cond, detail) => {
  console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond || detail === undefined ? '' : ` — ${detail}`))
  if (!cond) failures += 1
}
const skip = (why) => { console.log(`SKIP ${why}`); process.exit(0) }

// Reuse the addons-manager test's cookie helper verbatim — same signing
// secret, same envelope shape — instead of restating the b64u decode here.
const decB64u = (s) => Buffer.from(s.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - (s.length % 4)) % 4), 'base64')
const b64u = (buf) => Buffer.from(buf).toString('base64').replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '')
function sessionCookie() {
  const credPath = path.join(process.env.DSH_HOME || path.join(os.homedir(), '.dsh'), '.credentials.yaml')
  if (!fs.existsSync(credPath)) return null
  const lines = fs.readFileSync(credPath, 'utf8').split('\n')
  let secret = null
  let inBlock = false
  for (const line of lines) {
    if (/^\s{2}client-connection\/browser-session:\s*$/.test(line)) { inBlock = true; continue }
    if (!inBlock) continue
    const m = line.match(/^\s+secret:\s*(\S+)\s*$/)
    if (m) { secret = m[1]; break }
    if (/^\s{2}\S.*:\s*$/.test(line)) inBlock = false
  }
  if (!secret) return null
  const authority = `127.0.0.1:${PORT}`
  const now = Date.now()
  const body = b64u(Buffer.from(JSON.stringify({ version: 1, authority, issuedAt: now - 1000, expiresAt: now + 3600000 })))
  const sig = b64u(createHmac('sha256', decB64u(secret)).update(body).digest())
  return { authority, value: `dsh-auth-${b64u(createHash('sha256').update(authority).digest())}=v1.${body}.${sig}` }
}
const auth = sessionCookie()
if (!auth) skip('no session credential in .credentials.yaml')

let alive = false
try {
  const probe = await fetch(`http://127.0.0.1:${PORT}/`, { method: 'HEAD', headers: { host: auth.authority, cookie: auth.value }, signal: AbortSignal.timeout(2500) })
  alive = probe.status !== 0
} catch { alive = false }
if (!alive) skip(`no dsh web instance on 127.0.0.1:${PORT}`)

// ── real RPC transport, shaped exactly like the browser's connection.rpc.call ─
async function rpc(method, input) {
  const endpoint = `mcpServers/${method}`
  const res = await fetch(`http://${auth.authority}/api/${endpoint}`, {
    method: 'POST',
    headers: { host: auth.authority, cookie: auth.value, 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'client-request', rpcId: `live-${Math.random().toString(36).slice(2, 8)}`, method: endpoint, payload: { args: { input } } }),
    signal: AbortSignal.timeout(8000)
  })
  if (res.status !== 200) throw new Error(`${endpoint}: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`)
  const envelope = await res.json()
  if (envelope.type !== 'server-response') throw new Error(`${endpoint}: bad envelope ${JSON.stringify(envelope).slice(0, 120)}`)
  return envelope.result
}

// ── load the browser half ────────────────────────────────────────────────────
const req = createRequire(path.join(PROFILE, '__noop__.js'))
let React, renderToString, clientSrc, clientRequire
try {
  const serverPath = req.resolve('react-dom/server')
  React = createRequire(serverPath)('react')
  renderToString = req('react-dom/server').renderToString
  clientRequire = (id) => (id === 'react' ? React : req(id))
  clientSrc = fs.readFileSync(path.join(PROFILE, 'node_modules', 'dsh-mcp-servers', 'lib', 'client.js'), 'utf8')
} catch (error) {
  skip(`plugin not linked into the profile yet (${error.message.split('\n')[0]})`)
}

let captured = null
globalThis.window = { __ModuleLoader__: { load(o) { captured = o } } }
new Function('window', clientSrc)(globalThis.window)
const exportsMap = captured.factory(clientRequire)

// apiRef is what ctx.reflect.get('remote.mcpServers') hands to apply()
const apiRef = {}
for (const method of ['snapshot', 'setEnabled', 'upsert', 'remove']) {
  apiRef[method] = (input) => rpc(method, input || {})
}

const ctx = {
  locale: { register() {}, bind: () => (k) => k },
  remote: { $mount: async () => undefined },
  reflect: { get: () => apiRef },
  settingsScope: { bind: () => ({ getSnapshot: () => ({ value: {} }), set() {}, subscribe() {} }) },
  slots: { inject: (name, fn) => fn(), register: () => {} },
}
await exportsMap.apply(ctx)

const call = exportsMap.__components && exportsMap.__components.call
check('call() helper exported', typeof call === 'function')
if (typeof call !== 'function') { console.log(failures ? `\n${failures} FAILURES` : '\nALL PASS'); process.exit(failures ? 1 : 0) }

// ── the real call() round-trip ───────────────────────────────────────────────
const snap = await call('snapshot', { live: false }).catch((e) => ({ __error: String(e && e.message || e) }))
check('snapshot resolves', snap && snap.__error === undefined, snap && snap.__error)
check('snapshot lists servers', snap && Array.isArray(snap.servers), snap && snap.__error)
check('snapshot marks the manager', snap && snap.manager && snap.manager.name === 'dsh-mcp-servers')

// ── validation rejects bad input without touching the file ──────────────────
const badTransport = await call('upsert', { id: 'mcp-zz-test', serverName: 'zz', transport: 'carrier-pigeon', command: 'x' })
  .catch((e) => ({ __error: String(e && e.message || e) }))
check('upsert rejects an unknown transport', !!(badTransport && badTransport.ok === false) || !!(badTransport && badTransport.__error))

const badId = await call('upsert', { id: 'Not Valid!', serverName: 'zz', transport: 'stdio', command: 'x' })
  .catch((e) => ({ __error: String(e && e.message || e) }))
check('upsert rejects an invalid id', !!(badId && badId.ok === false) || !!(badId && badId.__error))

// ── create / edit / toggle / remove cycle (cleans up after itself) ──────────
const TEST_ID = 'mcp-live-test'
const created = await call('upsert', { id: TEST_ID, serverName: 'live-test', transport: 'http', url: 'https://example.com/mcp' })
  .catch((e) => ({ __error: String(e && e.message || e) }))
check('upsert creates an http server', !!(created && created.ok === true), created && created.__error)

if (created && created.ok === true) {
  const after = await call('snapshot', { live: false })
  const row = after.servers.find((s) => s.id === TEST_ID)
  check('created row is discoverable', !!row)
  check('created row carries the url', row && row.url === 'https://example.com/mcp' && row.transport === 'http')

  const edited = await call('upsert', { id: TEST_ID, serverName: 'live-test-2', transport: 'http', url: 'https://two.example.com/mcp' })
    .catch((e) => ({ __error: String(e && e.message || e) }))
  check('upsert edits an existing row', !!(edited && edited.ok === true && edited.created === false), edited && edited.__error)

  const afterEdit = await call('snapshot', { live: false })
  const editedRow = afterEdit.servers.find((s) => s.id === TEST_ID)
  check('edit changed serverName + url', editedRow && editedRow.serverName === 'live-test-2' && editedRow.url === 'https://two.example.com/mcp')

  const toggled = await call('setEnabled', { ids: [TEST_ID], enabled: false })
    .catch((e) => ({ __error: String(e && e.message || e) }))
  check('setEnabled disabled the row', !!(toggled && toggled.ok === true && toggled.changed.length === 1), toggled && toggled.__error)

  const afterToggle = await call('snapshot', { live: false })
  const toggledRow = afterToggle.servers.find((s) => s.id === TEST_ID)
  check('disabled state persisted', toggledRow && toggledRow.disabled === true)

  const removed = await call('remove', { id: TEST_ID }).catch((e) => ({ __error: String(e && e.message || e) }))
  check('remove dropped the row', !!(removed && removed.ok === true), removed && removed.__error)

  const afterRemove = await call('snapshot', { live: false })
  check('row is gone after remove', !afterRemove.servers.some((s) => s.id === TEST_ID))
}

// ── the live patch file is still well-formed ────────────────────────────────
try {
  const patchText = fs.readFileSync(path.join(PROFILE, 'cordis.patch.yml'), 'utf8')
  const ids = patchText.split(/\r?\n/).filter((l) => /^- id:/.test(l))
  check('no test rows leaked into the patch', !ids.some((l) => l.includes(TEST_ID)))
  check('patch keeps one id per row', new Set(ids).size === ids.length)
} catch (error) {
  check('patch file readable', false, error.message)
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`)
process.exit(failures === 0 ? 0 : 1)
