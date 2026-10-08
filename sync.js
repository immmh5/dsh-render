#!/usr/bin/env node
// Sync $DSH_HOME (default /data) to durable storage over plain HTTPS.
//
// dsh on Render's free plan has no persistent disk, so settings/sessions would
// be wiped on every redeploy and sleep/wake. This script:
//   restore  - download the latest snapshot into DSH_HOME
//   sync     - upload the current DSH_HOME back to storage
//
// Two backends are supported (first one fully configured wins):
//   1. GitHub Releases  — GITHUB_TOKEN (+ optional GITHUB_STORAGE_REPO)
//   2. Supabase Storage — SUPABASE_URL + SUPABASE_SERVICE_KEY + SUPABASE_BUCKET
//
// The GitHub backend stores a single gzipped tarball of DSH_HOME as a release
// asset (2GB asset limit, vs 100MB for a git blob), keeping the last few
// releases so a failed upload never orphans the last good snapshot. GitHub
// serves assets fine for private repos with a token, needs no project/bucket
// setup, and a classic PAT with `repo` scope is enough — so it is the default
// when no Supabase project is provisioned.
//
// The Supabase backend keeps the original per-file REST sync. It transfers more
// per tick but makes no assumptions about the runtime image's tooling.

import { createWriteStream, createReadStream, readFileSync, writeFileSync, statSync, chmodSync as chmod, rmSync } from 'node:fs';
import { join, dirname, relative, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { Readable } from 'node:stream';
import { createHash } from 'node:crypto';

const HOME = process.env.DSH_HOME || '/data';

// --- backend selection ------------------------------------------------------
const SUPA_URL = process.env.SUPABASE_URL;
const SUPA_KEY = process.env.SUPABASE_SERVICE_KEY;
const SUPA_BUCKET = process.env.SUPABASE_BUCKET;
const GH_TOKEN = process.env.GITHUB_TOKEN;
const GH_REPO = process.env.GITHUB_STORAGE_REPO || 'immmh5/dsh-storage';

const HAVE_SUPA = !!(SUPA_URL && SUPA_KEY && SUPA_BUCKET);
const HAVE_GH = !!GH_TOKEN;

if (!HAVE_SUPA && !HAVE_GH) {
  console.error('[sync] no backend configured: set GITHUB_TOKEN, or SUPABASE_URL + SUPABASE_SERVICE_KEY + SUPABASE_BUCKET');
  process.exit(1);
}
if (HAVE_SUPA && HAVE_GH) {
  // Explicit Supabase config wins so an existing bucket is never abandoned.
  console.error('[sync] both backends configured; using Supabase');
}

const USE_GH = HAVE_GH && !HAVE_SUPA;

// --- shared -----------------------------------------------------------------
// Regenerable/heavy trees — never transfer them. logs/ holds a startup
// diagnostic file per boot attempt; with the crash-loop before the chmod fix
// this grew fast, and they carry no state worth persisting across redeploys.
// profiles/ is defined by this repo (package.json + cordis.patch.yml, token via
// !!js process.env) and installed fresh on every boot, so it is both excluded
// from restore (never clobbers the repo's definition) and from upload (never
// uploads node_modules or stale profile state).
const SKIP = [
  /(^|\/)profiles(\/|$)/,
  /(^|\/)node_modules(\/|$)/,
  /(^|\/)\.pnpm(\/|$)/,
  /(^|\/)cache(\/|$)/,
  /(^|\/)\.cache(\/|$)/,
  /(^|\/)logs(\/|$)/,
  /-wal$/,
  /-shm$/,
  /\.lock$/,
  /\.tmp$/,
];
// The tarball backend also skips these local scratch files so they cannot make
// every sync look "changed" (the marker is rewritten each tick).
const SKIP_LOCAL = [ '.snapshot_marker', '.sync_fingerprint', ...SKIP ];
const skip = (p) => SKIP.some((re) => re.test(p.replace(/\\/g, '/')));
const skipLocal = (p) => SKIP_LOCAL.some((re) => re === p || (re instanceof RegExp && re.test(p.replace(/\\/g, '/'))));

// Cheap "did anything change" digest: path + size + mtime for every kept file.
// Tarring + uploading ~100MB every 60s on a free 512MB container would peg the
// CPU and slow the UI; this costs one stat per file and skips all of that when
// nothing moved.
//
// mtime is floored to whole SECONDS, not kept in ms: GNU tar truncates mtimes
// to 1-second granularity, so a ms-exact fingerprint would never match the tree
// restore just extracted — every cold boot would look "changed" and trigger a
// redundant ~100MB upload. At second granularity a restored tree fingerprints
// identically to the snapshot it came from, so a boot can seed the fingerprint
// and skip its first upload. Sub-second edits still get picked up by the next
// tick (60s), which is plenty.
function fingerprint() {
  const out = [];
  for (const abs of walk(HOME)) {
    const rel = relative(HOME, abs).split(sep).join('/');
    if (skipLocal(rel)) continue;
    let st;
    try { st = statSync(abs); } catch { continue; }
    out.push(`${rel}\0${st.size}\0${Math.floor(st.mtimeMs / 1000)}`);
  }
  return out.join('\n');
}

const FINGERPRINT_FILE = join(HOME, '.sync_fingerprint');

// ===========================================================================
// GitHub Releases backend
// ===========================================================================
const GH_API = 'https://api.github.com';
const GH_UPLOAD = 'https://uploads.github.com';
const ASSET_NAME = 'data.tar.gz';
const KEEP_RELEASES = 5;
const GH_HEADERS = {
  Authorization: `Bearer ${GH_TOKEN}`,
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'dsh-render-sync',
};

async function gh(method, url, body, extra = {}) {
  const res = await fetch(url, {
    method,
    headers: { ...GH_HEADERS, ...(extra.headers || {}) },
    body: body ?? undefined,
    signal: extra.signal,
    // Required by Node's fetch whenever the body is a stream.
    duplex: extra.duplex,
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* non-JSON (204, plain error) */ }
  return { ok: res.ok, status: res.status, json, text };
}

async function ghRestore() {
  console.log(`[sync] restoring ${HOME} from GitHub ${GH_REPO}`);
  await mkdirp(HOME);

  const releases = await listReleases();
  // Releases come back newest-first; take the first one that actually has the
  // asset (a partially-failed upload can leave an empty release behind).
  let rel = null;
  let asset = null;
  for (const r of releases) {
    const a = (r.assets || []).find((x) => x.name === ASSET_NAME);
    if (a) { rel = r; asset = a; break; }
  }
  if (!rel) {
    console.log('[sync] no snapshot asset yet — starting fresh');
    return;
  }

  const tarball = `/tmp/dsh-restore-${process.pid}.tar.gz`;
  await downloadAsset(asset.url, tarball);
  const sizeMB = (statSync(tarball).size / 1048576).toFixed(1);
  console.log(`[sync] downloaded ${ASSET_NAME} from ${rel.tag_name} (${sizeMB} MB)`);

  // Keep the extracted tree off HOME until the whole tarball is verified good,
  // so a truncated archive cannot half-overwrite live state.
  const staging = `/tmp/dsh-restore-stage-${process.pid}`;
  rmSync(staging, { recursive: true, force: true });
  await mkdirp(staging);
  const untar = spawnSync('tar', ['-xzf', tarball, '-C', staging]);
  rmSync(tarball, { force: true });
  if (untar.status !== 0) {
    console.error('[sync] archive is corrupt or incomplete; keeping current state');
    rmSync(staging, { recursive: true, force: true });
    return;
  }

  // NOTE: profiles/ and node_modules/ are excluded by the SKIP list at upload
  // time, but tar extraction trusts the archive. Drop any of those paths here
  // so a hand-edited (or malicious) archive can never clobber the repo-defined
  // profile that start.sh installs after us.
  pruneSkipped(staging);

  const r = spawnSync('cp', ['-a', `${staging}/.`, `${HOME}/`]);
  rmSync(staging, { recursive: true, force: true });
  if (r.status !== 0) {
    console.error('[sync] failed to stage the restored tree into place');
    return;
  }
  applyModes();
  // The release body carries the sha256 of the fingerprint the upload was built
  // from. Recompute locally and, if it still matches, seed the fingerprint file
  // so the first sync tick does not immediately re-upload the state we just
  // restored. Keeping only the hash in the body (not the fingerprint itself)
  // keeps the release body bounded no matter how many files DSH_HOME grows to.
  seedFingerprint(rel.body);
  console.log(`[sync] restored snapshot ${rel.tag_name}`);
}

// Streams an asset to disk. GitHub's API answers the browser_download_url with
// the raw bytes; reading it as text would UTF-8-decode the gzip stream and
// corrupt the archive, so this pipes the response body straight to a file.
async function downloadAsset(url, dest) {
  const res = await fetch(url, { headers: { ...GH_HEADERS, Accept: 'application/octet-stream' } });
  if (!res.ok || !res.body) throw new Error(`asset download HTTP ${res.status}`);
  await new Promise((resolve, reject) => {
    Readable.fromWeb(res.body)
      .on('error', reject)
      .pipe(createWriteStream(dest))
      .on('error', reject)
      .on('finish', resolve);
  });
}

async function ghSync() {
  // Marker first so a human inspecting the tree can tell "restored" from "new".
  writeFileSync(join(HOME, '.snapshot_marker'), new Date().toISOString() + '\n');

  const fp = fingerprint();
  try {
    const prev = readFileSync(FINGERPRINT_FILE, 'utf8');
    if (prev === fp) return; // nothing changed since the last successful upload
  } catch { /* no fingerprint yet */ }

  const tarball = await makeTarball();
  if (!tarball) return; // nothing to send (empty home)

  const size = statSync(tarball).size;
  // GitHub rejects assets above 2GB. Report it loudly instead of failing the
  // whole sync loop; the snapshot behind this one stays intact.
  if (size > 1900000000) {
    console.error(`[sync] tarball is ${(size / 1073741824).toFixed(2)} GB — over GitHub's 2GB asset limit; not uploading`);
    rmSync(tarball, { force: true });
    return;
  }
  console.log(`[sync] uploading ${ASSET_NAME} (${(size / 1048576).toFixed(1)} MB)`);

  // The tag doubles as the snapshot id. An ISO-ish stamp keeps releases
  // sortable and readable in the GitHub UI.
  const tag = `snapshot-${new Date().toISOString().replace(/[:.]/g, '')}`;
  const created = await gh('POST', `${GH_API}/repos/${GH_REPO}/releases`, JSON.stringify({
    tag_name: tag,
    name: tag,
    // Storing the fingerprint's sha256 (not the fingerprint itself) lets restore
    // skip an immediate re-upload while keeping the body tiny and bounded.
    body: JSON.stringify({ sha256: sha256(fp), files: fp ? fp.split('\n').length : 0 }),
    draft: false,
    prerelease: true,
  }), { headers: { 'Content-Type': 'application/json' } });
  if (!created.ok) {
    console.error(`[sync] release creation failed: HTTP ${created.status} ${shortErr(created)}`);
    rmSync(tarball, { force: true });
    return;
  }

  let releaseId = null;
  try {
    const up = await gh('POST', `${GH_UPLOAD}/repos/${GH_REPO}/releases/${created.json.id}/assets?name=${encodeURIComponent(ASSET_NAME)}`, createReadStream(tarball), {
      headers: { 'Content-Type': 'application/gzip', 'Content-Length': String(size) },
      // A stream body needs Node's fetch to treat the request as half-duplex.
      duplex: 'half',
    });
    if (!up.ok) throw new Error(`HTTP ${up.status} ${shortErr(up)}`);
  } catch (e) {
    // Anything thrown here (network blip, malformed request) still leaves an
    // EMPTY release behind, which restore would then mistake for a snapshot
    // with no data. listReleases skips asset-less releases, but leaving the
    // orphan means the repo drifts toward the prune cap of good snapshots, so
    // delete it here and keep the previous release as the newest.
    console.error(`[sync] asset upload failed (${e.message}); discarding partial release`);
    await gh('DELETE', `${GH_API}/repos/${GH_REPO}/releases/${created.json.id}`);
    rmSync(tarball, { force: true });
    return;
  }
  rmSync(tarball, { force: true });

  writeFileSync(FINGERPRINT_FILE, fp, { mode: 0o600 });

  // Keep only the newest KEEP_RELEASES snapshots so the repo does not grow
  // without bound (a free account's storage is not metered for release assets,
  // but an unbounded list makes finding the current one harder).
  await pruneOldReleases();
  console.log(`[sync] uploaded snapshot ${tag}`);
}

async function listReleases() {
  const r = await gh('GET', `${GH_API}/repos/${GH_REPO}/releases?per_page=100`);
  if (!r.ok) throw new Error(`list releases: HTTP ${r.status}`);
  return Array.isArray(r.json) ? r.json : [];
}

async function pruneOldReleases() {
  let releases;
  try { releases = await listReleases(); } catch (e) { console.error('[sync] prune skipped:', e.message); return; }
  // Newest-first already; anything past the keep window goes.
  for (const rel of releases.slice(KEEP_RELEASES)) {
    const del = await gh('DELETE', `${GH_API}/repos/${GH_REPO}/releases/${rel.id}`);
    if (!del.ok) { console.error(`[sync] could not delete old release ${rel.tag_name} (HTTP ${del.status})`); continue; }
    // Deleting a release leaves its tag behind; drop the ref too so tags do not
    // accumulate pointing at objects nothing references.
    const tagName = encodeURIComponent(rel.tag_name);
    const ref = await gh('DELETE', `${GH_API}/repos/${GH_REPO}/git/refs/tags/${tagName}`);
    if (!ref.ok && ref.status !== 404) console.error(`[sync] could not delete tag ${rel.tag_name} (HTTP ${ref.status})`);
  }
}

function shortErr(r) {
  const j = r.json || {};
  return (j.message || r.text || '').toString().replace(/\s+/g, ' ').slice(0, 160);
}

function sha256(s) {
  return createHash('sha256').update(s).digest('hex');
}

// On restore, recompute the fingerprint of the freshly-extracted tree and seed
// the local cache when it still matches the hash the upload was built from.
// Then the next sync tick short-circuits instead of re-uploading everything
// we just downloaded.
function seedFingerprint(body) {
  if (!body) return;
  let expected;
  try { expected = JSON.parse(body).sha256; } catch { return; }
  if (typeof expected !== 'string') return;
  const fp = fingerprint();
  if (sha256(fp) === expected) writeFileSync(FINGERPRINT_FILE, fp, { mode: 0o600 });
  else console.log('[sync] restored tree differs from snapshot fingerprint; next sync will re-upload');
}

// Build the tarball with the same SKIP filter restore applies, streaming through
// gzip(-1: speed over ratio — this runs on a weak free-plan CPU every minute).
// tar takes the file list on stdin (relative paths + the -C chdir) so we never
// have to materialize an argument list.
async function makeTarball() {
  const names = [];
  for (const abs of walk(HOME)) {
    const rel = relative(HOME, abs).split(sep).join('/');
    if (!skipLocal(rel)) names.push(rel);
  }
  if (!names.length) return null;

  const out = `/tmp/dsh-sync-${process.pid}.tar.gz`;
  const tar = spawnSync('tar', ['-czf', out, '-C', HOME, '--null', '-T', '-'], {
    input: names.join('\0'),
  });
  if (tar.status !== 0) {
    console.error('[sync] tar failed:', (tar.stderr || '').toString().split('\n')[0]);
    rmSync(out, { force: true });
    return null;
  }
  return out;
}

// Remove anything the SKIP list forbids from a freshly extracted tree. Used as
// defense in depth on restore (upload already filters these).
function pruneSkipped(root) {
  for (const abs of walk(root)) {
    const rel = relative(root, abs).split(sep).join('/');
    if (skip(rel)) rmSync(abs, { force: true });
  }
  // walk is file-only, so drop the now-empty directories too.
  spawnSync('find', [root, '-type', 'd', '-empty', '-delete']);
}

// ===========================================================================
// Supabase Storage backend (original per-file sync)
// ===========================================================================
const SUPA_API = `${SUPA_URL}/storage/v1`;
const SUPA_PREFIX = 'data/';
const SUPA_MARKER_KEY = `${SUPA_PREFIX}.snapshot_marker`;

async function supaList(prefix) {
  // The REST list API returns one "folder" level at a time, so recurse into
  // folder entries (they report metadata: null) until every file is found.
  const out = [];
  let marker = '';
  for (;;) {
    const body = JSON.stringify({ prefix, limit: 1000, ...(marker ? { marker } : {}) });
    const res = await fetch(`${SUPA_API}/object/list/${SUPA_BUCKET}`, {
      method: 'POST',
      headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}`, 'Content-Type': 'application/json' },
      body,
    });
    if (!res.ok) throw new Error(`list ${prefix} failed: HTTP ${res.status}`);
    const items = await res.json();
    if (!Array.isArray(items)) break;
    for (const it of items) {
      const name = it.get?.('name') ?? it.name;
      if (!name) continue;
      // The API returns names relative to the prefix we passed, so rebuild the
      // full key here — callers key objects by their full path.
      if (it.metadata == null) {
        out.push(...(await supaList(`${prefix}${name}/`)));
      } else if (!skip(`${prefix}${name}`)) {
        out.push(`${prefix}${name}`);
      }
    }
    marker = items.marker || '';
    if (!marker) break;
  }
  return out;
}

async function supaRestore() {
  console.log(`[sync] restoring ${HOME} from bucket ${SUPA_BUCKET}`);
  await mkdirp(HOME);

  let markerRes;
  try {
    markerRes = await fetch(`${SUPA_API}/object/${SUPA_BUCKET}/${SUPA_MARKER_KEY}`, {
      headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` },
    });
  } catch (e) {
    console.error('[sync] bucket unreachable:', e.message);
    return;
  }
  if (!markerRes.ok) {
    console.log(`[sync] no snapshot in bucket (HTTP ${markerRes.status}) — starting fresh`);
    return;
  }

  let names = [];
  try {
    names = await supaList(SUPA_PREFIX);
  } catch (e) {
    console.error('[sync] listing failed:', e.message);
    return;
  }

  let count = 0;
  for (const name of names) {
    if (name === SUPA_MARKER_KEY) continue;
    const rel = name.slice(SUPA_PREFIX.length);
    if (!rel || skip(rel)) continue;
    const dest = join(HOME, rel);
    await mkdirp(dirname(dest));
    const res = await fetch(`${SUPA_API}/object/${SUPA_BUCKET}/${name}`, {
      headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` },
    });
    if (!res.ok) {
      console.error(`[sync] failed to restore ${rel}: HTTP ${res.status}`);
      continue;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    writeFileSync(dest, buf, { mode: 0o600 });
    count++;
  }
  applyModes();
  console.log(`[sync] restored ${count} file(s)`);
}

async function supaSync() {
  // Marker first so a restore can tell "empty bucket" from "not yet synced".
  writeFileSync(join(HOME, '.snapshot_marker'), new Date().toISOString() + '\n');

  const files = walk(HOME);
  let count = 0;
  let failed = 0;
  for (const abs of files) {
    const rel = relative(HOME, abs).split(sep).join('/');
    if (skip(rel)) continue; // .snapshot_marker IS uploaded: restore looks for it
    const key = `${SUPA_PREFIX}${rel}`;
    const buf = readFileSync(abs);
    const res = await fetch(`${SUPA_API}/object/${SUPA_BUCKET}/${key}`, {
      method: 'POST',
      headers: {
        apikey: SUPA_KEY,
        Authorization: `Bearer ${SUPA_KEY}`,
        'Content-Type': 'application/octet-stream',
        'x-upsert': 'true',
      },
      body: buf,
    });
    if (res.ok) count++;
    else {
      failed++;
      console.error(`[sync] upload failed: ${rel} (HTTP ${res.status})`);
    }
  }
  console.log(`[sync] uploaded ${count} file(s)${failed ? `, ${failed} failed` : ''}`);
}

// ===========================================================================
// shared helpers
// ===========================================================================

// Storage does not carry unix modes, so set them explicitly here. dsh refuses
// to boot when .credentials.yaml is group/world readable, and restored files
// otherwise land at 644 (the umask default of the node fs API). The tarball
// backend also relies on this: gzip preserves the archive bytes, not the modes
// the writer intended, so normalize the same way both backends do.
function applyModes() {
  for (const abs of walk(HOME)) {
    const rel = relative(HOME, abs).split(sep).join('/');
    if (!rel || skip(rel)) continue;
    try {
      if (rel.startsWith('.') || rel.endsWith('.yaml') || rel.endsWith('.yml') || rel.endsWith('.json')) {
        chmod(abs, 0o600);
      } else {
        chmod(abs, 0o644);
      }
    } catch { /* missing file already reported above */ }
  }
}

function walk(dir, acc = []) {
  let entries = [];
  try {
    entries = spawnSync('ls', ['-A', dir]).stdout.toString().split('\n').filter(Boolean);
  } catch {
    return acc;
  }
  for (const e of entries) {
    const p = join(dir, e);
    let st;
    try {
      st = statSync(p);
    } catch {
      continue;
    }
    if (st.isDirectory()) walk(p, acc);
    else if (st.isFile()) acc.push(p);
  }
  return acc;
}

async function mkdirp(dir) {
  spawnSync('mkdir', ['-p', dir]);
}

const cmd = process.argv[2];
if (cmd === 'restore') {
  (USE_GH ? ghRestore() : supaRestore()).catch((e) => { console.error('[sync]', e.message); process.exit(1); });
} else if (cmd === 'sync') {
  (USE_GH ? ghSync() : supaSync()).catch((e) => { console.error('[sync]', e.message); process.exit(1); });
} else {
  console.error('usage: sync.js {restore|sync}');
  process.exit(1);
}
