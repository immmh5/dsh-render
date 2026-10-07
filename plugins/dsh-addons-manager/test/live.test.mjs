// End-to-end client test against a running dsh web instance: it drives the
// browser half's own `call()` helper through the real /api RPC channel, so the
// whole chain (contribution → args envelope → gateway → host) is exercised.
//
//   PORT=3099 node test/live.test.mjs
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

// ── auth: mint the browser-session cookie dsh web checks ─────────────────────
const b64u = (buf) => Buffer.from(buf).toString('base64').replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '')
const decB64u = (s) => Buffer.from(s.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - (s.length % 4)) % 4), 'base64')
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
  const endpoint = `addonManager/${method}`
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
  clientSrc = fs.readFileSync(path.join(PROFILE, 'node_modules', 'dsh-addons-manager', 'lib', 'client.js'), 'utf8')
} catch (error) {
  skip(`profile not installed yet (${error.message.split('\n')[0]})`)
}

let captured = null
globalThis.window = { __ModuleLoader__: { load(o) { captured = o } } }
new Function('window', clientSrc)(globalThis.window)
const exportsMap = captured.factory(clientRequire)

// apiRef is what ctx.reflect.get('remote.addonManager') hands to apply()
const apiRef = {}
for (const method of ['snapshot', 'setEnabled', 'getConfig', 'setConfig', 'exportAddons', 'importAddons']) {
  apiRef[method] = (input) => rpc(method, input || {})
}

let Section = null
const ctx = {
  locale: { register() {}, bind: () => (k) => k },
  remote: { $mount: async () => undefined },
  reflect: { get: () => apiRef },
  settingsScope: { bind: () => ({ getSnapshot: () => ({ value: {} }), set() {}, subscribe() {} }) },
  slots: {
    inject(name, fn) {
      if (name !== 'settings.section') return fn()
      Section = { meta: null, component: null }
      Section.meta = fn()
      return Section.meta
    },
    register(meta, component) {
      if (Section && meta.id === 'addon-manager') Section.component = component
      return meta
    }
  }
}
await exportsMap.apply(ctx)
check('apply() mounted the section against the live remote', !!Section)

const call = exportsMap.__components && exportsMap.__components.call
check('call() helper exported', typeof call === 'function')
if (typeof call !== 'function') { console.log(failures ? `\n${failures} FAILURES` : '\nALL PASS'); process.exit(failures ? 1 : 0) }

// ── the real call() round-trip ───────────────────────────────────────────────
const snap = await call('snapshot', {}).catch((e) => ({ __error: String(e && e.message || e) }))
check('snapshot resolves', snap && snap.__error === undefined, snap && snap.__error)
check('snapshot carries an inventory', snap && Array.isArray(snap.plugins) && snap.plugins.length > 0, snap && snap.plugins && snap.plugins.length)
check('snapshot marks the manager', snap && snap.manager && snap.manager.name === 'dsh-addons-manager')

const cfg = await call('getConfig', { id: 'telegram-duty' }).catch((e) => ({ __error: String(e && e.message || e) }))
check('getConfig resolves', cfg && cfg.__error === undefined, cfg && cfg.__error)
check('getConfig reads the live config block', cfg && cfg.ok === true && cfg.hasConfig === true)

const empty = await call('setEnabled', { ids: [], enabled: true }).catch((e) => ({ __error: String(e && e.message || e) }))
check('setEnabled rejects an empty selection without writing', empty && empty.__error === undefined && empty.ok === false && empty.message === 'no ids', empty && (empty.__error || empty.message))

const exp = await call('exportAddons', { ids: [], includeConfig: true, includeSources: false }).catch((e) => ({ __error: String(e && e.message || e) }))
check('exportAddons resolves', exp && exp.__error === undefined && exp.ok === true && exp.bundle && Array.isArray(exp.bundle.plugins), exp && exp.__error)

const badImport = await call('importAddons', { bundle: { format: 'not-a-bundle' } }).catch((e) => ({ __error: String(e && e.message || e) }))
check('importAddons rejects a foreign bundle', badImport && badImport.__error === undefined && badImport.ok === false, badImport && badImport.__error)

// ── render the tabs with the real inventory ──────────────────────────────────
const C = exportsMap.__components
if (C && Array.isArray(snap.plugins)) {
  const t = (k) => k
  const real = { plugins: snap.plugins, reload: () => Promise.resolve(null) }
  const noop = () => {}
  const run = (name, element, needle) => {
    try {
      const html = renderToString(element)
      check(name, !needle || html.includes(needle))
      return html
    } catch (error) {
      check(name, false, error.stack)
      return ''
    }
  }
  const list = run('PluginsTab renders the live inventory', React.createElement(C.PluginsTab, {
    t, snap: real, selected: [], setSelected: noop, notify: noop, restart: noop
  }), 'am.plugins.enable')
  check('live inventory is listed', snap.plugins.every((p) => list.includes(p.id) || list.length < 5000))
  run('ConfigTab renders the live inventory', React.createElement(C.ConfigTab, { t, snap: real, notify: noop, restart: noop }), 'am.config.pick')
  run('PrefsTab renders', React.createElement(C.PrefsTab, { t, notify: noop }), 'am.prefs.defaultTab')
}

console.log(failures ? `\n${failures} FAILURES` : '\nALL PASS')
process.exit(failures ? 1 : 0)
