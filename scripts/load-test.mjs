// A dependency-free load tester (phase-1 B5B): N concurrent virtual users
// hammer a set of paths on a local stack for a fixed duration and print
// latency percentiles, throughput and error counts.
//
//   BASE=http://localhost:3010 CONCURRENCY=1000 DURATION_MS=10000 \
//   PATHS=/health,/api/tiles/0/3/1 node scripts/load-test.mjs
//
// Node 18+ (global fetch). No external packages.

const BASE = process.env.BASE || 'http://localhost:3010';
const CONCURRENCY = Number(process.env.CONCURRENCY || 100);
const DURATION_MS = Number(process.env.DURATION_MS || 10000);
const TIMEOUT_MS = Number(process.env.TIMEOUT_MS || 5000);
const PATHS = (process.env.PATHS || '/health').split(',').map((p) => p.trim()).filter(Boolean);

const latencies = [];
const lat2xx = [];
let ok = 0;
let errors = 0;
const statuses = new Map();
const deadline = Date.now() + DURATION_MS;

async function worker(id) {
  let n = 0;
  while (Date.now() < deadline) {
    const path = PATHS[(id + n) % PATHS.length];
    const start = performance.now();
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
      const res = await fetch(BASE + path, { signal: ctrl.signal });
      clearTimeout(t);
      await res.arrayBuffer();
      const ms = performance.now() - start;
      latencies.push(ms);
      statuses.set(res.status, (statuses.get(res.status) || 0) + 1);
      if (res.ok) {
        ok++;
        lat2xx.push(ms);
      } else {
        errors++;
      }
    } catch {
      errors++;
      statuses.set('net', (statuses.get('net') || 0) + 1);
    }
    n++;
  }
}

const t0 = Date.now();
await Promise.all(Array.from({ length: CONCURRENCY }, (_, i) => worker(i)));
const elapsed = (Date.now() - t0) / 1000;

latencies.sort((a, b) => a - b);
lat2xx.sort((a, b) => a - b);
const pct = (arr, q) => arr[Math.min(arr.length - 1, Math.floor(arr.length * q))] || 0;
const total = ok + errors;
console.log(`BASE=${BASE} concurrency=${CONCURRENCY} duration=${elapsed.toFixed(1)}s paths=${PATHS.join(',')}`);
console.log(`requests=${total} ok=${ok} errors=${errors} rps=${(total / elapsed).toFixed(0)}`);
console.log(`all     ms  p50=${pct(latencies, 0.5).toFixed(0)} p95=${pct(latencies, 0.95).toFixed(0)} p99=${pct(latencies, 0.99).toFixed(0)} max=${(latencies[latencies.length - 1] || 0).toFixed(0)}`);
console.log(`2xx     ms  p50=${pct(lat2xx, 0.5).toFixed(0)} p95=${pct(lat2xx, 0.95).toFixed(0)} p99=${pct(lat2xx, 0.99).toFixed(0)}`);
console.log(`statuses: ${[...statuses.entries()].map(([s, n]) => `${s}=${n}`).join(' ')}`);
