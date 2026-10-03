#!/usr/bin/env node
// Sync $DSH_HOME (default /data) to a Supabase Storage bucket over the REST API.
//
// dsh on Render's free plan has no persistent disk, so settings/sessions would
// be wiped on every redeploy and sleep/wake. This script:
//   restore  - download the latest snapshot from the bucket into DSH_HOME
//   sync     - upload the current DSH_HOME back to the bucket
//
// Uses the Storage REST API (not the S3 compat endpoint): the S3 Connection
// keys the project exposes are a different credential pair, while the REST API
// works with the project's own service key.

import { createWriteStream, createReadStream, readFileSync, writeFileSync, statSync, chmodSync as chmod } from 'node:fs';
import { join, dirname, relative, sep } from 'node:path';
import { spawnSync } from 'node:child_process';

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_KEY;
const BUCKET = process.env.SUPABASE_BUCKET;
const HOME = process.env.DSH_HOME || '/data';
const PREFIX = 'data/';

if (!URL || !KEY || !BUCKET) {
  console.error('[sync] SUPABASE_URL, SUPABASE_SERVICE_KEY and SUPABASE_BUCKET are required');
  process.exit(1);
}

const API = `${URL}/storage/v1`;
const MARKER_KEY = `${PREFIX}.snapshot_marker`;

// Regenerable/heavy trees — never transfer them. logs/ holds a startup
// diagnostic file per boot attempt; with the crash-loop before the chmod fix
// this grew fast, and they carry no state worth persisting across redeploys.
const SKIP = [
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
const skip = (p) => SKIP.some((re) => re.test(p.replace(/\\/g, '/')));

async function list(prefix) {
  // The REST list API returns one "folder" level at a time, so recurse into
  // folder entries (they report metadata: null) until every file is found.
  const out = [];
  let marker = '';
  for (;;) {
    const body = JSON.stringify({ prefix, limit: 1000, ...(marker ? { marker } : {}) });
    const res = await fetch(`${API}/object/list/${BUCKET}`, {
      method: 'POST',
      headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
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
        // Folder: descend into it.
        out.push(...(await list(`${prefix}${name}/`)));
      } else if (!skip(`${prefix}${name}`)) {
        out.push(`${prefix}${name}`);
      }
    }
    marker = items.marker || '';
    if (!marker) break;
  }
  return out;
}

async function restore() {
  console.log(`[sync] restoring ${HOME} from bucket ${BUCKET}`);
  await mkdirp(HOME);

  let markerRes;
  try {
    markerRes = await fetch(`${API}/object/${BUCKET}/${MARKER_KEY}`, {
      headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
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
    names = await list(PREFIX);
  } catch (e) {
    console.error('[sync] listing failed:', e.message);
    return;
  }

  let count = 0;
  for (const name of names) {
    if (name === MARKER_KEY) continue;
    const rel = name.slice(PREFIX.length);
    if (!rel || skip(rel)) continue;
    const dest = join(HOME, rel);
    await mkdirp(dirname(dest));
    const res = await fetch(`${API}/object/${BUCKET}/${name}`, {
      headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
    });
    if (!res.ok) {
      console.error(`[sync] failed to restore ${rel}: HTTP ${res.status}`);
      continue;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    writeFileSync(dest, buf, { mode: 0o600 });
    count++;
  }
  // Storage does not carry unix modes, so set them explicitly here. dsh refuses
  // to boot when .credentials.yaml is group/world readable, and restored files
  // otherwise land at 644 (the umask default of the node fs API).
  for (const name of names) {
    const rel = name.slice(PREFIX.length);
    if (!rel || skip(rel)) continue;
    const dest = join(HOME, rel);
    try {
      if (rel.startsWith('.') || rel.endsWith('.yaml') || rel.endsWith('.yml') || rel.endsWith('.json')) {
        chmod(dest, 0o600);
      } else {
        chmod(dest, 0o644);
      }
    } catch { /* missing file already reported above */ }
  }
  console.log(`[sync] restored ${count} file(s)`);
}

async function syncUp() {
  // Marker first so a restore can tell "empty bucket" from "not yet synced".
  writeFileSync(join(HOME, '.snapshot_marker'), new Date().toISOString() + '\n');

  const files = walk(HOME);
  let count = 0;
  let failed = 0;
  for (const abs of files) {
    const rel = relative(HOME, abs).split(sep).join('/');
    if (skip(rel)) continue; // .snapshot_marker IS uploaded: restore looks for it
    const key = `${PREFIX}${rel}`;
    const buf = readFileSync(abs);
    const res = await fetch(`${API}/object/${BUCKET}/${key}`, {
      method: 'POST',
      headers: {
        apikey: KEY,
        Authorization: `Bearer ${KEY}`,
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
  restore().catch((e) => { console.error('[sync]', e.message); process.exit(1); });
} else if (cmd === 'sync') {
  syncUp().catch((e) => { console.error('[sync]', e.message); process.exit(1); });
} else {
  console.error('usage: sync.js {restore|sync}');
  process.exit(1);
}
