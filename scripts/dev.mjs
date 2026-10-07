#!/usr/bin/env node
/**
 * Starts everything fs-pro needs for a browser session, in one terminal:
 *
 *   Postgres (fs-pro + imagination containers)
 *   Imaginations API      :3003  (login / auth)          ../imagination
 *   Worldgen service      :3004  (player faces)          ../imagination
 *   Sim service           :5050  (Rust match engine)     services/sim-service
 *   Realtime gateway      :3005  (presence, live events) apps/fs-pro-realtime
 *   Game server           :3000  (Node API)              apps/fs-pro-server
 *   Client                :8080  (open this one)         apps/fs-pro-client
 *
 *   npm run dev:all                 start everything
 *   npm run dev:all -- --open       ...and open the client in the browser
 *   npm run dev:all -- --skip=img-api,worldgen
 *   npm run dev:all -- --no-docker  don't touch the Postgres containers
 *
 * A service whose port is already in use is assumed to be running and is
 * skipped. Ctrl+C stops everything this script started.
 *
 * Environment: each service gets ITS OWN repo's .env, never another's -
 * fs-pro's and imagination's .env both define DATABASE_URL (and fs-pro's
 * PORT is the game server's), so inheriting the wrong one points a service
 * at the wrong database or port. The npm scripts load fs-pro's .env
 * themselves (dotenv-cli); imagination's is loaded here for its services.
 * Variables already set in your shell win over any .env.
 */

import { execSync, spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import net from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';

const FSPRO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const IMAGINATION = resolve(FSPRO, '..', 'imagination');
const isWin = process.platform === 'win32';

const args = process.argv.slice(2);
const skip = new Set(
  (args.find((a) => a.startsWith('--skip='))?.slice('--skip='.length) ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
);
const openBrowser = args.includes('--open');
const useDocker = !args.includes('--no-docker');

const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  gray: '\x1b[90m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};
const log = (msg) => console.log(`${C.gray}[dev]${C.reset} ${msg}`);
const warn = (msg) => console.log(`${C.yellow}[dev] ${msg}${C.reset}`);

function loadEnvFile(dir) {
  const file = resolve(dir, '.env');
  if (!existsSync(file)) return {};
  try {
    return parseEnv(readFileSync(file, 'utf8'));
  } catch (e) {
    warn(`could not parse ${file}: ${e.message}`);
    return {};
  }
}

/** `defaults` from a .env, overridden by the real environment, then `fixed`
 * (ports this script assigns - never inherited). */
function envFor(defaults, fixed = {}) {
  return { ...defaults, ...process.env, ...fixed, FORCE_COLOR: '1' };
}

const imaginationEnv = loadEnvFile(IMAGINATION);
const npm = isWin ? 'npm.cmd' : 'npm';

const services = [
  {
    id: 'img-api',
    name: 'IMG-API',
    color: C.cyan,
    port: 3003,
    cwd: IMAGINATION,
    cmd: 'go',
    args: ['run', './cmd/api'],
    env: envFor(imaginationEnv, { API_ADDR: '127.0.0.1:3003' }),
    what: 'Imaginations API (login)',
    needs: [IMAGINATION],
  },
  {
    id: 'worldgen',
    name: 'WORLDGEN',
    color: C.blue,
    port: 3004,
    cwd: IMAGINATION,
    cmd: 'go',
    args: ['run', './cmd/worldgen-service'],
    env: envFor(imaginationEnv, { PORT: '3004' }),
    what: 'Worldgen (player faces)',
    needs: [IMAGINATION],
  },
  {
    id: 'sim',
    name: 'SIM',
    color: C.magenta,
    port: 5050,
    cwd: resolve(FSPRO, 'services', 'sim-service'),
    cmd: 'go',
    args: ['run', '.'],
    env: envFor({}, { PORT: '5050', SIM_SERVICE_PORT: '5050' }),
    what: 'Sim service (Rust engine)',
    before: buildEngine,
  },
  {
    id: 'realtime',
    name: 'REALTIME',
    color: C.yellow,
    port: 3005,
    cwd: resolve(FSPRO, 'apps', 'fs-pro-realtime'),
    cmd: 'go',
    args: ['run', '.'],
    env: envFor({}, { REALTIME_PORT: '3005' }),
    what: 'Realtime gateway',
  },
  {
    id: 'server',
    name: 'SERVER',
    color: C.green,
    port: 3000,
    cwd: FSPRO,
    cmd: npm,
    args: ['run', 'dev:server'],
    env: envFor({}),
    what: 'Game server (API)',
  },
  {
    id: 'client',
    name: 'CLIENT',
    color: C.red,
    port: 8080,
    cwd: FSPRO,
    cmd: npm,
    args: ['run', 'dev:client'],
    env: envFor({}),
    what: 'Client - open this',
    url: 'http://localhost:8080',
  },
];

// ---------------------------------------------------------------------

function portOpenOn(port, host) {
  return new Promise((done) => {
    const socket = net.connect({ port, host });
    socket.setTimeout(500);
    socket.once('connect', () => (socket.destroy(), done(true)));
    socket.once('error', () => done(false));
    socket.once('timeout', () => (socket.destroy(), done(false)));
  });
}

/** Listening on IPv4 or IPv6 loopback - Vite binds `localhost`, which is
 * ::1 only on recent Node. */
async function portOpen(port) {
  return (await portOpenOn(port, '127.0.0.1')) || (await portOpenOn(port, '::1'));
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForPort(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await portOpen(port)) return true;
    await sleep(500);
  }
  return false;
}

function have(cmd) {
  try {
    execSync(isWin ? `where ${cmd}` : `command -v ${cmd}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/** Ensures the fs-pro and imagination Postgres containers are up and ready. */
async function startDatabases() {
  if (!useDocker) return;
  if (!have('docker')) {
    warn('docker not found - skipping Postgres containers (use --no-docker to silence)');
    return;
  }
  const running = () => {
    try {
      return execSync('docker ps --format "{{.Names}}"', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
        .split(/\r?\n/)
        .filter(Boolean);
    } catch {
      return [];
    }
  };
  for (const [label, dir, match] of [
    ['fs-pro', FSPRO, 'fs-pro-db'],
    ['imagination', IMAGINATION, 'imagination-db'],
  ]) {
    if (!existsSync(dir)) continue;
    if (!running().some((n) => n.includes(match))) {
      log(`starting ${label} Postgres (docker compose up -d)...`);
      try {
        execSync('docker compose up -d', { cwd: dir, stdio: 'inherit' });
      } catch (e) {
        warn(`could not start ${label} Postgres: ${e.message}`);
        continue;
      }
    }
    const container = running().find((n) => n.includes(match));
    if (!container) continue;
    const deadline = Date.now() + 60_000;
    let ready = false;
    while (Date.now() < deadline && !ready) {
      try {
        execSync(`docker exec ${container} pg_isready`, { stdio: 'ignore' });
        ready = true;
      } catch {
        await sleep(1000);
      }
    }
    log(ready ? `${label} Postgres ready (${container})` : `${C.yellow}${label} Postgres not ready after 60s${C.reset}`);
  }
}

/** The sim service runs the Rust engine - build it first (quick when nothing
 * changed). Without cargo the game server falls back to its own engine. */
function buildEngine() {
  if (!have('cargo')) {
    warn('cargo not found - the sim service needs crates/sim-core built; the game server will fall back to its in-process engine');
    return false;
  }
  log('building the Rust engine (cargo build --release)...');
  try {
    execSync('cargo build --release', { cwd: resolve(FSPRO, 'crates', 'sim-core'), stdio: 'inherit' });
    return true;
  } catch {
    warn('Rust engine build failed - skipping the sim service');
    return false;
  }
}

// ---------------------------------------------------------------------

const children = [];
let shuttingDown = false;

function prefixLines(stream, prefix) {
  let buffered = '';
  stream.on('data', (chunk) => {
    buffered += chunk.toString();
    const lines = buffered.split(/\r?\n/);
    buffered = lines.pop();
    for (const line of lines) if (line.trim()) console.log(`${prefix} ${line}`);
  });
  stream.on('end', () => buffered.trim() && console.log(`${prefix} ${buffered}`));
}

function start(s) {
  const prefix = `${s.color}${s.name.padEnd(8)}${C.reset}${C.gray}|${C.reset}`;
  const child = spawn(s.cmd, s.args, {
    cwd: s.cwd,
    env: s.env,
    // npm.cmd on Windows needs a shell (Node refuses to spawn .cmd directly).
    shell: isWin && s.cmd.endsWith('.cmd'),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  prefixLines(child.stdout, prefix);
  prefixLines(child.stderr, prefix);
  child.on('exit', (code) => {
    if (!shuttingDown) warn(`${s.name} exited (code ${code}) - the others keep running; Ctrl+C to stop`);
  });
  children.push(child);
}

function killTree(child) {
  if (child.exitCode !== null) return;
  if (isWin) {
    try {
      execSync(`taskkill /PID ${child.pid} /T /F`, { stdio: 'ignore' });
    } catch {
      /* already gone */
    }
  } else {
    child.kill('SIGTERM');
  }
}

function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  log('stopping everything...');
  children.forEach(killTree);
  setTimeout(() => process.exit(0), 500);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

function open(url) {
  const cmd = isWin ? `start "" "${url}"` : process.platform === 'darwin' ? `open "${url}"` : `xdg-open "${url}"`;
  try {
    execSync(cmd, { stdio: 'ignore' });
  } catch {
    /* no browser available */
  }
}

// ---------------------------------------------------------------------

async function main() {
  console.log(`\n${C.bold}${C.magenta}fs-pro dev - starting everything${C.reset}\n`);

  if (!have('go')) warn('go not found - the Go services (IMG-API, WORLDGEN, SIM, REALTIME) cannot start');
  await startDatabases();

  const status = new Map();
  for (const s of services) {
    if (skip.has(s.id)) {
      status.set(s, 'skipped');
      continue;
    }
    if (s.needs?.some((dir) => !existsSync(dir))) {
      warn(`${s.name}: ${s.needs.join(', ')} not found - skipping`);
      status.set(s, 'missing');
      continue;
    }
    if (await portOpen(s.port)) {
      log(`${s.name}: port ${s.port} already in use - assuming it's running`);
      status.set(s, 'already running');
      continue;
    }
    if (s.before && s.before() === false) {
      status.set(s, 'not built');
      continue;
    }
    start(s);
    status.set(s, 'starting');
  }

  // First `go run` compiles, so allow a generous wait.
  await Promise.all(
    [...status]
      .filter(([, st]) => st === 'starting')
      .map(async ([s]) => status.set(s, (await waitForPort(s.port, 180_000)) ? 'up' : 'NOT RESPONDING'))
  );
  if (shuttingDown) return;

  console.log(`\n${C.bold}Services${C.reset}`);
  for (const [s, st] of status) {
    const ok = st === 'up' || st === 'already running';
    const mark = ok ? `${C.green}●${C.reset}` : `${C.yellow}○${C.reset}`;
    const url = s.url ?? `http://localhost:${s.port}`;
    console.log(`  ${mark} ${s.color}${s.name.padEnd(9)}${C.reset}${s.what.padEnd(28)} ${C.bold}${url}${C.reset}  ${C.gray}${st}${C.reset}`);
  }
  console.log(`\n  ${C.bold}Open ${C.green}http://localhost:8080${C.reset}${C.bold} in your browser.${C.reset}  ${C.gray}Ctrl+C stops everything.${C.reset}\n`);

  if (openBrowser) open('http://localhost:8080');
}

main().catch((e) => {
  console.error(e);
  shutdown();
});
