// Host half of dsh-addons-manager.
//
// A Typert Remote gateway (the same shape dsh-extension-hub uses) exposing the
// profile's cordis.patch.yml to the browser: bulk enable/disable, per-add-on
// config read/write, and bundle export/import. Every file mutation goes
// through lib/yamlkit.mjs + lib/patchops.mjs, which are covered by
// `node test/*.test.mjs`.

import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import z from '@deepseek-ai/schemastery'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseConfig, writeConfig, locateRow, YamlError } from './yamlkit.mjs'
import { setEnabled, createRow, topLevelRows, isDisabled } from './patchops.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const PKG = JSON.parse(fs.readFileSync(path.join(HERE, '..', 'package.json'), 'utf8'))

const SKIP_DIRS = new Set(['node_modules', '.git', '__pycache__', '.cache', 'assets'])
const SKIP_FILES = new Set(['.DS_Store', 'pnpm-lock.yaml', 'package-lock.json'])
const MAX_FILE_BYTES = 1024 * 1024
const MAX_BUNDLE_BYTES = 8 * 1024 * 1024

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

function profilePackagePath() {
  return path.join(profileDir(), 'package.json')
}

function pluginsSrcDir() {
  return path.join(dshHome(), 'plugins-src')
}

function readPatch() {
  const p = patchPath()
  if (!fs.existsSync(p)) return ''
  return fs.readFileSync(p, 'utf8')
}

function writePatch(text) {
  const p = patchPath()
  let mode = 0o600
  try { mode = fs.statSync(p).mode & 0o777 } catch { /* fresh file */ }
  const tmp = `${p}.tmp-${process.pid}`
  fs.writeFileSync(tmp, text, { mode })
  fs.renameSync(tmp, p)
}

function readJson(file, fallback = null) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')) } catch { return fallback }
}

// ── plugin inventory ────────────────────────────────────────────────────────

function classifyInstall(spec) {
  if (typeof spec !== 'string' || spec === '') return null
  if (spec.startsWith('file:')) return 'file'
  if (spec.startsWith('github:') || spec.includes('git+') || spec.startsWith('git:')) return 'git'
  return 'npm'
}

function nodeVersionOf(name) {
  if (typeof name !== 'string' || name === '') return null
  const dir = path.join(profileDir(), 'node_modules', ...name.split('/'))
  const pkg = readJson(path.join(dir, 'package.json'))
  return pkg && pkg.version ? pkg.version : null
}

function sourceDirOf(spec) {
  if (typeof spec !== 'string' || !spec.startsWith('file:')) return null
  const raw = spec.slice('file:'.length)
  return path.isAbsolute(raw) ? raw : path.join(profileDir(), raw)
}

/** Bundle-cloned rows store a `file://` URL; the package name is its basename. */
function cloneRoot(name) {
  if (typeof name !== 'string' || name === '') return name
  if (name.startsWith('file://')) return path.basename(name)
  return name
}

/**
 * Every row id a registered bundle layer inserts. A bare top-level row in
 * cordis.patch.yml is an *override*: applying it for an id no bundle inserts
 * is a silent no-op, so the UI needs to know which ids are actually mounted.
 */
function bundleRowIds() {
  const ids = new Set()
  const manifest = readJson(profilePackagePath(), {})
  const bundles = Array.isArray(manifest?.dsh?.profile?.bundles) ? manifest.dsh.profile.bundles : []
  for (const pkg of bundles) {
    if (typeof pkg !== 'string' || pkg === '') continue
    const file = path.join(profileDir(), 'node_modules', ...pkg.split('/'), 'cordis.patch.yml')
    let text = ''
    try { text = fs.readFileSync(file, 'utf8') } catch { continue }
    for (const m of text.matchAll(/^\s*- id:\s*(\S+)\s*$/gm)) ids.add(m[1].replace(/^['"]|['"]$/g, ''))
    for (const m of text.matchAll(/^\s*name:\s*['"]?([^'"\s]+)['"]?\s*$/gm)) ids.add(m[1].replace(/^['"]|['"]$/g, ''))
  }
  return ids
}

const FIBER_PHASE = { 0: 'pending', 1: 'loading', 2: 'active', 3: 'failed', 5: 'unloading' }

/** Id → runtime/enabled/config facts, merged from the loader and the patch. */
function inventory(ctx) {
  const patch = readPatch()
  const rows = topLevelRows(patch)
  const deps = readJson(profilePackagePath(), {})?.dependencies || {}
  const bundleIds = bundleRowIds()
  const byId = new Map()

  const loader = ctx && typeof ctx.get === 'function' ? ctx.get('loader') : null
  if (loader && typeof loader.entries === 'function') {
    for (const entry of loader.entries()) {
      if (entry && entry.options && entry.options.group) continue
      const id = String(entry.id || '').replace(/^include:/, '')
      if (!id) continue
      const name = cloneRoot(typeof entry.options?.name === 'string' ? entry.options.name : id)
      byId.set(id, {
        id,
        name,
        enabled: !entry.disabled,
        phase: entry.fiber === undefined || entry.fiber === null
          ? null
          : (FIBER_PHASE[entry.fiber.state] ?? 'active'),
        fromLoader: true,
      })
    }
  }

  // Bundle-registered ids the loader did not surface (rows overridden to
  // nothing) plus patch rows for MCP servers the profile inserts itself.
  for (const id of bundleIds) {
    if (!byId.has(id)) {
      byId.set(id, { id, name: id, enabled: true, phase: null, fromLoader: false })
    }
  }
  for (const row of rows) {
    const existing = byId.get(row.id)
    if (existing) {
      if (row.isToggle && row.disabled) existing.enabled = false
      continue
    }
    byId.set(row.id, {
      id: row.id,
      name: row.id,
      enabled: !row.disabled,
      phase: null,
      fromLoader: false,
    })
  }

  const plugins = []
  for (const item of byId.values()) {
    const spec = deps[item.name] ?? deps[item.id] ?? null
    const row = locateRow(patch, item.id)
    const pkg = readJson(path.join(profileDir(), 'node_modules', ...String(item.name).split('/'), 'package.json'))
    plugins.push({
      id: item.id,
      name: item.name,
      enabled: item.enabled !== false,
      phase: item.phase,
      official: typeof item.name === 'string' && item.name.startsWith('@deepseek-ai/'),
      description: pkg && typeof pkg.description === 'string' ? pkg.description : '',
      hasConfig: !!(row && row.configLine >= 0),
      config: row && row.configLine >= 0 ? parseConfig(patch, item.id) : null,
      version: nodeVersionOf(item.name),
      installSpec: spec,
      sourceKind: classifyInstall(spec),
      disabledRow: isDisabled(patch, item.id),
      bundleRegistered: bundleIds.has(item.id),
      inProfile: !!(row && row.id),
    })
  }
  plugins.sort((a, b) => String(a.id).localeCompare(String(b.id)))
  return { patch, plugins, bundleIds }
}

// ── source bundles ──────────────────────────────────────────────────────────

function walkFiles(dir, prefix, acc, budget) {
  let entries = []
  try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return acc }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name) || SKIP_FILES.has(entry.name)) continue
    const full = path.join(dir, entry.name)
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.isDirectory()) {
      if (rel.startsWith('assets/backup')) continue
      walkFiles(full, rel, acc, budget)
      continue
    }
    if (!entry.isFile()) continue
    let stat
    try { stat = fs.statSync(full) } catch { continue }
    if (stat.size > MAX_FILE_BYTES || budget.used + stat.size > MAX_BUNDLE_BYTES) continue
    budget.used += stat.size
    acc[rel] = fs.readFileSync(full).toString('base64')
  }
  return acc
}

function restoreFiles(targetDir, files) {
  const restored = []
  for (const [rel, b64] of Object.entries(files)) {
    if (rel.includes('..') || path.isAbsolute(rel)) continue
    const full = path.join(targetDir, rel)
    fs.mkdirSync(path.dirname(full), { recursive: true })
    fs.writeFileSync(full, Buffer.from(String(b64), 'base64'))
    restored.push(rel)
  }
  return restored
}

function installCommand(plugin, restoredDir) {
  const spec = plugin.installSpec
  if (!spec) return null
  if (plugin.sourceKind === 'file') return `dsh plugin --profile web add file:${restoredDir}`
  if (plugin.sourceKind === 'git') return `dsh plugin --profile web add ${spec}`
  return `dsh plugin --profile web add ${plugin.name}@${spec.replace(/^[\^~]/, '')}`
}

// ── gateway ─────────────────────────────────────────────────────────────────

/**
 * Durable namespace behind the "My settings" tab. The browser half reaches it
 * through `settingsScope.bind({ namespace: 'addon-manager' })`.
 */
const PREF_NS = 'addon-manager'
const PrefSchema = z.object({
  confirmBulk: z.boolean().required(false),
  exportConfig: z.boolean().required(false),
  exportSources: z.boolean().required(false),
  showDisabledOnly: z.boolean().required(false),
  defaultTab: z.string().required(false),
})

class addonManagerGateway extends TypertRemoteService {
  constructor(ctx) {
    super(ctx, 'addonManager')
    // Persist our own preferences; the settings service is optional, so inject
    // rather than declaring it (a missing service would stall the fiber).
    ctx.inject(['settings'], (settingsCtx) => {
      settingsCtx.settings.register(PREF_NS, PrefSchema)
    })
    runRemoteMarks(this)
  }

  /** Everything the UI needs to render both tabs. */
  snapshot(input) {
    input = input || {}
    const { patch, plugins } = inventory(this.ctx)
    return jsonSafe({
      ok: true,
      profile: 'web',
      patchPath: patchPath(),
      patchBytes: Buffer.byteLength(patch),
      manager: { name: PKG.name, version: PKG.version },
      plugins,
    })
  }

  /** Bulk switch add-ons on or off. */
  setEnabled(input) {
    input = input || {}
    const ids = Array.isArray(input.ids) ? input.ids.map(String) : []
    const enabled = input.enabled === true
    if (!ids.length) return jsonSafe({ ok: false, message: 'no ids' })
    const before = readPatch()
    const result = setEnabled(before, ids, enabled)
    if (result.changed.length) writePatch(result.text)
    const registered = bundleRowIds()
    const warnings = result.changed
      .filter((id) => !registered.has(id))
      .map((id) => `${id}: no bundle row, a profile toggle cannot mount/unmount it`)
    return jsonSafe({
      ok: true,
      enabled,
      changed: result.changed,
      unchanged: result.unchanged,
      unchangedReason: result.unchangedReason,
      warnings,
      pendingRestart: result.changed.length > 0,
    })
  }

  /** Read one add-on's `config:` block. */
  getConfig(input) {
    input = input || {}
    const id = String(input.id || '')
    const patch = readPatch()
    const row = locateRow(patch, id)
    if (!row) return jsonSafe({ ok: false, message: `no row for "${id}"` })
    return jsonSafe({
      ok: true,
      id,
      hasConfig: row.configLine >= 0,
      value: row.configLine >= 0 ? parseConfig(patch, id) : null,
    })
  }

  /** Replace one add-on's `config:` block (null clears it). */
  setConfig(input) {
    input = input || {}
    const id = String(input.id || '')
    const before = readPatch()
    if (!locateRow(before, id)) return jsonSafe({ ok: false, message: `no row for "${id}"` })
    try {
      writePatch(writeConfig(before, id, input.value ?? null))
    } catch (err) {
      if (err instanceof YamlError) return jsonSafe({ ok: false, message: err.message })
      throw err
    }
    return jsonSafe({ ok: true, id, pendingRestart: true })
  }

  /** Build an export bundle for the selected add-ons. */
  exportAddons(input) {
    input = input || {}
    const ids = Array.isArray(input.ids) && input.ids.length
      ? input.ids.map(String)
      : null
    const includeConfig = input.includeConfig !== false
    const includeSources = input.includeSources === true
    const { plugins } = inventory(this.ctx)
    const chosen = ids ? plugins.filter((p) => ids.includes(p.id)) : plugins

    const budget = { used: 0 }
    const out = []
    for (const plugin of chosen) {
      const entry = {
        id: plugin.id,
        name: plugin.name,
        enabled: plugin.enabled,
        version: plugin.version,
        official: plugin.official,
        installSpec: plugin.installSpec,
        sourceKind: plugin.sourceKind,
        config: includeConfig ? plugin.config : null,
      }
      if (includeSources && plugin.sourceKind === 'file') {
        const dir = sourceDirOf(plugin.installSpec)
        if (dir && fs.existsSync(dir)) entry.files = walkFiles(dir, '', {}, budget)
      }
      out.push(entry)
    }

    return jsonSafe({
      ok: true,
      bundle: {
        format: 'dsh-addons-manager.bundle',
        version: 1,
        createdAt: new Date().toISOString(),
        host: { manager: PKG.name, managerVersion: PKG.version },
        profile: 'web',
        plugins: out,
      },
      bytes: budget.used,
      truncated: budget.used >= MAX_BUNDLE_BYTES,
    })
  }

  /** Apply a bundle: restore sources, write rows/config, set enabled state. */
  importAddons(input) {
    input = input || {}
    const bundle = input && typeof input.bundle === 'object' ? input.bundle : null
    if (!bundle || bundle.format !== 'dsh-addons-manager.bundle') {
      return jsonSafe({ ok: false, message: 'not a dsh-addons-manager bundle' })
    }
    const entries = Array.isArray(bundle.plugins) ? bundle.plugins : []
    const overwriteConfig = input.overwriteConfig !== false
    const applyEnabled = input.applyEnabled !== false

    let patch = readPatch()
    const created = []
    const updated = []
    const skipped = []
    const filesRestored = []
    const enableIds = []
    const disableIds = []

    for (const entry of entries) {
      const id = String(entry.id || '')
      if (!id) { skipped.push('<missing id>'); continue }

      if (entry.files && typeof entry.files === 'object') {
        const dir = path.join(pluginsSrcDir(), path.basename(String(entry.name || id)))
        try {
          filesRestored.push(...restoreFiles(dir, entry.files).map((f) => `${path.basename(dir)}/${f}`))
        } catch (err) {
          skipped.push(`${id}: ${err.message}`)
          continue
        }
      }

      const exists = !!locateRow(patch, id)
      if (!exists) {
        const res = createRow(patch, id, {
          name: entry.name && entry.name !== id ? entry.name : undefined,
          config: overwriteConfig && entry.config ? entry.config : undefined,
        })
        patch = res.text
        if (res.created) created.push(id)
      } else if (overwriteConfig && entry.config && typeof entry.config === 'object') {
        patch = writeConfig(patch, id, entry.config)
        updated.push(id)
      }

      if (applyEnabled && entry && typeof entry.enabled === 'boolean') {
        (entry.enabled ? enableIds : disableIds).push(id)
      }
    }

    if (enableIds.length || disableIds.length) {
      if (disableIds.length) patch = setEnabled(patch, disableIds, false).text
      if (enableIds.length) patch = setEnabled(patch, enableIds, true).text
    }

    writePatch(patch)

    // What still needs the CLI (a package pnpm must lay down first).
    const deps = readJson(profilePackagePath(), {})?.dependencies || {}
    const installCommands = []
    for (const entry of entries) {
      const id = String(entry.id || '')
      const name = String(entry.name || id)
      if (deps[name] || deps[id]) continue
      const dir = path.join(pluginsSrcDir(), path.basename(name))
      installCommands.push(
        installCommand({ name, installSpec: entry.installSpec, sourceKind: entry.sourceKind }, dir) ||
        `dsh plugin --profile web add file:${dir}`,
      )
    }

    return jsonSafe({
      ok: true,
      created,
      updated,
      skipped,
      filesRestored,
      installCommands: [...new Set(installCommands)],
      pendingRestart: true,
    })
  }
}

for (const method of ['snapshot', 'setEnabled', 'getConfig', 'setConfig', 'exportAddons', 'importAddons']) {
  markRemote(addonManagerGateway.prototype, method)
}

export default addonManagerGateway
