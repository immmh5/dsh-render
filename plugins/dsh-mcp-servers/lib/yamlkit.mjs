// Minimal YAML subset reader/writer for cordis.patch.yml config blocks.
//
// DSH writes cordis.patch.yml with js-yaml, but that package is not resolvable
// from a profile plugin (hoisted node_modules, no top-level js-yaml). This
// module only ever touches ONE thing: the `config:` block of a single plugin
// row — so it implements the subset DSH actually emits:
//
//   · block mappings / block sequences, 2-space indent
//   · single/double quoted and plain scalars, comments
//   · inline flow collections  [a, b]   {a: 1}
//   · `!!js <expression>` tags (kept verbatim through a round-trip)
//   · nested rows inside an `- insert:` block
//
// Anything it cannot understand it reports instead of guessing.

const RAW = Symbol.for('dsh-addons-manager/raw')

export class YamlError extends Error {
  constructor(message, line) {
    super(line === undefined ? message : `${message} (line ${line + 1})`)
    this.name = 'YamlError'
    this.line = line
  }
}

export function raw(text) {
  return { [RAW]: true, text }
}

export function isRaw(value) {
  return !!value && typeof value === 'object' && value[RAW] === true
}

// ── line helpers ─────────────────────────────────────────────────────────────

function splitLines(text) {
  return String(text).split('\n')
}

function indentOf(line) {
  let i = 0
  while (i < line.length && line[i] === ' ') i++
  return i
}

function isBlank(line) {
  return line.trim() === ''
}

function isComment(line) {
  return line.trimStart().startsWith('#')
}

/** Strip a trailing `# comment` while respecting quotes. */
export function stripComment(text) {
  let quote = null
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quote) {
      if (quote === "'" && ch === "'" && text[i + 1] === "'") { i++; continue }
      if (ch === quote) quote = null
      continue
    }
    if (ch === '"' || ch === "'") { quote = ch; continue }
    if (ch === '#' && (i === 0 || text[i - 1] === ' ' || text[i - 1] === '\t')) {
      return text.slice(0, i).replace(/[ \t]+$/, '')
    }
  }
  return text.replace(/[ \t]+$/, '')
}

// ── scalar + flow parsing ────────────────────────────────────────────────────

function parseScalar(text) {
  const s = text.trim()
  if (s === '') return null
  if (s[0] === '!') return raw(s)
  if (s[0] === "'" && s[s.length - 1] === "'" && s.length >= 2) {
    return s.slice(1, -1).replace(/''/g, "'")
  }
  if (s[0] === '"' && s[s.length - 1] === '"' && s.length >= 2) {
    return unescapeDouble(s.slice(1, -1))
  }
  if (s[0] === '[' || s[0] === '{') return parseFlow(s)
  if (s === 'null' || s === 'Null' || s === 'NULL' || s === '~') return null
  if (s === 'true' || s === 'True' || s === 'TRUE') return true
  if (s === 'false' || s === 'False' || s === 'FALSE') return false
  if (/^[+-]?\d+$/.test(s)) return Number(s)
  if (/^[+-]?(\d+\.\d*|\.\d+|\d+)([eE][+-]?\d+)?$/.test(s)) return Number(s)
  return s
}

function unescapeDouble(s) {
  let out = ''
  for (let i = 0; i < s.length; i++) {
    if (s[i] !== '\\') { out += s[i]; continue }
    const n = s[++i]
    if (n === 'n') out += '\n'
    else if (n === 't') out += '\t'
    else if (n === 'r') out += '\r'
    else if (n === '"') out += '"'
    else if (n === '\\') out += '\\'
    else out += n ?? ''
  }
  return out
}

/** Recursive-descent parser for a single-line flow collection. */
function parseFlow(text) {
  let i = 0
  const s = text.trim()

  const skipWs = () => { while (i < s.length && (s[i] === ' ' || s[i] === '\t')) i++ }

  function readScalar(stop) {
    skipWs()
    const start = i
    if (s[i] === '"' || s[i] === "'") {
      const q = s[i++]
      while (i < s.length) {
        if (q === "'" && s[i] === "'" && s[i + 1] === "'") { i += 2; continue }
        if (s[i] === q) { i++; break }
        if (q === '"' && s[i] === '\\') i++
        i++
      }
      return s.slice(start, i)
    }
    while (i < s.length && !stop.includes(s[i])) i++
    return s.slice(start, i).trim()
  }

  function parseValue() {
    skipWs()
    if (s[i] === '[') {
      i++
      const out = []
      skipWs()
      if (s[i] === ']') { i++; return out }
      for (;;) {
        skipWs()
        if (s[i] === ']') { i++; break }
        out.push(parseValue())
        skipWs()
        if (s[i] === ',') { i++; continue }
        if (s[i] === ']') { i++; break }
        throw new YamlError(`bad flow sequence near "${s.slice(i, i + 20)}"`)
      }
      return out
    }
    if (s[i] === '{') {
      i++
      const out = {}
      skipWs()
      if (s[i] === '}') { i++; return out }
      for (;;) {
        skipWs()
        if (s[i] === '}') { i++; break }
        const key = unescapeKey(readScalar(':,}'))
        skipWs()
        if (s[i] !== ':') throw new YamlError(`expected ":" in flow mapping near "${s.slice(i, i + 20)}"`)
        i++
        skipWs()
        if (s[i] === ',' || s[i] === '}') out[key] = null
        else out[key] = parseValue()
        skipWs()
        if (s[i] === ',') { i++; continue }
        if (s[i] === '}') { i++; break }
        throw new YamlError(`bad flow mapping near "${s.slice(i, i + 20)}"`)
      }
      return out
    }
    const raw_ = readScalar(',]}')
    return parseScalar(raw_)
  }

  const value = parseValue()
  skipWs()
  if (i < s.length) throw new YamlError(`trailing content in flow value: "${s.slice(i)}"`)
  return value
}

function unescapeKey(key) {
  const k = key.trim()
  if (k.length >= 2 && k[0] === '"' && k[k.length - 1] === '"') return unescapeDouble(k.slice(1, -1))
  if (k.length >= 2 && k[0] === "'" && k[k.length - 1] === "'") return k.slice(1, -1).replace(/''/g, "'")
  return k
}

/** Split `key: value` respecting quotes; returns null when the line is not a pair. */
function splitKey(line) {
  let quote = null
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (quote) {
      if (quote === "'" && ch === "'" && line[i + 1] === "'") { i++; continue }
      if (ch === quote) quote = null
      continue
    }
    if (ch === '"' || ch === "'") { quote = ch; continue }
    if (ch === ':' && (i + 1 === line.length || line[i + 1] === ' ' || line[i + 1] === '\t')) {
      return { key: unescapeKey(line.slice(0, i)), rest: line.slice(i + 1).trim() }
    }
  }
  return null
}

// ── block parsing ────────────────────────────────────────────────────────────

/**
 * Parse a block of YAML (subset) into a JS value.
 * @param {string} text
 * @returns {any}
 */
export function parse(text) {
  const lines = splitLines(text)
  const used = []
  for (let i = 0; i < lines.length; i++) {
    if (!isBlank(lines[i]) && !isComment(lines[i])) { used.push({ i, text: lines[i], indent: indentOf(lines[i]) }) }
  }
  if (used.length === 0) return null
  const [value, next] = parseNode(used, 0, used[0].indent)
  if (next < used.length) {
    throw new YamlError(`unexpected content: "${used[next].text.trim()}"`, used[next].i)
  }
  return value
}

function parseNode(lines, start, indent) {
  if (start >= lines.length) return [null, start]
  const first = lines[start]
  if (first.indent > indent) throw new YamlError(`unexpected indent at "${first.text.trim()}"`, first.i)
  if (first.text.trimStart().startsWith('- ') || first.text.trim() === '-') return parseSeq(lines, start, indent)
  return parseMap(lines, start, indent)
}

function parseSeq(lines, start, indent) {
  const out = []
  let i = start
  while (i < lines.length && lines[i].indent === indent) {
    const line = lines[i]
    const body = line.text.trimStart()
    if (!(body.startsWith('- ') || body === '-')) break
    const rest = body === '-' ? '' : body.slice(2)
    if (rest.trim() === '') {
      const childIndent = i + 1 < lines.length ? lines[i + 1].indent : -1
      if (childIndent <= indent) { out.push(null); i++ }
      else { const [v, n] = parseNode(lines, i + 1, childIndent); out.push(v); i = n }
      continue
    }
    // `- key: value` — re-parse the item as a mapping whose keys sit at indent+2.
    const synthetic = { i: line.i, indent: indent + 2, text: ' '.repeat(indent + 2) + rest }
    const pair = splitKey(rest)
    if (pair) {
      const ahead = [synthetic, ...lines.slice(i + 1)]
      const [v, n] = parseMap(ahead, 0, indent + 2)
      out.push(v)
      i += Math.max(1, n) // `n` counts the synthetic line plus its siblings
      continue
    }
    out.push(parseScalar(stripComment(rest)))
    i++
  }
  return [out, i]
}

function parseMap(lines, start, indent) {
  const out = {}
  let i = start
  while (i < lines.length && lines[i].indent === indent) {
    const line = lines[i]
    const body = line.text.trimStart()
    if (body.startsWith('- ')) break
    const pair = splitKey(stripComment(body))
    if (!pair) throw new YamlError(`expected "key: value", found "${body}"`, line.i)
    const key = pair.key
    if (pair.rest !== '') {
      out[key] = parseScalar(pair.rest)
      i++
      continue
    }
    // Block value on the following lines (deeper indent), else null.
    let j = i + 1
    if (j < lines.length && lines[j].indent > indent) {
      const [v, n] = parseNode(lines, j, lines[j].indent)
      out[key] = v
      i = n
    } else {
      out[key] = null
      i++
    }
  }
  return [out, i]
}

// ── dumping ──────────────────────────────────────────────────────────────────

const PLAIN_SAFE = /^[A-Za-z0-9_./@+\-][A-Za-z0-9_./@+\- ]*$/

export function dumpScalar(value) {
  if (value === null || value === undefined) return 'null'
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'null'
  if (isRaw(value)) return value.text
  const s = String(value)
  if (s === '') return "''"
  if (/[\n\t#]/.test(s) || /:\s/.test(s) || /^\s|\s$/.test(s)) return quoteDouble(s)
  if (s[0] === '!' || s[0] === '&' || s[0] === '*' || s[0] === '%' || s[0] === '|' || s[0] === '>' || s[0] === '@' || s[0] === '`' || s[0] === '[' || s[0] === '{' || s[0] === '"' || s[0] === "'" || s[0] === '-' || s[0] === '?' || s[0] === ':') return quoteSingle(s)
  if (/^(true|false|null|~|yes|no|on|off)$/i.test(s)) return quoteSingle(s)
  if (/^[+-]?\d/.test(s) || !PLAIN_SAFE.test(s)) return quoteSingle(s)
  return s
}

function quoteSingle(s) {
  return `'${s.replace(/'/g, "''")}'`
}

function quoteDouble(s) {
  return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\t/g, '\\t')}"`
}

/**
 * Serialize a value as a YAML block whose first key sits at `indent` spaces.
 * @param {any} value
 * @param {number} indent
 * @returns {string[]} lines (no trailing newline)
 */
export function dump(value, indent = 0) {
  const pad = ' '.repeat(indent)
  if (value === null || value === undefined) return [pad + 'null']
  if (Array.isArray(value)) {
    if (value.length === 0) return [pad + '[]']
    const out = []
    for (const item of value) {
      if (isPlainScalarValue(item)) out.push(`${pad}- ${dumpScalar(item)}`)
      else if (Array.isArray(item) && item.length === 0) out.push(`${pad}- []`)
      else if (isPlainObject(item) && Object.keys(item).length === 0) out.push(`${pad}- {}`)
      else if (isPlainObject(item)) {
        const sub = dump(item, indent + 2)
        out.push(`${pad}- ${sub[0].trimStart()}`)
        for (let i = 1; i < sub.length; i++) out.push(sub[i])
      } else out.push(`${pad}- ${dumpScalar(item)}`)
    }
    return out
  }
  if (isPlainObject(value)) {
    const keys = Object.keys(value)
    if (keys.length === 0) return [pad + '{}']
    const out = []
    for (const key of keys) {
      const item = value[key]
      const k = dumpKey(key)
      if (isPlainScalarValue(item)) out.push(`${pad}${k}: ${dumpScalar(item)}`)
      else if (Array.isArray(item)) {
        if (item.length === 0) out.push(`${pad}${k}: []`)
        else {
          out.push(`${pad}${k}:`)
          out.push(...dump(item, indent + 2))
        }
      } else if (isPlainObject(item)) {
        if (Object.keys(item).length === 0) out.push(`${pad}${k}: {}`)
        else {
          out.push(`${pad}${k}:`)
          out.push(...dump(item, indent + 2))
        }
      } else out.push(`${pad}${k}: ${dumpScalar(item)}`)
    }
    return out
  }
  return [pad + dumpScalar(value)]
}

function dumpKey(key) {
  const s = String(key)
  if (s === '') return "''"
  if (PLAIN_SAFE.test(s) && !/^(true|false|null|~|yes|no|on|off)$/i.test(s) && !/^[+-]?\d/.test(s)) return s
  return quoteSingle(s)
}

function isPlainScalarValue(v) {
  return v === null || v === undefined || typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' || isRaw(v)
}

function isPlainObject(v) {
  return !!v && typeof v === 'object' && !Array.isArray(v) && !isRaw(v)
}

// ── row location inside cordis.patch.yml ─────────────────────────────────────

/**
 * A plugin row is either a top-level `- id: X` item, or a nested
 * `    - id: X` row inside a top-level `- insert:` item.
 *
 * @param {string} text full cordis.patch.yml
 * @param {string} id   plugin id
 * @returns {null | {
 *   id: string,
 *   inInsert: boolean,
 *   startLine: number, endLine: number,      // inclusive, 0-based
 *   keyIndent: number,                       // indent of the row's own keys
 *   configLine: number,                      // line of `config:` or -1
 *   configIndent: number,
 *   configStart: number, configEnd: number,  // block extent (exclusive), or -1
 *   configInline: string | null,             // `config: <inline>` text
 * }}
 */
export function locateRow(text, id) {
  const lines = splitLines(text)
  const topStarts = []
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('- ')) topStarts.push(i)
  }
  const matches = []
  for (let t = 0; t < topStarts.length; t++) {
    const start = topStarts[t]
    const end = (t + 1 < topStarts.length ? topStarts[t + 1] : lines.length)
    const head = splitKey(stripComment(lines[start].slice(2).trim()))
    if (head && head.key === 'id' && head.rest === stripIdScalar(id)) {
      matches.push(makeRow(lines, start, end, 0, id, false))
    }
    if (head && head.key === 'insert') {
      // nested rows: `    - id: X`
      for (let i = start + 1; i < end; i++) {
        const m = /^( *)- /.exec(lines[i])
        if (!m) continue
        const nestedIndent = m[1].length
        // Inside `- insert:` the plugin rows sit at indent 4; anything deeper
        // belongs to a `config:` block of one of those rows.
        if (nestedIndent !== 4) continue
        const nested = splitKey(stripComment(lines[i].slice(nestedIndent + 2).trim()))
        if (nested && nested.key === 'id' && nested.rest === stripIdScalar(id)) {
          matches.push(makeRow(lines, i, end, nestedIndent, id, true))
        }
      }
    }
  }
  if (matches.length === 0) return null
  // An id can appear twice (a `disabled: true` toggle row plus a config row).
  // Configuration always belongs to the row that carries `config:`.
  return matches.find((row) => row.configLine >= 0) || matches[0]
}

/** Every row matching `id`, in file order (an id may legitimately appear twice). */
export function locateRows(text, id) {
  const lines = splitLines(text)
  const out = []
  for (const row of listRows(text)) {
    if (row.id !== id) continue
    const start = row.line
    let end = lines.length
    for (let i = start + 1; i < lines.length; i++) {
      if (isBlank(lines[i]) || isComment(lines[i])) continue
      if (indentOf(lines[i]) <= (row.inInsert ? 4 : 0)) { end = i; break }
    }
    out.push({ ...row, endLine: end - 1 })
  }
  return out
}

function stripIdScalar(rawId) {
  const s = String(rawId).trim()
  if ((s[0] === '"' && s[s.length - 1] === '"') || (s[0] === "'" && s[s.length - 1] === "'")) return s
  return s
}

function makeRow(lines, start, end, keyIndent, id, inInsert) {
  // Row extent: until the next row at the same-or-shallower indent.
  let rowEnd = end
  for (let i = start + 1; i < end; i++) {
    const line = lines[i]
    if (isBlank(line)) continue
    if (indentOf(line) <= keyIndent) { rowEnd = i; break }
  }
  while (rowEnd > start + 1 && isBlank(lines[rowEnd - 1])) rowEnd--

  let configLine = -1
  let configIndent = -1
  for (let i = start; i < rowEnd; i++) {
    const line = lines[i]
    if (isBlank(line) || isComment(line)) continue
    if (indentOf(line) !== keyIndent + 2) continue
    const pair = splitKey(stripComment(line.trim()))
    if (pair && pair.key === 'config') {
      configLine = i
      configIndent = keyIndent + 2
      break
    }
  }

  if (configLine === -1) {
    return { id, inInsert, startLine: start, endLine: rowEnd - 1, keyIndent, configLine: -1, configIndent: -1, configStart: -1, configEnd: -1, configInline: null }
  }

  const rest = stripComment(lines[configLine].slice(lines[configLine].indexOf('config:') + 'config:'.length)).trim()
  if (rest !== '') {
    return { id, inInsert, startLine: start, endLine: rowEnd - 1, keyIndent, configLine, configIndent, configStart: configLine, configEnd: configLine + 1, configInline: rest }
  }

  let configEnd = configLine + 1
  for (let i = configLine + 1; i < rowEnd; i++) {
    const line = lines[i]
    if (isBlank(line)) continue
    if (indentOf(line) <= configIndent) break
    configEnd = i + 1
  }
  return { id, inInsert, startLine: start, endLine: rowEnd - 1, keyIndent, configLine, configIndent, configStart: configLine + 1, configEnd, configInline: null }
}

/**
 * Every plugin id declared in the patch file, with its origin.
 * @param {string} text
 * @returns {{id: string, inInsert: boolean, line: number}[]}
 */
export function listRows(text) {
  const lines = splitLines(text)
  const out = []
  for (let i = 0; i < lines.length; i++) {
    const topLevel = /^- /.test(lines[i])
    const m = /^( *)- /.exec(lines[i])
    if (!m) continue
    const indent = m[1].length
    if (!topLevel && indent < 4) continue
    const pair = splitKey(stripComment(lines[i].slice(indent + 2).trim()))
    if (pair && pair.key === 'id') out.push({ id: parseScalar(pair.rest), inInsert: indent > 0, line: i })
  }
  return out
}

/** Read the `config:` block of a row as text (excluding the `config:` key line). */
export function readConfigText(text, id) {
  const row = locateRow(text, id)
  if (!row) return null
  return extractConfigText(text, row)
}

export function extractConfigText(text, row) {
  const lines = splitLines(text)
  if (row.configLine < 0) return null
  if (row.configInline !== null) return row.configInline
  if (row.configEnd <= row.configStart) return ''
  const out = lines.slice(row.configStart, row.configEnd)
  while (out.length && isBlank(out[0])) out.shift()
  while (out.length && isBlank(out[out.length - 1])) out.pop()
  return out.map((l) => l.slice(row.configIndent + 2)).join('\n')
}

/** Parse a config block to a JS value; returns null when absent/empty. */
export function parseConfig(text, id) {
  const row = locateRow(text, id)
  if (!row || row.configLine < 0) return null
  const block = extractConfigText(text, row)
  if (block === null || block.trim() === '') return null
  return parse(block)
}

/**
 * Replace a row's `config:` block with `value`.
 * @param {string} text
 * @param {string} id
 * @param {any} value  null removes the block entirely
 * @returns {string} new file text
 */
export function writeConfig(text, id, value) {
  const row = locateRow(text, id)
  if (!row) throw new YamlError(`plugin row "${id}" not found in cordis.patch.yml`)
  // A no-op save must not re-emit the block: round-tripping through the dumper
  // would rewrite quoting and flow style (`"a b"` → `a b`, `[1]` → block
  // list) for no reason and churn the file on every Save.
  if (deepEqual(parseConfig(text, id), value === undefined ? null : value)) return text
  const lines = splitLines(text)
  const configIndent = row.keyIndent + 2
  const pad = ' '.repeat(configIndent)

  const start = row.configLine >= 0 ? row.configLine : -1
  const end = row.configLine >= 0 ? (row.configInline !== null ? row.configLine + 1 : row.configEnd) : -1

  const replacement = []
  if (value !== null && value !== undefined && !(isPlainObject(value) && Object.keys(value).length === 0)) {
    replacement.push(pad + 'config:')
    replacement.push(...dump(value, configIndent + 2))
  }

  if (start >= 0) {
    lines.splice(start, end - start, ...replacement)
  } else {
    // No config key yet: append it at the end of the row (safest insertion
    // point — it never lands in the middle of a sibling block).
    lines.splice(row.endLine + 1, 0, ...replacement)
  }
  return lines.join('\n')
}

/** Structural equality for parsed config values (order-sensitive on purpose). */
function deepEqual(a, b) {
  if (a === b) return true
  if (isRaw(a) || isRaw(b)) return a === b
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false
    return a.every((item, i) => deepEqual(item, b[i]))
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const ka = Object.keys(a)
    const kb = Object.keys(b)
    if (ka.length !== kb.length) return false
    return ka.every((k) => deepEqual(a[k], b[k]))
  }
  return false
}
