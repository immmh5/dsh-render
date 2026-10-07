// node test/yamlkit.test.mjs
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  parse, dump, locateRow, locateRows, listRows,
  parseConfig, readConfigText, writeConfig, YamlError, raw, isRaw,
} from '../lib/yamlkit.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const FILE = process.env.PATCH_FILE ||
  path.join(os.homedir(), '.dsh', 'profiles', 'web', 'cordis.patch.yml')

let pass = 0
let fail = 0
const errors = []

function ok(cond, msg) {
  if (cond) pass++
  else { fail++; errors.push(msg) }
}
function eq(got, want, msg) {
  const g = JSON.stringify(got)
  const w = JSON.stringify(want)
  ok(g === w, `${msg}\n     got  ${g}\n     want ${w}`)
}

// ── 1. scalar / flow unit cases ──────────────────────────────────────────────
eq(parse('a: 1'), { a: 1 }, 'int')
eq(parse('a: 1.5'), { a: 1.5 }, 'float')
eq(parse('a: true\nb: false\nc: null'), { a: true, b: false, c: null }, 'bools/null')
eq(parse("a: 'has: colon'"), { a: 'has: colon' }, 'single quoted')
eq(parse('a: "line\\nbreak"'), { a: 'line\nbreak' }, 'double quoted escape')
eq(parse('a: [1, 2, "three"]'), { a: [1, 2, 'three'] }, 'flow seq')
eq(parse('a: { x: 1, y: "z" }'), { a: { x: 1, y: 'z' } }, 'flow map')
eq(parse('a: !!js process.env.FOO'), { a: raw('!!js process.env.FOO') }, 'js tag kept raw')
ok(isRaw(parse('a: !!js process.env.FOO').a), 'isRaw on tag')
eq(parse('- 1\n- 2'), [1, 2], 'top seq')
eq(parse('list:\n  - a\n  - b'), { list: ['a', 'b'] }, 'nested seq')
eq(parse('# c\na: 1 # trailing'), { a: 1 }, 'comments')
eq(parse("k: 'it''s'"), { k: "it's" }, 'single quote doubling')
eq(parse('msg: "say \\"hi\\""'), { msg: 'say "hi"' }, 'double quote escaping')

// dump → parse round trip
for (const sample of [
  { a: 1, b: 'plain', c: true, d: null },
  { nested: { x: [1, 2], y: { z: 'deep' } } },
  { path: '/home/qam3/agent deepseek', q: 'has: colon', h: 'hash #notcomment' },
  { list: [{ id: 'a', n: 1 }, { id: 'b', n: 2 }] },
  { empty: {}, list2: [] },
  { tag: raw('!!js process.env.GITHUB_TOKEN') },
  { ar: 'نص عربي', unicode: '✓ ok' },
]) {
  eq(parse(dump(sample).join('\n')), sample, `dump/parse ${JSON.stringify(sample).slice(0, 60)}`)
}

// ── 2. real cordis.patch.yml ─────────────────────────────────────────────────
const text = fs.readFileSync(FILE, 'utf8')
const rows = listRows(text)
const ids = rows.map((r) => r.id)

for (const want of ['web-search-deepseek', 'mcp-github', 'mcp-playwright', 'mcp-remote-http',
  'github', 'dsh-computer-use', 'dsh-browser', 'ui-github', 'dsh-telegram-channel',
  'dsh-mcp-toggle', 'telegram-duty']) {
  ok(ids.includes(want), `listRows finds "${want}" (got: ${ids.join(', ')})`)
}
ok(ids.filter((i) => i === 'dsh-telegram-channel').length === 2,
  `dsh-telegram-channel appears twice (toggle row + config row) — got ${ids.filter((i) => i === 'dsh-telegram-channel').length}`)

// whole-file parse is the big integration test
let whole = null
try { whole = parse(text) } catch (e) { ok(false, `parse(whole file) threw: ${e.message}`) }
ok(Array.isArray(whole), 'whole file parses to a top-level list')
ok(whole && whole.length > 10, `whole file has entries (${whole && whole.length})`)

// ── 3. locateRow / config extraction ────────────────────────────────────────
const rowTduty = locateRow(text, 'telegram-duty')
ok(rowTduty && rowTduty.configLine >= 0, 'telegram-duty row has a config block')
const cfgTduty = parseConfig(text, 'telegram-duty')
// The profile is live (patchReload: live): telegram-duty persists extra
// defaults of its own, so assert the keys we control are present instead of
// pinning the exact key set.
const tdutyKeys = cfgTduty ? Object.keys(cfgTduty) : []
ok(['chatId', 'dataDir', 'dutyCwd', 'language', 'token', 'watchMode']
  .every((k) => tdutyKeys.includes(k)),
  `telegram-duty config keys ⊇ expected (got ${tdutyKeys.join(',')})`)
eq(cfgTduty && cfgTduty.chatId, 8939516904, 'telegram-duty chatId is a number')
eq(cfgTduty && cfgTduty.language, 'ar', 'telegram-duty language')

const cfgGithub = parseConfig(text, 'mcp-github')
ok(cfgGithub && cfgGithub.serverName === 'github', 'mcp-github serverName')
ok(cfgGithub && Array.isArray(cfgGithub.args) && cfgGithub.args[0] === '-y', 'mcp-github args flow seq')
ok(cfgGithub && isRaw(cfgGithub.env.GITHUB_TOKEN), 'mcp-github !!js env stays raw')

const rowTg = locateRow(text, 'dsh-telegram-channel')
ok(rowTg && rowTg.configLine >= 0,
  'dsh-telegram-channel resolves to the CONFIG row, not the disabled toggle row')

// a row that only toggles has no config
const rowPlain = locateRow(text, 'dsh-mcp-toggle')
ok(rowPlain && rowPlain.configLine === -1, 'dsh-mcp-toggle has no config block')

// ── 4. every config block round-trips through parse → write → parse ─────────
const configIds = [...new Set(rows.map((r) => r.id))]
  .filter((id) => { const r = locateRow(text, id); return r && r.configLine >= 0 })

ok(configIds.length >= 4, `found ${configIds.length} rows with a config block`)

let t2 = text
for (const id of configIds) {
  const before = parseConfig(text, id)
  try {
    t2 = writeConfig(t2, id, before)
  } catch (e) {
    ok(false, `writeConfig(${id}) threw: ${e.message}`)
    continue
  }
  const after = parseConfig(t2, id)
  eq(after, before, `config round trip for "${id}"`)
}
eq(parse(t2), whole, 'rewriting every config block preserves the whole file value')

// ── 5. writeConfig with a new value ─────────────────────────────────────────
{
  const next = { ...cfgTduty, language: 'en', extra: { flag: true, list: ['a', 'b'] } }
  const t3 = writeConfig(text, 'telegram-duty', next)
  eq(parseConfig(t3, 'telegram-duty'), next, 'telegram-duty config update round trip')
  // everything else untouched
  eq(parseConfig(t3, 'mcp-github'), cfgGithub, 'mcp-github untouched by another row write')
  // structural integrity of the whole file still holds
  const parsed = parse(t3)
  ok(Array.isArray(parsed) && parsed.length === whole.length,
    `file still parses to ${whole.length} entries after a config edit (got ${parsed && parsed.length})`)
}

// ── 6. config removal / creation ────────────────────────────────────────────
{
  const t4 = writeConfig(text, 'dsh-mcp-toggle', { enabled: true })
  eq(parseConfig(t4, 'dsh-mcp-toggle'), { enabled: true }, 'config block created for a row without one')
  const t5 = writeConfig(t4, 'dsh-mcp-toggle', null)
  eq(parseConfig(t5, 'dsh-mcp-toggle'), null, 'config block removed')
  eq(t5, text, 'create+remove restores the original file')
}

// ── 7. error paths ──────────────────────────────────────────────────────────
{
  let threw = false
  try { writeConfig(text, 'no-such-plugin', { a: 1 }) } catch (e) { threw = e instanceof YamlError }
  ok(threw, 'writeConfig on a missing id throws YamlError')
}

// ── report ──────────────────────────────────────────────────────────────────
console.log(`\nyamlkit: ${pass} passed, ${fail} failed`)
if (errors.length) {
  console.log('\nfailures:')
  for (const e of errors) console.log('  ✗ ' + e)
}
process.exit(fail ? 1 : 0)
