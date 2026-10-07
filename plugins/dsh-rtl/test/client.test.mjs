// Client smoke test: load the browser half through the ModuleLoader shim,
// drive `apply()` against a mock context, server-render the direction
// section, and unit-test the AUTO text-direction probe.
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
const ROOT = path.join(HERE, '..')
const PROFILE = path.join(process.env.DSH_HOME || path.join(os.homedir(), '.dsh'), 'profiles', 'web')

let failures = 0
const check = (name, cond, detail) => {
  console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond || detail === undefined ? '' : ` — ${detail}`))
  if (!cond) failures += 1
}

const req = createRequire(path.join(PROFILE, '__noop__.js'))
let React, renderToString, clientSrc, clientRequire
try {
  const serverPath = req.resolve('react-dom/server')
  // The GUI pairs react-dom with the react copy next to it; the profile ships
  // an older react (18) and a different jsx-runtime, so take BOTH from the
  // react-dom install or elements come back from a second react instance.
  const paired = createRequire(serverPath)
  React = paired('react')
  renderToString = paired('react-dom/server').renderToString
  // The GUI bundle hands the factory a virtual registry; these two ids are
  // provided by it and resolve from neither the profile nor the CLI package.
  const stubs = {
    '@deepseek-ai/dsh-client-ui-primitives': {
      Menu: (props) => props.anchor || null,
      IconChevronDownOutline14: () => null
    },
    '@deepseek-ai/dsh-client-store': { defineStore: (cfg) => cfg }
  }
  clientRequire = (id) => {
    if (id === 'react' || id === 'react/jsx-runtime' || id === 'react/jsx-dev-runtime') return paired(id)
    return stubs[id] !== undefined ? stubs[id] : req(id)
  }
  clientSrc = fs.readFileSync(path.join(ROOT, 'lib', 'client.js'), 'utf8')
} catch (error) {
  console.log(`SKIP profile not installed yet (${error.message.split('\n')[0]})`)
  process.exit(0)
}

check('client.js has no leftover build placeholders',
  !clientSrc.includes('__DICT__') && !clientSrc.includes('__ROW_CSS__') && !clientSrc.includes('__DRIVER_CSS__'))

let captured = null
globalThis.window = { __ModuleLoader__: { load(o) { captured = o } } }
new Function('window', clientSrc)(globalThis.window)
check('client registers with the module loader', !!captured && captured.id === 'dsh-rtl')

const exportsMap = captured.factory(clientRequire)
check('exports apply + inject', typeof exportsMap.apply === 'function' && Array.isArray(exportsMap.inject))
check('inject covers locale + slots + settingsScope',
  exportsMap.inject.includes('locale') && exportsMap.inject.includes('slots') && exportsMap.inject.includes('settingsScope'))
check('test seam exported', !!exportsMap.__internals && typeof exportsMap.__internals.detectTextDir === 'function')

const internals = exportsMap.__internals
const { detectTextDir, clampThreshold, considerAuto, clearAutoMarks, coerceValue, splitLines, normalizeOpts, PREF_DEFAULTS, PREF_FIELDS } = internals

// ── host schema and client defaults must describe the same field set ────────
const indexSrc = fs.readFileSync(path.join(ROOT, 'lib', 'index.js'), 'utf8')
const fieldsBlock = indexSrc.match(/const DIRECTION_FIELDS = \[([\s\S]*?)\];/)
const hostFields = fieldsBlock ? (fieldsBlock[1].match(/"[^"]+"/g) || []).map((s) => s.slice(1, -1)) : []
check('host declares the same fields as the browser half',
  hostFields.length === PREF_FIELDS.length + 1 && hostFields.includes('preference') &&
  hostFields.every((f) => f === 'preference' || PREF_FIELDS.includes(f)) &&
  PREF_FIELDS.every((f) => hostFields.includes(f)),
  `host=${hostFields.length} client=${PREF_FIELDS.length}`)
check('every knob has a default', PREF_FIELDS.every((f) => PREF_DEFAULTS[f] !== undefined))

// ── AUTO probe unit tests ───────────────────────────────────────────────────
const EN = 'The harness streams the patch, reloads the plugin registry, then re-renders the settings tree.'
const AR = 'يعيد النظام تحميل الوحدات ثم يرسم شجرة الإعدادات من جديد بعد تطبيق التصحيح.'
const MIX = 'Hello مرحبا'

check('detect: English prose flips to ltr', detectTextDir(EN, 60) === 'ltr')
check('detect: Arabic prose stays rtl', detectTextDir(AR, 60) === 'rtl')
check('detect: mixed text follows the threshold',
  detectTextDir(MIX, 60) === 'rtl' && detectTextDir(MIX, 40) === 'ltr')
check('detect: too little text gets no signal',
  detectTextDir('ok', 60) === '' && detectTextDir('', 60) === '' && detectTextDir('1234567890', 60) === '')
check('detect: digits alone are not letters', detectTextDir('1234567890 999999', 60) === '')
check('detect: a Latin path in a sentence still reads English',
  detectTextDir('install from ~/dsh-kit/install.sh and rerun the command', 60) === 'ltr')
check('detect: minLetters lifts the bar', detectTextDir('Save', { threshold: 60, minLetters: 3 }) === 'ltr' &&
  detectTextDir('Save', { threshold: 60, minLetters: 8 }) === '')
check('detect: maxLetters skips huge blocks', detectTextDir(EN, { threshold: 60, maxLetters: 10 }) === '' &&
  detectTextDir(EN, { threshold: 60, maxLetters: 0 }) === 'ltr')
check('detect: flipMixed off keeps mixed text rtl',
  detectTextDir(MIX, { threshold: 40, flipMixed: false }) === 'rtl' &&
  detectTextDir(MIX, { threshold: 40, flipMixed: true }) === 'ltr')
check('detect: countDigits makes digits evidence',
  detectTextDir('12345678', { threshold: 60, countDigits: true }) === 'ltr' &&
  detectTextDir('١٢٣٤٥٦٧٨', { threshold: 60, countDigits: true }) === 'rtl' &&
  detectTextDir('12345678', { threshold: 60, countDigits: false }) === '')
check('clamp: below range', clampThreshold('7') === 40)
check('clamp: above range', clampThreshold(300) === 95)
check('clamp: unparsable falls back', clampThreshold('abc') === 60)
check('clamp: in range kept', clampThreshold(75) === 75)

// ── coercion / import helpers ───────────────────────────────────────────────
check('coerce: numbers clamp into their bounds',
  coerceValue('threshold', 500) === 95 && coerceValue('threshold', 10) === 40 &&
  coerceValue('minLetters', 0) === 1 && coerceValue('debounce', '250') === 250 &&
  coerceValue('maxLetters', 7) === 7)
check('coerce: booleans accept true/false only',
  coerceValue('autoContent', false) === false && coerceValue('debug', 'true') === true &&
  coerceValue('observe', 'maybe') === undefined && coerceValue('flipMixed', {}) === undefined)
check('coerce: enums reject unknown ids',
  coerceValue('composerMode', 'ltr') === 'ltr' && coerceValue('composerMode', 'sideways') === undefined &&
  coerceValue('preference', 'auto') === 'auto' && coerceValue('preference', 'system') === undefined)
check('coerce: selectors stay strings and drop objects',
  typeof coerceValue('forceLtrSelector', 'pre\ncode') === 'string' && coerceValue('scanSelector', null) === undefined)
check('splitLines: one selector per line, trimmed and deduped',
  JSON.stringify(splitLines(' pre \n\ncode\npre')) === JSON.stringify(['pre', 'code']) &&
  JSON.stringify(splitLines(undefined)) === '[]')
check('normalizeOpts: caches itself and lists the block set',
  (() => { const o = normalizeOpts({ blockSelector: 'li' }); return o.__norm === true && o.blocks.length === 1 && o.blocks[0] === 'li' && o.forceLtr.length === 0 })())

// Fake element good enough for considerAuto (no DOM in node).
const mkEl = (text, attrs = {}, display = 'block', tag = 'P') => {
  const store = new Map(Object.entries(attrs))
  const el = {
    get textContent() { return text },
    getAttribute(k) { return store.has(k) ? store.get(k) : null },
    setAttribute(k, v) { store.set(k, String(v)) },
    removeAttribute(k) { store.delete(k) },
    firstElementChild: null,
    nextElementSibling: null,
    tagName: tag,
    children: [],
    matches(sel) {
      return String(sel).split(',').map((s) => s.trim().toUpperCase()).indexOf(tag) >= 0
    },
    store,
    display
  }
  return el
}
globalThis.getComputedStyle = (el) => ({ display: el.display || 'block' })

const fresh = mkEl(EN)
considerAuto(fresh, 60)
check('consider: English paragraph marked ltr', fresh.getAttribute('dir') === 'ltr' && fresh.getAttribute('data-dsh-auto-dir') === 'ltr')
const arabic = mkEl(AR)
considerAuto(arabic, 60)
check('consider: Arabic paragraph marked rtl', arabic.getAttribute('dir') === 'rtl')
const owned = mkEl(EN, { dir: 'ltr', 'data-dsh-auto-dir': 'ltr', 'data-dsh-auto-len': String(EN.length) })
considerAuto(owned, 60)
check('consider: unchanged block is a no-op', owned.store.size === 3)
const appOwned = mkEl(EN, { dir: 'rtl' })
considerAuto(appOwned, 60)
check('consider: app-owned dir is never touched', appOwned.getAttribute('dir') === 'rtl' && !appOwned.store.has('data-dsh-auto-dir'))
const island = mkEl(EN, { 'data-dsh-text-zone': 'ltr' })
considerAuto(island, 60)
check('consider: LTR islands keep their own mark', island.getAttribute('dir') === null)
const flexed = mkEl(EN, {}, 'flex')
considerAuto(flexed, 60)
check('consider: flex layouts are never flipped', flexed.getAttribute('dir') === null)
const tooShort = mkEl('Save', {}, 'block')
considerAuto(tooShort, 60)
check('consider: short labels get no signal', tooShort.getAttribute('dir') === null)
const junk = mkEl('!@#$%^&*()[]{}', {}, 'block')
considerAuto(junk, 60)
check('consider: punctuation-only gets no signal', junk.getAttribute('dir') === null)

// Eligibility: blockSelector decides which tags may carry a flipped dir.
const leafDiv = mkEl(EN, {}, 'block', 'DIV')
considerAuto(leafDiv, 60)
check('consider: leaf DIV stays eligible', leafDiv.getAttribute('dir') === 'ltr')
const article = mkEl(EN, {}, 'block', 'ARTICLE')
considerAuto(article, 60)
check('consider: unknown tags are skipped', article.getAttribute('dir') === null)
const liOnly = mkEl(EN, {}, 'block', 'P')
considerAuto(liOnly, { blockSelector: 'li' })
check('consider: a narrowed blockSelector skips the block', liOnly.getAttribute('dir') === null)

// Override rules win over the probe.
const forcedLtr = mkEl(AR, {}, 'block', 'P')
considerAuto(forcedLtr, { forceLtrSelector: 'p' })
check('consider: forceLtrSelector pins rtl text to ltr', forcedLtr.getAttribute('dir') === 'ltr')
const forcedRtl = mkEl(EN, {}, 'block', 'P')
considerAuto(forcedRtl, { forceRtlSelector: 'p' })
check('consider: forceRtlSelector pins ltr text to rtl', forcedRtl.getAttribute('dir') === 'rtl')
const ignored = mkEl(EN, {}, 'block', 'P')
considerAuto(ignored, { ignoreSelector: 'p' })
check('consider: ignoreSelector leaves the element alone', ignored.getAttribute('dir') === null)
const cleared = mkEl(EN, { dir: 'ltr', 'data-dsh-auto-dir': 'ltr', 'data-dsh-auto-len': String(EN.length) }, 'block', 'P')
considerAuto(cleared, { ignoreSelector: 'p' })
check('consider: ignoreSelector releases a mark we own', cleared.getAttribute('dir') === null && !cleared.store.has('data-dsh-auto-dir'))

// The composer stores paragraphs as block DIVs — structure must not block it.
const { considerComposer } = internals
const composer = mkEl('Switch this box to English while I type here')
composer.firstElementChild = { tagName: 'DIV' }
considerComposer(composer, 60)
check('composer flips to ltr despite block children', composer.getAttribute('dir') === 'ltr' && composer.getAttribute('data-dsh-auto-dir') === 'ltr')
const composerAr = mkEl('أكتب رسالة عربية هنا الآن')
composerAr.firstElementChild = { tagName: 'DIV' }
considerComposer(composerAr, 60)
check('composer flips back to rtl for Arabic', composerAr.getAttribute('dir') === 'rtl')
const composerApp = mkEl('english text typed', { dir: 'rtl' })
considerComposer(composerApp, 60)
check('composer respects an app-owned dir', composerApp.getAttribute('dir') === 'rtl')
const composerEmpty = mkEl('')
composerEmpty.store.set('dir', 'ltr')
composerEmpty.store.set('data-dsh-auto-dir', 'ltr')
considerComposer(composerEmpty, 60)
check('empty composer releases its forced dir', composerEmpty.getAttribute('dir') === null)

const holder = {
  querySelectorAll: () => [fresh, arabic, appOwned, flexed, tooShort, junk, island]
    .filter((el) => el.store.has('data-dsh-auto-dir'))
}
clearAutoMarks(holder)
check('clearAutoMarks: removes every forced dir',
  fresh.getAttribute('dir') === null && arabic.getAttribute('dir') === null &&
  !fresh.store.has('data-dsh-auto-dir') && !arabic.store.has('data-dsh-auto-len'))
check('clearAutoMarks: leaves app-owned and islands alone',
  appOwned.getAttribute('dir') === 'rtl' && island.getAttribute('dir') === null)

// ── apply() against a mock context ──────────────────────────────────────────
const slots = {}
const hostCalls = []
const localeCalls = []
let Section = null
const ctx = {
  locale: {
    register: (ns) => { localeCalls.push(ns); return () => {} },
    bind: (ns) => (k) => k,
    subscribe: () => () => {},
    getSnapshot: () => ({ active: 'ar' })
  },
  settingsScope: {
    bind: ({ namespace }) => ({
      getSnapshot: () => ({ value: {} }),
      set: (field, value) => hostCalls.push([field, value]),
      subscribe: () => () => {}
    })
  },
  slots: {
    inject(name, fn) {
      slots[name] = { meta: null, component: null }
      const meta = fn()
      slots[name].meta = meta
      return meta
    },
    register(meta, component) {
      if (slots[meta.name]) slots[meta.name].component = component
      if (meta.id === 'direction-auto') Section = { meta, component }
      return meta
    }
  },
  effect: (fn) => (typeof fn === 'function' ? fn() : undefined)
}

await exportsMap.apply(ctx)
check('settings row + direction section registered',
  !!slots['settings.general.item'] && !!slots['settings.section'])
check('row id/order', slots['settings.general.item'].meta.id === 'direction' && slots['settings.general.item'].meta.order === 1)
check('section order is 93 (between extension-hub 95 and addon-manager 94)',
  slots['settings.section'].meta.order === 93)
check('section label resolves', typeof slots['settings.section'].meta.label() === 'string' && slots['settings.section'].meta.label().length > 0)
check('settings dictionaries registered', localeCalls.includes('settings.direction'))
check('apply performs no settings writes of its own', !!Section && hostCalls.length === 0)

if (Section) {
  let html = ''
  let renderError = null
  try {
    html = renderToString(React.createElement(Section.component, { t: (k) => k }))
  } catch (error) { renderError = error }
  check('section server-renders', renderError === null, renderError && renderError.stack)
  if (!renderError) {
    check('section carries its title + note',
      html.includes('direction.section') && html.includes('direction.autoHint'))
    check('offers the three modes', html.includes('direction.rtl') && html.includes('direction.auto') && html.includes('direction.ltr'))
    check('offers the AUTO knobs',
      html.includes('direction.autoContent') && html.includes('direction.autoComposer') && html.includes('direction.threshold'))
    check('threshold select ships every 5% step', html.includes('value="60"') && html.includes('value="95"'))
    check('section wrapper present', html.includes('class="dshrtl_sec"'))
    check('seven collapsible groups',
      (html.match(/class="dshrtl_group"/g) || []).length === 7)
    check('four groups open by default, three folded',
      (html.match(/open=""/g) || []).length === 4)
    check('every group has a summary', (html.match(/<summary/g) || []).length === 7)
    check('composer override offers its three options',
      html.includes('direction.composerMode.auto') && html.includes('direction.composerMode.rtl') && html.includes('direction.composerMode.ltr'))
    check('numeric knobs render as number inputs', (html.match(/type="number"/g) || []).length === 3)
    check('selector + export fields render as textareas', (html.match(/<textarea/g) || []).length === 10)
    check('action buttons present',
      html.includes('direction.refresh') && html.includes('direction.copy') &&
      html.includes('direction.import') && html.includes('direction.reset'))
    check('detection group exposes the new probes',
      html.includes('direction.minLetters') && html.includes('direction.maxLetters') &&
      html.includes('direction.flipMixed') && html.includes('direction.countDigits'))
    check('behaviour group exposes the perf knobs',
      html.includes('direction.debounce') && html.includes('direction.observe') &&
      html.includes('direction.reactToInput') && html.includes('direction.debug'))
    check('override group exposes the three rule lists',
      html.includes('direction.forceLtr') && html.includes('direction.forceRtl') && html.includes('direction.ignore'))
    check('selector group exposes every selector',
      html.includes('direction.scopeSelector') && html.includes('direction.composerSelector') &&
      html.includes('direction.scanSelector') && html.includes('direction.blockSelector') &&
      html.includes('direction.islandSelector') && html.includes('direction.sidebarSelector'))
  }
}

// Row: the general-item selector renders with the active mode label.
const Row = slots['settings.general.item'].component
if (Row) {
  let html = ''
  let renderError = null
  try {
    html = renderToString(React.createElement(Row, {
      t: (k) => k,
      useStore: (sel) => sel({ active: 'auto' }),
      setDirection: () => {}
    }))
  } catch (error) { renderError = error }
  check('row server-renders', renderError === null, renderError && renderError.stack)
  if (!renderError) {
    check('row shows title + hint', html.includes('direction.title') && html.includes('direction.hint'))
    check('row selector shows the active mode', html.includes('dshrtl_selector') && html.includes('direction.auto'))
  }
} else {
  check('settings general row registered', false)
}

// Row: wiring the injected store pushes the preference through the host.
const rowMeta = slots['settings.general.item'].meta
const injected = rowMeta.inject({ sync() {} })
check('row injection returns setDirection', typeof injected.setDirection === 'function')
injected.setDirection('auto')
check('row write reaches the settings host', hostCalls.some(([f, v]) => f === 'preference' && v === 'auto'))
injected.setDirection('nonsense')
check('row rejects unknown modes', hostCalls.filter(([f]) => f === 'preference').length === 1)

// Export / import / reset travel through the same host slot.
const exported = JSON.parse(internals.exportConfigText())
check('export carries every knob', PREF_FIELDS.every((f) => f in exported) && 'preference' in exported)
const touched = internals.applyImport(JSON.stringify({
  threshold: 500,
  composerMode: 'ltr',
  minLetters: 3,
  debug: true,
  unknownField: 'drop me'
}))
check('import applies known fields and clamps them',
  touched.includes('threshold') && touched.includes('composerMode') &&
  touched.includes('minLetters') && touched.includes('debug') && !touched.includes('unknownField') &&
  hostCalls.some(([f, v]) => f === 'threshold' && v === 95) &&
  hostCalls.some(([f, v]) => f === 'minLetters' && v === 3))
let importBroke = false
try { internals.applyImport('{ not json') } catch (error) { importBroke = true }
check('import rejects malformed JSON', importBroke)
internals.prefReset()
const resetCalls = hostCalls.slice(-PREF_FIELDS.length)
check('reset writes every knob back to its default',
  resetCalls.length === PREF_FIELDS.length &&
  resetCalls.every(([f, v]) => v === PREF_DEFAULTS[f]))

console.log(failures ? `\n${failures} FAILURES` : '\nALL PASS')
process.exit(failures ? 1 : 0)
