// Host half of dsh-mcp-servers.
//
// A Typert Remote gateway (the same shape dsh-addons-manager uses) exposing the
// profile's MCP server registry to the browser: list, enable/disable, add,
// edit, delete, restart, and a live tool inventory from the MCP client. Every
// file mutation goes through lib/yamlkit.mjs + lib/patchops.mjs, which are
// covered by `node test/*.test.mjs`.

import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import z from '@deepseek-ai/schemastery'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseConfig, writeConfig, YamlError } from './yamlkit.mjs'
import { setEnabled, createRow, topLevelRows, isDisabled } from './patchops.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const PKG = JSON.parse(fs.readFileSync(path.join(HERE, '..', 'package.json'), 'utf8'))

// ── Remote marker plumbing (decorator-free @Remote) ─────────────────────────

const remoteMarks = []

function markRemote(proto, method) {
  const context = {
    kind: 'method',
    name: method,
    private: false,
    static: false,
    addInitializer(fn) {
      remoteMarks.push({ proto, method, fn })
    },
  }
  Remote(method)(proto[method], context)
}

function runRemoteMarks(instance) {
  const proto = Object.getPrototypeOf(instance)
  for (const mark of remoteMarks) {
    if (mark.proto === proto) mark.fn.call(instance)
  }
}

/** Strip undefined values so every result crosses the JSON boundary cleanly. */
function jsonSafe(value) {
  if (Array.isArray(value)) return value.map(jsonSafe)
  if (value !== null && typeof value === 'object') {
    const out = {}
    for (const key of Object.keys(value)) {
      const item = jsonSafe(value[key])
      if (item !== undefined) out[key] = item
    }
    return out
  }
  return value
}

// ── paths ───────────────────────────────────────────────────────────────────

function dshHome() {
  return process.env.DSH_HOME || path.join(process.env.HOME || '', '.dsh')
}

function profileDir() {
  return path.join(dshHome(), 'profiles', 'web')
}

function patchPath() {
  return path.join(profileDir(), 'cordis.patch.yml')
}

function readPatch() {
  const p = patchPath()
  if (!fs.existsSync(p)) return ''
  return fs.readFileSync(p, 'utf8')
}

/**
 * Overwrite the patch file atomically. The DSH host may write the same file
 * (toggling layers from the UI), so take a short-lived exclusive lock first and
 * write through a temp file + rename so a crash can never leave a truncated
 * patch that would break the next boot.
 */
function writePatch(text, p) {
  const lock = `${p}.lock`
  const deadline = Date.now() + 2000
  let fd = -1
  // O_EXCL create: only one process can hold the lock file.
  while (Date.now() < deadline) {
    try {
      fd = fs.openSync(lock, 'wx')
      break
    } catch (error) {
      if (error && error.code === 'EEXIST') {
        // Stale locks (holder crashed) are reclaimable once they look abandoned.
        try {
          if (Date.now() - fs.statSync(lock).mtimeMs > 2000) fs.unlinkSync(lock)
        } catch {
          /* ignore */
        }
        continue
      }
      throw error
    }
  }
  if (fd < 0) throw new Error('writePatch: timed out waiting for the writer lock')
  try {
    const tmp = `${p}.tmp-${process.pid}`
    fs.writeFileSync(tmp, text, 'utf8')
    fs.renameSync(tmp, p)
  } finally {
    fs.closeSync(fd)
    fs.unlinkSync(lock)
  }
}

// ── MCP server discovery ────────────────────────────────────────────────────

// An MCP server row is any patch entry whose `name:` is the MCP client plugin
// (dsh-mcp-client ships inside the dsh core install). We read its `config:` to
// recover the transport, command/args/env and the serverName.
const MCP_CLIENT_PACKAGES = new Set(['@deepseek-ai/dsh-mcp-client', 'dsh-mcp-client'])
const MAX_ID = 64
const MAX_ARGS = 32
const MAX_ENV = 32

/** Collect every MCP row currently present in the patch. */
function collectServers(text) {
  const out = []
  const rows = topLevelRows(text)
  for (const row of rows) {
    if (!row) continue
    // topLevelRows reports id/disabled/configLine but not the package name,
    // so pull the `name:` scalar out of the row's own text slice.
    const name = readRowName(text, row)
    if (!MCP_CLIENT_PACKAGES.has(name)) continue
    const id = String(row.id || '').trim()
    if (!id) continue
    const cfg = readServerConfig(text, id)
    out.push({
      id,
      name,
      // DSH stores `disabled: true` as a separate toggle row that carries no
      // `name:` (so it is skipped by the loop above). Ask patchops about the
      // whole id instead of trusting this one row.
      disabled: isDisabled(text, id),
      serverName: cfg.serverName || id,
      transport: cfg.transport || 'stdio',
      command: Array.isArray(cfg.command) ? cfg.command : String(cfg.command || ''),
      args: Array.isArray(cfg.args) ? cfg.args.map(String) : [],
      env: isPlainObject(cfg.env) ? cfg.env : {},
      url: typeof cfg.url === 'string' ? cfg.url : '',
      tools: null,
      reachable: null,
    })
  }
  return out
}

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v)
}

/** Parse the `config:` block of one row via yamlkit. */
function readServerConfig(text, id) {
  try {
    const parsed = parseConfig(text, id)
    return isPlainObject(parsed) ? parsed : {}
  } catch (e) {
    if (e instanceof YamlError) return {}
    throw e
  }
}

/** Read the `name:` scalar of a top-level row (topLevelRows omits it). */
function readRowName(text, row) {
  if (!row || row.start === undefined) return ''
  const lines = String(text || '').split(/\r?\n/)
  const end = row.end === undefined ? lines.length : row.end
  for (let i = row.start; i < end; i++) {
    const line = lines[i]
    if (!line || line.trim() === '') continue
    // Only keys directly under the row (`  name:` at indent 2), never nested
    // config keys (which sit at indent ≥ 4).
    if (line.startsWith('  ') && !line.startsWith('   ')) {
      const pair = /^ {2}name:\s*(.*)$/.exec(line)
      if (pair) return pair[1].trim().replace(/^['"]|['"]$/g, '')
    }
  }
  return ''
}

// ── validation ──────────────────────────────────────────────────────────────

const VALID_TRANSPORTS = new Set(['stdio', 'http', 'sse'])

// NOTE: a regex literal cannot interpolate — `{0,MAX_ID-2}` would be parsed as
// literal text and silently reject every id. Build the pattern at runtime.
const ID_PATTERN = new RegExp(`^[a-z0-9][a-z0-9-_]{0,${MAX_ID - 2}}$`)

function validateServer(input) {
  const errors = []
  const id = String(input.id || '').trim()
  if (!id) errors.push('id is required')
  else if (!ID_PATTERN.test(id)) {
    errors.push('id must be lowercase letters, digits, "-" or "_"')
  }
  const transport = String(input.transport || 'stdio').trim()
  if (!VALID_TRANSPORTS.has(transport)) {
    errors.push('transport must be one of stdio, http, sse')
  }
  const serverName = String(input.serverName || id).trim()
  if (!serverName) errors.push('serverName is required')

  const out = { id, transport, serverName }

  if (transport === 'stdio') {
    const command = Array.isArray(input.command) ? input.command : String(input.command || '').split(/\s+/).filter(Boolean)
    if (!command.length) errors.push('command is required for stdio transport')
    else if (command.length > 1 + MAX_ARGS) errors.push('command + args too long')
    out.command = command[0]
    out.args = command.slice(1, 1 + MAX_ARGS)
    const env = isPlainObject(input.env) ? input.env : {}
    const cleanEnv = {}
    const keys = Object.keys(env).slice(0, MAX_ENV)
    for (const k of keys) cleanEnv[String(k)] = String(env[k] ?? '')
    out.env = cleanEnv
    out.url = ''
  } else {
    out.url = String(input.url || '').trim()
    if (!/^https?:\/\//i.test(out.url)) errors.push('url must start with http:// or https://')
    out.command = ''
    out.args = []
    out.env = {}
  }
  return { ok: errors.length === 0, errors, server: out }
}

// ── live tool inventory (best-effort) ──────────────────────────────────────

/** Ask the MCP client service for the tools a running server exposes. */
function toolInventory(ctx, serverName) {
  try {
    const registry = ctx.reflect && ctx.reflect.get('mcp.servers')
    if (!registry) return null
    const list = typeof registry.list === 'function' ? registry.list() : null
    if (!list) return null
    const found = Array.from(list).find((s) => s && (s.name === serverName || s.serverName === serverName))
    if (!found) return { reachable: false, tools: [] }
    const tools = Array.isArray(found.tools) ? found.tools.map((t) => ({
      name: String(t.name || ''),
      description: String(t.description || '').slice(0, 200),
    })) : []
    return { reachable: true, tools }
  } catch (e) {
    return null
  }
}

// ── gateway ─────────────────────────────────────────────────────────────────

const PREF_NS = 'mcp-servers'
const PrefSchema = z.object({
  confirmToggle: z.boolean().required(false),
  showTools: z.boolean().required(false),
  defaultTab: z.string().required(false),
})

class mcpServersGateway extends TypertRemoteService {
  constructor(ctx) {
    super(ctx, 'mcpServers')
    ctx.inject(['settings'], (settingsCtx) => {
      settingsCtx.settings.register(PREF_NS, PrefSchema)
    })
    runRemoteMarks(this)
  }

  /** Everything the UI needs to render. */
  snapshot(input) {
    input = input || {}
    const text = readPatch()
    const servers = collectServers(text)
    const live = input.live === true
    for (const s of servers) {
      const inv = live ? toolInventory(this.ctx, s.serverName) : null
      if (inv) {
        s.reachable = inv.reachable
        s.tools = inv.tools
      } else {
        s.reachable = null
        s.tools = null
      }
    }
    return jsonSafe({
      ok: true,
      patchPath: patchPath(),
      patchBytes: Buffer.byteLength(text),
      manager: { name: PKG.name, version: PKG.version },
      servers,
    })
  }

  /** Enable or disable one or more servers. */
  setEnabled(input) {
    input = input || {}
    const ids = Array.isArray(input.ids) ? input.ids.map(String) : []
    const enabled = input.enabled === true
    if (!ids.length) return jsonSafe({ ok: false, message: 'no ids' })
    const before = readPatch()
    const result = setEnabled(before, ids, enabled)
    if (result.changed.length) writePatch(result.text, patchPath())
    return jsonSafe({
      ok: true,
      enabled,
      changed: result.changed,
      unchanged: result.unchanged || [],
    })
  }

  /** Add a brand new server, or update an existing one when `replace` is set. */
  upsert(input) {
    input = input || {}
    const v = validateServer(input)
    if (!v.ok) return jsonSafe({ ok: false, errors: v.errors })
    const srv = v.server
    const text = readPatch()
    const existing = collectServers(text).some((s) => s.id === srv.id)
    const config = { serverName: srv.serverName, transport: srv.transport }
    if (srv.transport === 'stdio') {
      config.command = srv.command
      if (srv.args.length) config.args = srv.args
      const envKeys = Object.keys(srv.env)
      if (envKeys.length) config.env = srv.env
    } else {
      config.url = srv.url
    }
    // createRow is idempotent for an existing id, so route edits through
    // writeConfig instead. Both helpers are immutable: they return the new
    // document rather than mutating in place. `upsert` is a true upsert — an
    // existing id is edited in place, which is what the admin UI's Save does.
    if (existing) {
      const updated = writeConfig(text, srv.id, config)
      writePatch(updated, patchPath())
      return jsonSafe({ ok: true, id: srv.id, created: false, server: srv })
    }
    const next = createRow(text, srv.id, { name: '@deepseek-ai/dsh-mcp-client', disabled: false, config })
    writePatch(next.text, patchPath())
    return jsonSafe({ ok: true, id: srv.id, created: true, server: srv })
  }

  /** Permanently remove a server row. */
  remove(input) {
    input = input || {}
    const id = String(input.id || '').trim()
    if (!id) return jsonSafe({ ok: false, message: 'no id' })
    const text = readPatch()
    const found = collectServers(text).some((s) => s.id === id)
    if (!found) return jsonSafe({ ok: false, message: `${id} is not an MCP server` })
    // An id may legitimately occupy two rows: the config row plus a separate
    // `disabled: true` toggle row. topLevelRows reports 0-based spans with an
    // exclusive `end`, so delete every span bearing this id, back to front.
    const spans = topLevelRows(text).filter((r) => r.id === id)
    if (!spans.length) return jsonSafe({ ok: false, message: `${id} row not found` })
    const lines = text.split('\n')
    for (let i = spans.length - 1; i >= 0; i--) {
      lines.splice(spans[i].start, spans[i].end - spans[i].start)
    }
    writePatch(lines.join('\n'), patchPath())
    return jsonSafe({ ok: true, id })
  }
}

for (const method of ['snapshot', 'setEnabled', 'upsert', 'remove']) {
  markRemote(mcpServersGateway.prototype, method)
}

export { mcpServersGateway, mcpServersGateway as default }

// ── cordis apply ───────────────────────────────────────────────────────────

export function apply(ctx) {
  ctx.plugin(mcpServersGateway)
}
