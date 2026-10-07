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
let React, renderToString, clientSrc
try {
  // react-dom resolves from ~/node_modules (the profile ships no copy), so
  // take the react instance it pairs with and hand that same copy to the
  // client factory — two react copies break rendering.
  const serverPath = req.resolve('react-dom/server')
  React = createRequire(serverPath)('react')
  renderToString = req('react-dom/server').renderToString
  clientSrc = fs.readFileSync(path.join(HERE, '..', 'lib', 'client.js'), 'utf8')
} catch (error) {
  console.log(`SKIP profile not installed yet (${error.message.split('\n')[0]})`)
  process.exit(0)
}

let captured = null
globalThis.window = { __ModuleLoader__: { load(o) { captured = o } } }
new Function('window', clientSrc)(globalThis.window)
check('client registers with the module loader', !!captured && captured.id === 'dsh-mcp-servers')

const clientRequire = (id) => (id === 'react' ? React : req(id))
const exportsMap = captured.factory(clientRequire)
check('exports apply + inject', typeof exportsMap.apply === 'function' && Array.isArray(exportsMap.inject))
check('inject covers remote + settingsScope + locale',
  exportsMap.inject.includes('remote') && exportsMap.inject.includes('settingsScope') && exportsMap.inject.includes('locale'))

let Section = null
const api = new Proxy({}, { get: () => () => Promise.resolve({ ok: true, servers: [] }) })
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
      if (Section && meta.id === 'mcp-servers') Section.component = component
      return meta
    }
  }
}

await exportsMap.apply(ctx)
check('settings.section captured', !!Section, 'section not registered')
check('section order is 93', Section && Section.meta.order === 93)
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
    check('renders both tabs', html.includes('ms.tab.servers') && html.includes('ms.tab.new'))
    // The section starts on { servers: null } (still fetching), so the first
    // paint is the loading note. The empty note is covered by the explicit
    // ServersTab render further down.
    check('renders the loading note', html.includes('ms.servers.loading'))
    check('section wrapper present', html.includes('class="ms-sec"'))
    check('section carries the colour-scheme var', html.includes('--am-scheme'))
  }
}

// ── tab renders with a fixture inventory ────────────────────────────────────
const C = exportsMap.__components
if (C && Section) {
  // A `t` that stands in for a real locale dictionary: keys with a `{t}`
  // placeholder let `tr()` interpolate the transport value, exactly the way
  // the shipped en dictionary does. An identity `t` would drop the value.
  const dict = { 'ms.servers.transport': 'transport: {t}' }
  const t = (k) => dict[k] || k
  const fixture = [
    { id: 'mcp-filesystem', name: '@deepseek-ai/dsh-mcp-client', disabled: false, serverName: 'filesystem', transport: 'stdio', command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'], env: {}, url: '', tools: [{ name: 'read_file', description: 'read' }, { name: 'write_file', description: 'write' }], reachable: true },
    { id: 'mcp-fetch', name: '@deepseek-ai/dsh-mcp-client', disabled: true, serverName: 'fetch', transport: 'http', command: '', args: [], env: {}, url: 'https://example.com/mcp', tools: [], reachable: false }
  ]
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

  const list = run('ServersTab renders', React.createElement(C.ServersTab, {
    t, snap: { servers: fixture, busy: false }, onToggle: noop, onEdit: noop, onDelete: noop, goNew: noop
  }))
  check('ServersTab lists every server', list.includes('mcp-filesystem') && list.includes('mcp-fetch'))
  check('ServersTab shows transport pills',
    list.includes('transport: stdio') && list.includes('transport: http'))
  check('ServersTab shows the enabled/disabled pills',
    list.includes('ms.servers.on') && list.includes('ms.servers.off'))
  check('ServersTab shows tool counts', list.includes('ms.servers.tools'))
  check('ServersTab shows the stdio command', list.includes('@modelcontextprotocol/server-filesystem'))
  check('ServersTab renders tool chips', list.includes('read_file') && list.includes('write_file'))

  // The loading branch only fires on a null inventory (still fetching).
  const loading = run('ServersTab renders while loading', React.createElement(C.ServersTab, {
    t, snap: { servers: null, busy: false }, onToggle: noop, onEdit: noop, onDelete: noop, goNew: noop
  }))
  check('ServersTab shows the loading note', loading.includes('ms.servers.loading'))

  const empty = run('ServersTab renders an empty inventory', React.createElement(C.ServersTab, {
    t, snap: { servers: [], busy: false }, onToggle: noop, onEdit: noop, onDelete: noop, goNew: noop
  }))
  check('ServersTab shows the empty note', empty.includes('ms.servers.empty'))

  const form = run('NewServerTab renders', React.createElement(C.NewServerTab, {
    t, draft: { id: 'mcp-time', serverName: 'time', transport: 'stdio', command: 'npx -y time', url: '', envText: 'A=1' },
    setDraft: noop, onSave: noop, onCancel: noop, saving: false, formError: ''
  }))
  check('NewServerTab has id + command fields', form.includes('ms.new.id') && form.includes('ms.new.command'))
  check('NewServerTab has the env textarea', form.includes('A=1'))
  check('NewServerTab offers save + cancel', form.includes('ms.new.save') && form.includes('ms.new.cancel'))

  const formHttp = run('NewServerTab renders http transport', React.createElement(C.NewServerTab, {
    t, draft: { id: 'mcp-fetch2', serverName: 'fetch2', transport: 'http', command: '', url: 'https://x.test/mcp', envText: '' },
    setDraft: noop, onSave: noop, onCancel: noop, saving: false, formError: ''
  }))
  check('NewServerTab hides the env field for http', !formHttp.includes('ms.new.env'))
  check('NewServerTab shows the url field for http', formHttp.includes('ms.new.url') && formHttp.includes('https://x.test/mcp'))
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`)
process.exit(failures === 0 ? 0 : 1)
