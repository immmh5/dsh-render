// node test/patchops.test.mjs
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { parse, locateRow, parseConfig } from '../lib/yamlkit.mjs'
import {
  topLevelRows, isDisabled, setEnabled, createRow, setConfig,
  MANAGER_START, MANAGER_END,
} from '../lib/patchops.mjs'

const FILE = process.env.PATCH_FILE ||
  path.join(os.homedir(), '.dsh', 'profiles', 'web', 'cordis.patch.yml')
const original = fs.readFileSync(FILE, 'utf8')

let pass = 0
let fail = 0
const errors = []
const ok = (c, m) => { if (c) pass++; else { fail++; errors.push(m) } }
const eq = (g, w, m) => ok(JSON.stringify(g) === JSON.stringify(w),
  `${m}\n     got  ${JSON.stringify(g)}\n     want ${JSON.stringify(w)}`)

// ── 1. inventory ────────────────────────────────────────────────────────────
const rows = topLevelRows(original)
const byId = Object.fromEntries(rows.map((r) => [r.id, r]))
eq(rows.map((r) => r.id),
  ['web-search-deepseek', 'github', 'mcp-github', 'dsh-computer-use', 'dsh-browser',
    'mcp-playwright', 'mcp-remote-http', 'ui-github', 'dsh-telegram-channel',
    'dsh-mcp-toggle', 'telegram-duty', 'dsh-telegram-channel'],
  'top-level rows in the real patch file')

ok(byId['telegram-duty'].hasConfig && !byId['telegram-duty'].isToggle,
  'telegram-duty is a config row, not a toggle')
ok(byId['github'].isToggle && byId['github'].disabled, 'github is a disabled toggle')
ok(!byId['web-search-deepseek'].isToggle ? false : true, 'web-search-deepseek recognised')
ok(byId['dsh-telegram-channel'].hasConfig, 'the config row of dsh-telegram-channel wins the scan')
ok(isDisabled(original, 'github') && !isDisabled(original, 'telegram-duty'), 'isDisabled')

// ── 2. disable / enable round trip ──────────────────────────────────────────
{
  // already off
  const a = setEnabled(original, ['github'], false)
  eq(a.changed, [], 'disabling an already-disabled id is a no-op')
  eq(a.unchangedReason, { github: 'already-off' }, 'reason reported')

  // bundle-layer plugin with no row at all
  const b = setEnabled(original, ['dsh-arabic'], false)
  eq(b.changed, ['dsh-arabic'], 'a plugin with no profile row still gets disabled')
  ok(isDisabled(b.text, 'dsh-arabic'), 'dsh-arabic now disabled')
  ok(b.text.includes(MANAGER_START) && b.text.includes(MANAGER_END), 'manager region created')
  eq(parse(b.text).length, parse(original).length + 1, 'file still parses with one more entry')

  const c = setEnabled(b.text, ['dsh-arabic'], true)
  eq(c.changed, ['dsh-arabic'], 're-enabled')
  eq(c.text, original, 'enable restores the file byte for byte')

  // idempotency
  const d = setEnabled(b.text, ['dsh-arabic'], false)
  eq(d.changed, [], 'second disable is a no-op')
  eq(d.text, b.text, 'second disable changes nothing')
}

// ── 3. disabling a config row never eats the config ─────────────────────────
{
  const a = setEnabled(original, ['telegram-duty'], false)
  ok(isDisabled(a.text, 'telegram-duty'), 'telegram-duty disabled')
  eq(parseConfig(a.text, 'telegram-duty'), parseConfig(original, 'telegram-duty'),
    'telegram-duty config survives the disable')
  ok(a.text.includes(MANAGER_START), 'manager region present')

  const b = setEnabled(a.text, ['telegram-duty'], true)
  eq(b.text, original, 'enable restores the file byte for byte (config row untouched)')
}

// ── 4. toggles written by other tools are honoured ──────────────────────────
{
  const a = setEnabled(original, ['dsh-mcp-toggle', 'dsh-browser'], false)
  eq(a.changed, [], 'both are already disabled by the hub region')
  eq(a.unchangedReason['dsh-browser'], 'already-off', 'reason for dsh-browser')

  const b = setEnabled(original, ['dsh-browser'], true)
  eq(b.changed, ['dsh-browser'], 'enable removes the hub-region toggle')
  ok(!isDisabled(b.text, 'dsh-browser'), 'dsh-browser no longer disabled')
  ok(b.text.includes('# <<< dsh-extension-hub'), 'the hub region marker survives')
  ok(parse(b.text).every((e) => e && typeof e === 'object'), 'file still parses')
}

// ── 5. bulk mixed op ────────────────────────────────────────────────────────
{
  const a = setEnabled(original, ['dsh-rtl', 'dsh-arabic', 'dsh-mcp-toggle'], false)
  eq(a.changed.sort(), ['dsh-arabic', 'dsh-rtl'].sort(), 'two new disables, one already off')
  eq(a.unchangedReason['dsh-mcp-toggle'], 'already-off', 'mixed reason map')
  eq(parse(a.text).length, parse(original).length + 2, 'two entries added')
}

// ── 6. createRow / setConfig ────────────────────────────────────────────────
{
  const a = createRow(original, 'demo-plugin', {
    name: 'demo-plugin',
    config: { token: 'abc', n: 7, list: ['x', 'y'], nested: { flag: true } },
  })
  ok(a.created, 'new row created')
  eq(parseConfig(a.text, 'demo-plugin'),
    { token: 'abc', n: 7, list: ['x', 'y'], nested: { flag: true } },
    'created config parses back')
  ok(!isDisabled(a.text, 'demo-plugin'), 'created row is enabled')

  const b = createRow(a.text, 'demo-plugin', {})
  ok(!b.created, 'createRow is idempotent for an existing id')

  const c = setConfig(a.text, 'demo-plugin', { token: 'zzz' })
  eq(parseConfig(c, 'demo-plugin'), { token: 'zzz' }, 'setConfig replaces the block')
  ok(parse(c.text ?? c).length === parse(a.text).length, 'entry count stable')

  const d = setEnabled(a.text, ['demo-plugin'], false)
  eq(d.changed, ['demo-plugin'], 'disabling the created row works')
  eq(parseConfig(d.text, 'demo-plugin'), { token: 'abc', n: 7, list: ['x', 'y'], nested: { flag: true } },
    'config survives its own disable')
}

// ── 7. safety: never touch unrelated rows ───────────────────────────────────
{
  const a = setEnabled(original, ['dsh-browser'], true).text
  eq(parseConfig(a, 'telegram-duty'), parseConfig(original, 'telegram-duty'), 'telegram-duty untouched')
  eq(parseConfig(a, 'mcp-github'), parseConfig(original, 'mcp-github'), 'mcp-github untouched')
  ok(locateRow(a, 'dsh-telegram-channel') && locateRow(a, 'dsh-telegram-channel').configLine >= 0,
    'dsh-telegram-channel config row still resolvable')
}

console.log(`\npatchops: ${pass} passed, ${fail} failed`)
if (errors.length) {
  console.log('\nfailures:')
  for (const e of errors) console.log('  ✗ ' + e)
}
process.exit(fail ? 1 : 0)
