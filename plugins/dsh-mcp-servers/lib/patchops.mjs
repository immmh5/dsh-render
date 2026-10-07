// Enable/disable + row creation for the profile cordis.patch.yml.
//
// DSH merges patch layers in order and assigns every override key to the entry
// it targets (`applyEntryPatches`: `target[key] = value`), so a *pure toggle
// row* — a top-level `- id: X` carrying only `disabled:` (and optionally
// `name:`) — is all that is needed to switch an add-on on or off. Rows that
// carry a `config:` block are configuration, never toggles, and are never
// removed here.
//
// Config values themselves are read/written through yamlkit, the module that
// owns the `config:` block geometry.

import { dump, locateRow, writeConfig } from './yamlkit.mjs'

export const MANAGER_START = '# >>> dsh-addons-manager'
export const MANAGER_END = '# <<< dsh-addons-manager'

const TOGGLE_KEYS = new Set(['id', 'disabled', 'name', 'group', 'inject', 'intercept', 'isolate'])

function split(text) { return String(text).split('\n') }
function join(lines) { return lines.join('\n') }

function indentOf(line) {
  let i = 0
  while (i < line.length && line[i] === ' ') i++
  return i
}

function keyOf(line) {
  const m = /^ *(- )?([A-Za-z0-9_.-]+):/.exec(line)
  return m ? m[2] : null
}

/**
 * Top-level (indent 0) `- id: X` rows.
 * @returns {{id: string, start: number, end: number, disabled: boolean,
 *            isToggle: boolean, hasConfig: boolean}[]}
 */
export function topLevelRows(text) {
  const lines = split(text)
  const out = []
  for (let start = 0; start < lines.length; start++) {
    if (!lines[start].startsWith('- ')) continue
    const m = /^- id:\s*(.+?)\s*$/.exec(lines[start])
    if (!m) continue
    // Row extent stops at the next top-level item *or* at an indent-0 comment
    // (the `# >>> …` / `# <<< …` region markers), so removing a row never eats
    // a marker that happens to close the file.
    let end = lines.length
    for (let i = start + 1; i < lines.length; i++) {
      if (lines[i].startsWith('- ')) { end = i; break }
      if (indentOf(lines[i]) === 0 && lines[i].trimStart().startsWith('#')) { end = i; break }
    }
    const id = m[1].replace(/^['"]|['"]$/g, '')
    const keys = new Set()
    let disabled = false
    let hasConfig = false
    for (let i = start; i < end; i++) {
      if (lines[i].trim() === '' || lines[i].trimStart().startsWith('#')) continue
      if (indentOf(lines[i]) > 2) continue
      const k = keyOf(lines[i])
      if (!k) continue
      keys.add(k)
      if (k === 'config') hasConfig = true
      if (k === 'disabled') disabled = lines[i].slice(lines[i].indexOf(':') + 1).trim() === 'true'
    }
    const isToggle = !hasConfig && [...keys].every((k) => TOGGLE_KEYS.has(k))
    out.push({ id, start, end, disabled, isToggle, hasConfig })
  }
  return out
}

/** True when an explicit `disabled: true` row turns the add-on off. */
export function isDisabled(text, id) {
  return topLevelRows(text).some((r) => r.id === id && r.disabled)
}

function ensureRegion(lines) {
  const start = lines.indexOf(MANAGER_START)
  const end = lines.indexOf(MANAGER_END)
  if (start !== -1 && end !== -1 && end > start) return { lines, start, end }
  while (lines.length && lines[lines.length - 1] === '') lines.pop()
  if (lines.length) lines.push('')
  lines.push(MANAGER_START)
  lines.push(MANAGER_END)
  return { lines, start: lines.length - 2, end: lines.length - 1 }
}

function removeToggleRows(lines, id) {
  const rows = topLevelRows(join(lines)).filter((r) => r.id === id && r.isToggle)
  const ordered = rows.slice().sort((a, b) => b.start - a.start)
  for (const row of ordered) {
    let end = row.end
    while (end > row.start + 1 && lines[end - 1].trim() === '') end--
    lines.splice(row.start, end - row.start)
  }
  return lines
}

/** Drop the manager markers once they bracket nothing — keeps `enable` a true
 *  no-op on a file that never carried our region. */
function pruneRegion(lines, hadTrailingEol) {
  const start = lines.indexOf(MANAGER_START)
  const end = lines.indexOf(MANAGER_END)
  if (start === -1 || end === -1 || end <= start) return lines
  const between = lines.slice(start + 1, end)
  if (between.some((l) => l.trim() !== '')) return lines
  lines.splice(start, end - start + 1)
  // The markers sat at EOF: collapse the blank line `ensureRegion` introduced
  // so an enable/disable round trip reproduces the original file exactly.
  if (lines.slice(start).every((l) => l.trim() === '')) {
    while (lines.length && lines[lines.length - 1].trim() === '') lines.pop()
    if (hadTrailingEol) lines.push('')
  }
  return lines
}

/**
 * Switch add-ons on or off in bulk.
 * @param {string} text current cordis.patch.yml
 * @param {string[]} ids plugin ids
 * @param {boolean} enabled true = on, false = off
 * @returns {{text: string, changed: string[], unchanged: string[], unchangedReason: Record<string,string>}}
 */
export function setEnabled(text, ids, enabled) {
  const lines = split(text)
  const changed = []
  const unchanged = []
  const unchangedReason = {}

  for (const id of ids) {
    const rows = topLevelRows(join(lines)).filter((r) => r.id === id)
    if (enabled) {
      if (!rows.some((r) => r.isToggle)) {
        unchanged.push(id)
        unchangedReason[id] = rows.length ? 'already-on' : 'missing'
        continue
      }
      removeToggleRows(lines, id)
      changed.push(id)
    } else {
      if (rows.some((r) => r.isToggle && r.disabled)) {
        unchanged.push(id)
        unchangedReason[id] = 'already-off'
        continue
      }
      // Bundle-layer plugins (dsh-arabic, dsh-rtl, …) have no row in the
      // profile file at all — a fresh `- id: X / disabled: true` is exactly
      // how the shipped layers get switched off, so absence is not a blocker.
      const region = ensureRegion(lines)
      region.lines.splice(region.end, 0, `- id: ${id}`, '  disabled: true')
      changed.push(id)
    }
  }

  if (changed.length) pruneRegion(lines, text.endsWith('\n'))

  return { text: normalizeEol(text, join(lines)), changed, unchanged, unchangedReason }
}

/** Keep the file's trailing-newline convention after any edit. */
function normalizeEol(before, after) {
  const wanted = String(before).endsWith('\n')
  if (wanted && !after.endsWith('\n')) return after + '\n'
  if (!wanted && after.endsWith('\n')) return after.slice(0, -1)
  return after
}

/**
 * Append a brand-new top-level plugin row (used by import).
 * @returns {{text: string, created: boolean}}
 */
export function createRow(text, id, { name, disabled, config } = {}) {
  if (locateRow(text, id)) return { text, created: false }
  const lines = split(text)
  const region = ensureRegion(lines)
  const block = [`- id: ${id}`]
  if (name) block.push(`  name: ${JSON.stringify(name)}`)
  if (disabled) block.push('  disabled: true')
  if (config && typeof config === 'object' && Object.keys(config).length) {
    block.push('  config:')
    block.push(...dump(config, 4))
  }
  region.lines.splice(region.end, 0, ...block)
  return { text: normalizeEol(text, join(region.lines)), created: true }
}

/** Replace a row's `config:` block (null clears it). */
export function setConfig(text, id, value) {
  return writeConfig(text, id, value)
}
