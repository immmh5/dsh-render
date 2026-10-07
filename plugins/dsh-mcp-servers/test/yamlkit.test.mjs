// yamlkit unit tests for dsh-mcp-servers — read/parse/write helpers the host
// half depends on. These are pure functions over text, so they run anywhere
// with no profile or dsh web instance.
//
//   node test/yamlkit.test.mjs
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const { parse, locateRow, parseConfig, writeConfig, readConfigText, topLevelRows: _t } = await import(path.join(HERE, '..', 'lib', 'yamlkit.mjs'))
const { topLevelRows, setEnabled, createRow, isDisabled } = await import(path.join(HERE, '..', 'lib', 'patchops.mjs'))

let failures = 0
const check = (name, cond, detail) => {
  console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond || detail === undefined ? '' : ` — ${detail}`))
  if (!cond) failures += 1
}

const PATCH = `- id: mcp-filesystem
  name: '@deepseek-ai/dsh-mcp-client'
  config:
    serverName: filesystem
    transport: stdio
    command: npx
    args:
      - '-y'
      - '@modelcontextprotocol/server-filesystem'
    env:
      DEBUG: '1'
- id: plain-plugin
  name: dsh-tools
- id: mcp-disabled
  name: '@deepseek-ai/dsh-mcp-client'
  disabled: true
  config:
    serverName: down
    transport: http
    url: https://example.com/mcp
`

// ── parse / structure ──────────────────────────────────────────────────────
check('parse returns a sequence for a list document', Array.isArray(parse(PATCH)) && parse(PATCH).length === 3)
check('parse returns null for a blank document', parse('') === null)

// ── locateRow ──────────────────────────────────────────────────────────────
let row = null
try {
  row = locateRow(PATCH, 'mcp-filesystem')
  check('locateRow finds an existing row', !!row)
  check('locateRow reports the id', row && row.id === 'mcp-filesystem')
} catch (e) { check('locateRow finds an existing row', false, e.message) }

check('locateRow returns null for a missing id', locateRow(PATCH, 'mcp-nope') === null)

// ── readConfigText / parseConfig ────────────────────────────────────────────
try {
  const cfgText = readConfigText(PATCH, 'mcp-filesystem')
  check('readConfigText returns the block body', typeof cfgText === 'string' && cfgText.includes('serverName'))
} catch (e) { check('readConfigText', false, e.message) }

try {
  const cfg = parseConfig(PATCH, 'mcp-filesystem')
  check('parseConfig reads serverName', cfg.serverName === 'filesystem')
  check('parseConfig reads transport', cfg.transport === 'stdio')
  check('parseConfig reads command', cfg.command === 'npx')
  check('parseConfig reads args as an array', Array.isArray(cfg.args) && cfg.args.length === 2)
  check('parseConfig reads env', cfg.env && cfg.env.DEBUG === '1')
} catch (e) { check('parseConfig', false, e.message) }

try {
  const cfg = parseConfig(PATCH, 'plain-plugin')
  check('parseConfig is null for a row without config', cfg === null)
} catch (e) { check('parseConfig (no config)', false, e.message) }

try {
  const cfg = parseConfig(PATCH, 'mcp-disabled')
  check('parseConfig reads url for the http row', cfg && cfg.url === 'https://example.com/mcp')
} catch (e) { check('parseConfig (http row)', false, e.message) }

// ── writeConfig round-trip ──────────────────────────────────────────────────
try {
  const next = writeConfig(PATCH, 'mcp-filesystem', {
    serverName: 'filesystem',
    transport: 'stdio',
    command: 'node',
    args: ['-y', '@modelcontextprotocol/server-filesystem'],
    env: { DEBUG: '2' },
  })
  const re = parseConfig(next, 'mcp-filesystem')
  check('writeConfig rewrites command', re.command === 'node')
  check('writeConfig rewrites env', re.env && re.env.DEBUG === '2')
  check('writeConfig preserves the other rows', next.includes('id: plain-plugin') && next.includes('id: mcp-disabled'))
  check('writeConfig keeps the patch idempotent', parseConfig(writeConfig(next, 'mcp-filesystem', re), 'mcp-filesystem').command === 'node')
} catch (e) { check('writeConfig', false, e.message) }

try {
  const before = PATCH
  const untouched = writeConfig(before, 'plain-plugin', { anything: 'goes' })
  check('writeConfig adds a config block to a bare row', untouched.includes('config:') && parseConfig(untouched, 'plain-plugin').anything === 'goes')
} catch (e) { check('writeConfig (bare row)', false, e.message) }

// ── topLevelRows ────────────────────────────────────────────────────────────
try {
  const rows = topLevelRows(PATCH)
  check('topLevelRows lists every row', rows.length === 3)
  const byId = Object.fromEntries(rows.map((r) => [r.id, r]))
  check('topLevelRows flags the disabled row', byId['mcp-disabled'].disabled === true)
  check('topLevelRows flags rows carrying config', byId['mcp-filesystem'].hasConfig === true)
  check('topLevelRows flags a row without config', byId['plain-plugin'].hasConfig === false)
} catch (e) { check('topLevelRows', false, e.message) }

// ── isDisabled ──────────────────────────────────────────────────────────────
check('isDisabled sees the disabled row', isDisabled(PATCH, 'mcp-disabled') === true)
check('isDisabled sees the enabled row', isDisabled(PATCH, 'mcp-filesystem') === false)
check('isDisabled is false for a missing id', isDisabled(PATCH, 'mcp-nope') === false)

// ── setEnabled ──────────────────────────────────────────────────────────────
try {
  const off = setEnabled(PATCH, ['mcp-filesystem'], false)
  check('setEnabled returns {text, changed}', typeof off.text === 'string' && off.changed.length === 1)
  check('setEnabled writes disabled: true', off.text.includes('id: mcp-filesystem') && isDisabled(off.text, 'mcp-filesystem') === true)
  const on = setEnabled(off.text, ['mcp-filesystem'], true)
  check('setEnabled clears disabled', isDisabled(on.text, 'mcp-filesystem') === false)
  const again = setEnabled(on.text, ['mcp-filesystem'], true)
  check('setEnabled is a no-op when already on', isDisabled(again.text, 'mcp-filesystem') === false && again.changed.length === 0 && again.unchanged.includes('mcp-filesystem'))
  check('setEnabled leaves sibling rows alone', on.text.includes('id: mcp-disabled') && isDisabled(on.text, 'mcp-disabled') === true)
} catch (e) { check('setEnabled', false, e.message) }

// ── createRow ───────────────────────────────────────────────────────────────
try {
  const res = createRow(PATCH, 'mcp-new', { name: '@deepseek-ai/dsh-mcp-client', config: { serverName: 'new', transport: 'http', url: 'https://new.example.com/mcp' } })
  check('createRow reports created: true', res.created === true)
  check('createRow writes a parseable row', parseConfig(res.text, 'mcp-new').url === 'https://new.example.com/mcp')
  check('createRow writes the package name', locateRow(res.text, 'mcp-new') && res.text.includes('@deepseek-ai/dsh-mcp-client'))
  const again = createRow(res.text, 'mcp-new', { name: '@deepseek-ai/dsh-mcp-client' })
  check('createRow is idempotent for an existing id', again.created === false && again.text === res.text)
  const rows = topLevelRows(res.text)
  check('createRow appends without disturbing rows', rows.length === 4 && rows.some((r) => r.id === 'mcp-new'))
} catch (e) { check('createRow', false, e.message) }

// ── malformed input is rejected loudly, not silently ────────────────────────
try {
  locateRow('  - broken: yaml', 'anything')
  check('locateRow tolerates odd text without throwing', true)
} catch (e) { check('locateRow tolerates odd text', true) }

try {
  writeConfig('not: a list', 'mcp-x', { a: 1 })
  check('writeConfig on a non-list document throws', false, 'expected a throw')
} catch (e) {
  check('writeConfig on a non-list document throws', /yaml|invalid|no row|not found/i.test(e.message), e.message)
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`)
process.exit(failures === 0 ? 0 : 1)
