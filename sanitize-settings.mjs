#!/usr/bin/env node
// Clamp model maxTokens to what each provider actually accepts.
//
// Atria's API rejects max_tokens above 65536 with
// "max_tokens must be an integer between 1 and 65536", which takes the whole
// request down (and, surfaced through the agent loop, fails the turn). A
// settings snapshot that was written while another provider's larger limit was
// configured — or a manual edit — can carry an oversized value into /data on
// restore. Clamp it before dsh boots.
//
// Runs after sync.js restore and only rewrites the file when something changed.

import { readFileSync, writeFileSync, statSync, chmodSync, realpathSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';

// js-yaml is not installed at /app; resolve it from the dsh CLI package's own
// node_modules so no extra dependency or NODE_PATH plumbing is needed.
function loadYaml() {
  const tried = [];
  const candidates = [];
  const dshBin = (() => { try { return realpathSync(execSync('command -v dsh').toString().trim()); } catch { return null; } })();
  if (dshBin) candidates.push(join(dirname(dshBin), '..', 'node_modules'));
  candidates.push(join(dirname(process.execPath), 'lib', 'node_modules', '@deepseek-ai', 'dsh', 'node_modules'));
  for (const dir of candidates) {
    tried.push(dir);
    try {
      const require = createRequire(join(dir, 'noop.js'));
      const mod = require('js-yaml');
      return { load: mod.load, dump: mod.dump };
    } catch { /* next candidate */ }
  }
  throw new Error(`js-yaml not found under any of: ${tried.join(', ')}`);
}

const { load: parse, dump: stringify } = loadYaml();

const HOME = process.env.DSH_HOME || '/data';
const FILE = join(HOME, 'settings.yaml');

// Hard ceiling per provider. Providers not listed here are left alone.
const CEILINGS = {
  // api.atria-asi.ai: "max_tokens must be an integer between 1 and 65536"
  atria: 65536,
  atria2: 65536,
  atria3: 65536,
  atria4: 65536,
};

const clamp = (value, ceiling) => Math.min(value, ceiling);

function sanitize(doc) {
  let changed = 0;
  const providers = doc?.['llm-pi-ai']?.providers;
  if (!providers || typeof providers !== 'object') return { changed };
  for (const [name, provider] of Object.entries(providers)) {
    const ceiling = CEILINGS[name];
    if (ceiling === undefined || !Array.isArray(provider.models)) continue;
    for (const model of provider.models) {
      if (typeof model.maxTokens === 'number' && model.maxTokens > ceiling) {
        const before = model.maxTokens;
        model.maxTokens = clamp(model.maxTokens, ceiling);
        console.log(`[settings-fix] ${name}/${model.id}: maxTokens ${before} -> ${model.maxTokens}`);
        changed++;
      }
    }
  }
  return { changed };
}

try {
  const stats = statSync(FILE);
  const text = readFileSync(FILE, 'utf8');
  const doc = parse(text);
  if (!doc) {
    console.log('[settings-fix] settings.yaml is empty or not a mapping; nothing to do');
    process.exit(0);
  }
  const { changed } = sanitize(doc);
  if (changed === 0) {
    console.log('[settings-fix] all maxTokens within provider limits; no change');
    process.exit(0);
  }
  writeFileSync(FILE, stringify(doc), 'utf8');
  // Preserve the original mode: dsh refuses group/world-readable config.
  chmodSync(FILE, stats.mode);
  console.log(`[settings-fix] clamped ${changed} model(s) and wrote ${FILE}`);
} catch (error) {
  if (error.code === 'ENOENT') {
    console.log('[settings-fix] no settings.yaml yet; nothing to clamp');
    process.exit(0);
  }
  console.error(`[settings-fix] failed: ${error.message}`);
  process.exit(0); // non-fatal: never block the boot over a settings tweak
}
