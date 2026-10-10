#!/usr/bin/env node
// One-command route-coverage gate for the Go cutover (OW-D14 / 06 P10).
//
// It boots a real `fs-pro-server-go` (no database needed: the route manifest is
// DB-free), reads its GET /__routes manifest and diffs it against the compiled
// `@repo/api-contract` with contract-check/check-contract.mjs. Exits 0 only when
// every contract route is served by Go.
//
// Usage (from the repo root, or anywhere):
//
//   node apps/fs-pro-server-go/contract-check/route-coverage-gate.mjs
//
// Flags / env:
//   --port <n>                 pin the listen port (default: an ephemeral port)
//   --skip-contract-build      do not run `npm run build --workspace @repo/api-contract`
//   --skip-go-build            reuse an existing binary from $GATE_SERVER_BIN
//   GATE_SERVER_BIN            path to a prebuilt server binary (with --skip-go-build)
//
// Cross-platform: builds via `go`/`npm`, spawns the compiled binary directly
// (so teardown kills the server, not a `go run` parent), and always cleans up.

import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(here, '..'); // apps/fs-pro-server-go
const repoRoot = path.resolve(here, '../../..');

const args = process.argv.slice(2);
const hasFlag = (name) => args.includes(name);
const argValue = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const goCmd = process.platform === 'win32' ? 'go.exe' : 'go';

function run(cmd, cmdArgs, opts) {
  const res = spawnSync(cmd, cmdArgs, { stdio: 'inherit', ...opts });
  if (res.error) throw res.error;
  if (res.status !== 0) {
    throw new Error(`${cmd} ${cmdArgs.join(' ')} exited ${res.status}`);
  }
}

// runShell executes a command line through the platform shell. npm is a .cmd
// shim on Windows, which Node cannot spawn directly (EINVAL); passing the whole
// command as one string avoids the shell+args deprecation warning (DEP0190).
function runShell(cmdLine, opts) {
  const res = spawnSync(cmdLine, { stdio: 'inherit', shell: true, ...opts });
  if (res.error) throw res.error;
  if (res.status !== 0) throw new Error(`${cmdLine} exited ${res.status}`);
}

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

async function waitForManifest(baseUrl, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastErr;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${baseUrl}/__routes`);
      if (res.ok) return await res.json();
      lastErr = new Error(`GET /__routes -> ${res.status}`);
    } catch (err) {
      lastErr = err;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw lastErr ?? new Error('timed out waiting for /__routes');
}

function stopServer(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  } else {
    try {
      child.kill('SIGTERM');
    } catch {
      /* already gone */
    }
  }
}

async function main() {
  // 1. Build the contract the diff is measured against.
  if (!hasFlag('--skip-contract-build')) {
    console.log('[gate] building @repo/api-contract ...');
    runShell(`${npmCmd} run build --workspace @repo/api-contract`, { cwd: repoRoot });
  } else {
    const dist = path.join(repoRoot, 'packages/api-contract/dist/index.js');
    if (!existsSync(dist)) throw new Error(`compiled contract missing at ${dist} (drop --skip-contract-build)`);
  }

  // 2. Build (or reuse) the Go server binary.
  let binPath = process.env.GATE_SERVER_BIN;
  let tmpDir;
  if (hasFlag('--skip-go-build')) {
    if (!binPath) throw new Error('--skip-go-build requires GATE_SERVER_BIN');
  } else {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), 'fspro-gate-'));
    binPath = path.join(tmpDir, process.platform === 'win32' ? 'fs-pro-server.exe' : 'fs-pro-server');
    console.log('[gate] building ./cmd/server ...');
    run(goCmd, ['build', '-o', binPath, './cmd/server'], { cwd: appDir });
  }

  const port = Number(argValue('--port') ?? (process.env.GATE_PORT || (await freePort())));
  const baseUrl = `http://127.0.0.1:${port}`;

  // 3. Start the server with the manifest enabled and no database.
  const env = { ...process.env, ENABLE_ROUTE_MANIFEST: 'true', PORT: String(port), HOST: '127.0.0.1' };
  delete env.DATABASE_URL;
  console.log(`[gate] starting ${path.basename(binPath)} on ${baseUrl} ...`);
  const child = spawn(binPath, [], { env, stdio: ['ignore', 'ignore', 'inherit'] });
  child.on('error', (err) => {
    console.error(`[gate] failed to start the server: ${err.message}`);
    process.exit(2);
  });

  let exitCode = 2;
  try {
    const manifest = await waitForManifest(baseUrl, 30_000);
    console.log(`[gate] manifest up: ${manifest.length} route entries`);

    // 4. Diff the manifest against the contract.
    const check = spawnSync(process.execPath, [path.join(here, 'check-contract.mjs'), baseUrl], {
      stdio: 'inherit',
    });
    exitCode = check.status ?? 2;
  } finally {
    stopServer(child);
    if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
  }
  process.exit(exitCode);
}

main().catch((err) => {
  console.error(`[gate] FAIL: ${err.message}`);
  process.exit(2);
});
