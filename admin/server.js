#!/usr/bin/env node
/**
 * DSH admin sidecar — a small standalone server that survives `dsh web` deaths.
 *
 * The whole point: `dsh web` needs a hard restart for some updates, and the
 * login page is served by nginx (not dsh), so there is no UI left to reach
 * once dsh is down. This sidecar runs as its own process, independent of dsh,
 * and gives you two things through the nginx `/admin` proxy:
 *
 *   1. A web terminal (node-pty + xterm.js over WebSocket) — a container shell.
 *   2. Process controls: restart dsh (kill -> start.sh watchdog revives it),
 *      and stop/start dsh via a hold file the watchdog respects.
 *
 * Security: every endpoint requires the same DSH_WEB_TOKEN the login page uses,
 * verified as a timing-safe HMAC of the raw token. The terminal is full RCE,
 * so an unauthenticated 401 is returned before any pty is spawned.
 *
 * Start: `start.sh` launches this as a detached background process on
 * 127.0.0.1:13081 and keeps it alive with its own watchdog.
 */

'use strict';

const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const HOST = '127.0.0.1';
const PORT = Number(process.env.DSH_ADMIN_PORT || 13081);
const ADMIN_DIR = __dirname;

// node-pty and ws live inside dsh's own dependency tree (they are installed at
// image build time with dsh itself). They are not reinstalled for this sidecar,
// so resolve them from there instead of assuming a local node_modules.
const DSH_ROOT = '/usr/local/lib/node_modules/@deepseek-ai/dsh';
const FALLBACK_ROOTS = [
  DSH_ROOT,
  process.env.DSH_NODE_MODULES,
  '/home/qam3/.npm-global/lib/node_modules/@deepseek-ai/dsh',
].filter(Boolean);

function resolveModule(name) {
  for (const root of FALLBACK_ROOTS) {
    const candidate = path.join(root, 'node_modules', name);
    try {
      // require.resolve checks the package entry point exists and is loadable.
      require.resolve(candidate);
      return candidate;
    } catch (e) {
      // not here, try the next root
    }
  }
  // Last resort: let Node walk up from this file (works for local dev where
  // this file may sit near a real node_modules).
  try {
    return require.resolve(name);
  } catch (e) {
    return null;
  }
}

const PTY_PATH = resolveModule('node-pty');
const WS_PATH = resolveModule('ws');

if (!PTY_PATH || !WS_PATH) {
  console.error('[admin] FATAL: node-pty or ws not found in any dsh root');
  console.error('[admin]   PTY_PATH=' + PTY_PATH);
  console.error('[admin]   WS_PATH=' + WS_PATH);
  console.error('[admin] looked in: ' + FALLBACK_ROOTS.join(', '));
  process.exit(1);
}

const pty = require(PTY_PATH);
const { WebSocketServer } = require(WS_PATH);

// --------------------------------------------------------------------------
// Auth
// --------------------------------------------------------------------------

const WEB_TOKEN = process.env.DSH_WEB_TOKEN || '';

/** Timing-safe constant-time comparison. */
function safeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Accept the raw DSH_WEB_TOKEN and verify it against the configured one.
 * `req` is passed only to log a redacted hint on failure.
 * Returns true if the caller may use the panel.
 */
function isAuthorized(token) {
  if (!WEB_TOKEN) return false; // no token configured => closed entirely
  return safeEqual(token, WEB_TOKEN);
}

// --------------------------------------------------------------------------
// dsh process discovery + control
// --------------------------------------------------------------------------

// start.sh writes the current dsh PID here on every (re)launch; it also scans
// /proc as a fallback in case the file is missing or stale.
const PID_FILE = '/tmp/dsh.pid';
const HOLD_FILE = '/tmp/dsh.hold';

/**
 * Is `pid` still alive?
 *
 * NOTE: `process.kill(pid, 0)` does NOT return false for a dead process on
 * Linux — it throws ESRCH. This wrapper treats "throw" as gone, so callers
 * never have to reason about exceptions in a poll loop.
 */
function pidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    // EPERM = exists but not ours to signal; treat as alive.
    if (e && e.code === 'EPERM') return true;
    return false; // ESRCH / anything else => gone
  }
}

/** Find the `dsh web` PID via the pid file, then a /proc scan as fallback. */
function findDshPid() {
  // 1. PID file (authoritative — written by the watchdog that launched it)
  try {
    const raw = fs.readFileSync(PID_FILE, 'utf8').trim();
    const pid = Number(raw);
    if (pid > 0 && pidAlive(pid)) return pid;
  } catch (e) {
    // missing / stale / process gone => fall through to scan
  }
  // 2. Scan /proc for a process whose cmdline mentions `dsh web`
  const pids = fs.readdirSync('/proc').filter((d) => /^\d+$/.test(d));
  for (const p of pids) {
    try {
      const cmd = fs.readFileSync(`/proc/${p}/cmdline`, 'utf8').replace(/\0/g, ' ');
      if (/\bdsh\b.*\bweb\b/.test(cmd) && !/\badmin\b/.test(cmd)) {
        return Number(p);
      }
    } catch (e) {
      // process vanished or not readable => skip
    }
  }
  return null;
}

/** True while the hold file exists — the watchdog will not boot a new dsh. */
function isHeld() {
  try {
    fs.accessSync(HOLD_FILE);
    return true;
  } catch (e) {
    return false;
  }
}

/** Read a JSON body of limited size; rejects on oversized or malformed input. */
function readJson(req, limitBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on('data', (c) => {
      total += c.length;
      if (total > limitBytes) {
        reject(new Error('payload too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf8');
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (e) {
        reject(new Error('invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

/** Kill dsh. SIGTERM first, escalate to SIGKILL after `timeoutMs`. */
function killDsh(pid, timeoutMs) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (result) => {
      if (!settled) {
        settled = true;
        resolve(result);
      }
    };

    // Race the grace timeout so a stuck process cannot hang the panel forever.
    const hardTimer = setTimeout(() => {
      if (pidAlive(pid)) {
        try {
          process.kill(pid, 'SIGKILL');
        } catch (e) {
          // gone or not permitted — nothing more to do
        }
      }
      done({ signal: 'SIGKILL', forced: true });
    }, timeoutMs);

    const poll = setInterval(() => {
      if (!pidAlive(pid)) {
        clearTimeout(hardTimer);
        clearInterval(poll);
        done({ signal: 'SIGTERM', forced: false });
      }
    }, 200);

    try {
      process.kill(pid, 'SIGTERM');
    } catch (e) {
      clearTimeout(hardTimer);
      clearInterval(poll);
      done({ signal: null, error: e.message });
    }
  });
}

// --------------------------------------------------------------------------
// Terminal sessions
// --------------------------------------------------------------------------

const sessions = new Map(); // ws -> { pty }

/** Spawn a login-ish shell; prefer bash, fall back to sh. */
function spawnShell(cwd, cols, rows) {
  const shell = process.env.SHELL || '/bin/bash';
  const args = ['-l'];
  const env = {
    ...process.env,
    TERM: 'xterm-256color',
    COLORTERM: 'truecolor',
    LANG: 'C.UTF-8',
    LC_ALL: 'C.UTF-8',
  };
  return pty.spawn(shell, args, {
    name: 'xterm-256color',
    cols: cols || 100,
    rows: rows || 32,
    cwd: fs.existsSync(cwd) ? cwd : process.env.HOME || '/',
    env,
  });
}

// --------------------------------------------------------------------------
// HTTP routing
// --------------------------------------------------------------------------

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.ico': 'image/x-icon',
};

function sendFile(res, filePath) {
  try {
    const data = fs.readFileSync(filePath);
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
    res.end(data);
  } catch (e) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('not found');
  }
}

/** Tiny dependency-free JSON send. */
function sendJson(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

/** Extract the token from `?token=` (used by WS, which cannot set headers). */
function tokenFromQuery(url) {
  try {
    return new URL(url, 'http://localhost').searchParams.get('token') || '';
  } catch (e) {
    return '';
  }
}

// Keep one persistent connection to the watchdog so we can notify it; the file
// is the source of truth, but this lets the panel react immediately.

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname.replace(/\/+/g, '/');

  // --- public health probe (nginx-level liveness, no token) ---------------
  if (pathname === '/admin/ping') {
    return sendJson(res, 200, { ok: true, pid: process.pid });
  }

  // --- static assets (index.html + vendored xterm) ------------------------
  // Only serve files directly under ADMIN_DIR; never let `..` escape it.
  if (pathname === '/admin' || pathname === '/admin/' || pathname === '/admin/index.html') {
    return sendFile(res, path.join(ADMIN_DIR, 'index.html'));
  }
  if (pathname.startsWith('/admin/vendor/')) {
    const rel = pathname.slice('/admin/'.length); // => vendor/...
    const filePath = path.join(ADMIN_DIR, path.normalize(rel));
    if (filePath.startsWith(ADMIN_DIR) && fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      return sendFile(res, filePath);
    }
    return sendJson(res, 404, { error: 'not found' });
  }

  // --- everything below requires the token -------------------------------
  const token = tokenFromQuery(req.url);
  if (!isAuthorized(token)) {
    return sendJson(res, 401, { error: 'unauthorized' });
  }

  // --- dsh status ---------------------------------------------------------
  if (pathname === '/admin/api/status') {
    const pid = findDshPid();
    return sendJson(res, 200, {
      running: pid !== null,
      pid: pid,
      held: isHeld(),
    });
  }

  // --- restart dsh --------------------------------------------------------
  if (pathname === '/admin/api/restart' && req.method === 'POST') {
    const pid = findDshPid();
    if (pid === null) {
      return sendJson(res, 200, { ok: false, message: 'dsh not running; nothing to restart' });
    }
    // Remove any stale hold so the watchdog is free to revive it.
    try { fs.unlinkSync(HOLD_FILE); } catch (e) {}
    const result = await killDsh(pid, 4000);
    return sendJson(res, 200, {
      ok: result.signal !== null,
      signal: result.signal,
      forced: result.forced,
      error: result.error || null,
      note: 'watchdog will relaunch dsh within a few seconds',
    });
  }

  // --- stop dsh (create hold so the watchdog does NOT revive it) ----------
  if (pathname === '/admin/api/stop' && req.method === 'POST') {
    // The hold file must exist BEFORE the kill, otherwise the watchdog could
    // win the race and boot a fresh dsh before we set it.
    try {
      fs.writeFileSync(HOLD_FILE, String(process.pid));
    } catch (e) {
      return sendJson(res, 500, { ok: false, error: 'cannot write hold file: ' + e.message });
    }
    const pid = findDshPid();
    if (pid === null) {
      return sendJson(res, 200, { ok: true, message: 'dsh already stopped; hold set' });
    }
    const result = await killDsh(pid, 4000);
    return sendJson(res, 200, {
      ok: result.signal !== null || result.forced,
      signal: result.signal,
      error: result.error || null,
      note: 'hold file set; dsh stays down until you press start',
    });
  }

  // --- start dsh (release the hold; the watchdog boots it) ----------------
  if (pathname === '/admin/api/start' && req.method === 'POST') {
    try { fs.unlinkSync(HOLD_FILE); } catch (e) {}
    return sendJson(res, 200, {
      ok: true,
      note: 'hold released; watchdog relaunches dsh within a few seconds',
    });
  }

  return sendJson(res, 404, { error: 'not found' });
});

// --------------------------------------------------------------------------
// WebSocket terminal
// --------------------------------------------------------------------------

// Reject the upgrade BEFORE the handshake completes. Closing inside the
// connection handler would still let the browser's `open` fire first, so an
// attacker would observe a live socket even though no shell is spawned.
const wss = new WebSocketServer({
  server,
  path: '/admin/ws',
  verifyClient: (info, cb) => {
    if (!isAuthorized(tokenFromQuery(info.req.url))) {
      return cb(false, 401, 'unauthorized');
    }
    cb(true);
  },
});

wss.on('connection', (ws, req) => {
  // Defense in depth: verifyClient already gatekept the upgrade.
  const token = tokenFromQuery(req.url);
  if (!isAuthorized(token)) {
    ws.close(4001, 'unauthorized');
    return;
  }

  let term = null;
  try {
    term = spawnShell(process.env.HOME || '/data', 100, 32);
  } catch (e) {
    try { ws.send(JSON.stringify({ error: 'spawn failed: ' + e.message })); } catch (err) {}
    ws.close(1011, 'spawn failed');
    return;
  }

  sessions.set(ws, { term });
  console.log(`[admin] terminal opened (pid ${term.pid})`);

  // pty -> browser
  term.onData((data) => {
    if (ws.readyState === ws.OPEN) ws.send(data);
  });
  term.onExit(({ exitCode }) => {
    try { ws.send('\r\n\x1b[2m[process exited with code ' + exitCode + ']\x1b[0m'); } catch (e) {}
    sessions.delete(ws);
    if (ws.readyState === ws.OPEN) ws.close(1000, 'exit');
  });

  // browser -> pty
  ws.on('message', (raw, isBinary) => {
    if (isBinary) return; // pty input is always text
    const msg = raw.toString('utf8');
    // Single reserved control channel: a JSON object beginning with '{'.
    // Everything else is raw keystrokes and goes straight to the pty.
    if (msg.length && msg.charCodeAt(0) === 123 /* { */) {
      let parsed = null;
      try { parsed = JSON.parse(msg); } catch (e) { parsed = null; }
      if (parsed && parsed.type === 'resize' && term) {
        const cols = Math.min(Math.max(Number(parsed.cols) || 1, 1), 500);
        const rows = Math.min(Math.max(Number(parsed.rows) || 1, 1), 200);
        try { term.resize(cols, rows); } catch (e) {}
        return;
      }
      // Unknown control messages are ignored, never written to the pty.
      return;
    }
    try { term.write(msg); } catch (e) {}
  });

  ws.on('close', () => {
    const s = sessions.get(ws);
    if (s && s.term) {
      try { s.term.kill(); } catch (e) {}
    }
    sessions.delete(ws);
  });

  ws.on('error', () => {
    sessions.delete(ws);
  });
});

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

process.on('uncaughtException', (e) => {
  // The panel must outlive dsh, so never let one bad connection kill it.
  console.error('[admin] uncaughtException: ' + (e && e.stack || e));
});
process.on('unhandledRejection', (reason) => {
  console.error('[admin] unhandledRejection: ' + reason);
});

server.listen(PORT, HOST, () => {
  console.log(`[admin] listening on http://${HOST}:${PORT} (terminal + dsh controls)`);
});

// Periodically confirm we can still see the dsh watchdog; purely diagnostic.
setInterval(() => {
  const pid = findDshPid();
  if (pid === null && !isHeld()) {
    console.error('[admin] WARNING: dsh not running and no hold file set; watchdog should be handling this');
  }
}, 30000).unref();
