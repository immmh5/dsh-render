// Client smoke test: load the browser half through the ModuleLoader shim,
// drive `apply()` against a mock context, then server-render the settings
// section to prove the tree mounts without throwing.
//
//   node test/client.test.mjs
//
// Needs react + react-dom/server resolvable from the web profile (they are
// what the real GUI uses); the test skips when the profile is absent.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const PROFILE = path.join(process.env.DSH_HOME || path.join(os.homedir(), '.dsh'), 'profiles', 'web')

let failures = 0
const check = (name, cond, detail) => {
  console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond || detail === undefined ? '' : ` — ${detail}`))
  if (!cond) failures += 1
}

const req = createRequire(path.join(PROFILE, '__noop__.js'))
let React, renderToString, clientSrc, clientRequire
try {
  // react-dom resolves from ~/node_modules (the profile ships no copy), so
  // take the react instance it pairs with and hand that same copy to the
  // client factory — two react copies break rendering.
  const serverPath = req.resolve('react-dom/server')
  React = createRequire(serverPath)('react')
  renderToString = req('react-dom/server').renderToString
  clientRequire = (id) => (id === 'react' ? React : req(id))
  clientSrc = fs.readFileSync(path.join(PROFILE, 'node_modules', 'dsh-addons-manager', 'lib', 'client.js'), 'utf8')
} catch (error) {
  console.log(`SKIP profile not installed yet (${error.message.split('\n')[0]})`)
  process.exit(0)
}

let captured = null
globalThis.window = { __ModuleLoader__: { load(o) { captured = o } } }
new Function('window', clientSrc)(globalThis.window)
check('client registers with the module loader', !!captured && captured.id === 'dsh-addons-manager')

const exportsMap = captured.factory(clientRequire)
check('exports apply + inject', typeof exportsMap.apply === 'function' && Array.isArray(exportsMap.inject))
check('inject covers remote + settingsScope',
  exportsMap.inject.includes('remote') && exportsMap.inject.includes('settingsScope') && exportsMap.inject.includes('locale'))

let Section = null
const api = new Proxy({}, { get: () => () => Promise.resolve({ ok: true }) })
const ctx = {
  locale: { register() {}, bind: () => (k) => k },
  remote: { $mount: async () => undefined },
  reflect: { get: () => api },
  settingsScope: { bind: () => ({ getSnapshot: () => ({ value: {} }), set() {}, subscribe() {} }) },
  slots: {
    inject(name, fn) {
      if (name !== 'settings.section') return fn()
      // register() runs inside fn(), so open the slot before calling it.
      Section = { meta: null, component: null }
      const meta = fn()
      Section.meta = meta
      return meta
    },
    register(meta, component) {
      if (Section && meta.id === 'addon-manager') Section.component = component
      return meta
    }
  }
}

await exportsMap.apply(ctx)
check('settings.section captured', !!Section, 'section not registered')
check('section order is 94', Section && Section.meta.order === 94)
check('section label renders', Section && typeof Section.meta.label() === 'string' && Section.meta.label().length > 0)

if (Section) {
  let html = ''
  let renderError = null
  try {
    html = renderToString(React.createElement(Section.component, { t: (k) => k }))
  } catch (error) {
    renderError = error
  }
  check('section server-renders', renderError === null, renderError && renderError.stack)
  if (!renderError) {
    check('renders the three tabs',
      html.includes('am.tab.plugins') && html.includes('am.tab.config') && html.includes('am.tab.prefs'))
    check('renders the loading note for an empty snapshot', html.includes('am.plugins.loading'))
    check('section wrapper present', html.includes('class="am-sec am-root"'))
    check('section carries the colour-scheme var', html.includes('--am-scheme'))
  }
}

// ── tab renders with a fixture inventory ────────────────────────────────────
const C = exportsMap.__components
if (C) {
  const t = (k) => k
  const fixture = [
    { id: 'telegram-duty', name: '@luzhengyangtx/dsh-telegram-duty', enabled: true, official: false, description: 'telegram duty', hasConfig: true, config: { language: 'ar' }, version: '0.5.0', installSpec: '^0.5.0', sourceKind: 'npm', disabledRow: false, bundleRegistered: true, inProfile: true, phase: 'active' },
    { id: 'github', name: 'dsh-github', enabled: false, official: false, description: '', hasConfig: false, config: null, version: '0.1.0', installSpec: '^0.1.0', sourceKind: 'npm', disabledRow: true, bundleRegistered: true, inProfile: true, phase: null },
    { id: 'dsh-arabic', name: 'dsh-arabic', enabled: true, official: false, description: '', hasConfig: false, config: null, version: '1.0.0', installSpec: 'file:/home/qam3/.dsh/plugins-src/dsh-arabic', sourceKind: 'file', disabledRow: false, bundleRegistered: true, inProfile: false, phase: 'active' },
  ]
  const snap = { plugins: fixture, reload: () => Promise.resolve(null) }
  const noop = () => {}
  const renders = []
  const run = (name, element) => {
    try {
      const html = renderToString(element)
      renders.push(html)
      check(name, true)
      return html
    } catch (error) {
      check(name, false, error.stack)
      renders.push('')
      return ''
    }
  }

  const list = run('PluginsTab renders', React.createElement(C.PluginsTab, {
    t, snap, selected: ['github'], setSelected: noop, notify: noop, restart: noop
  }))
  check('PluginsTab lists every add-on',
    list.includes('telegram-duty') && list.includes('dsh-github') && list.includes('dsh-arabic'))
  check('PluginsTab has bulk actions',
    list.includes('am.plugins.enable') && list.includes('am.plugins.disable') && list.includes('am.export.title') && list.includes('am.import.pick'))
  check('PluginsTab pre-selects exactly the ticked row',
    (list.match(/checked=""/g) || []).length === 1)
  check('PluginsTab shows the selection count', list.includes('am.plugins.selected'))

  const config = run('ConfigTab renders', React.createElement(C.ConfigTab, {
    t, snap, notify: noop, restart: noop
  }))
  check('ConfigTab offers add-ons that have settings', config.includes('@luzhengyangtx/dsh-telegram-duty (telegram-duty)'))
  check('ConfigTab shows the empty-state note', config.includes('am.config.pick'))

  const prefs = run('PrefsTab renders', React.createElement(C.PrefsTab, { t, notify: noop }))
  check('PrefsTab lists every preference',
    prefs.includes('am.prefs.confirmBulk') && prefs.includes('am.prefs.exportConfig') &&
    prefs.includes('am.prefs.exportSources') && prefs.includes('am.prefs.showDisabledOnly') &&
    prefs.includes('am.prefs.defaultTab'))
} else {
  check('__components exported for the render tests', false)
}

console.log(failures ? `\n${failures} FAILURES` : '\nALL PASS')
process.exit(failures ? 1 : 0)
