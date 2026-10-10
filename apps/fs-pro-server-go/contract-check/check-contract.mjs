#!/usr/bin/env node
// Pass 1 of the contract conformance harness (PLAN §7): diff the Go server's
// GET /__routes manifest against the compiled @repo/api-contract.
//
// DB-free: it only reads routes. Run with the Go server up (ENABLE_ROUTE_MANIFEST=true):
//
//   ENABLE_ROUTE_MANIFEST=true go run ./cmd/server
//   node contract-check/check-contract.mjs http://localhost:3000
//
// Exit code 0 = no diffs for the checked domains, 1 = diffs, 2 = could not run.

import { fileURLToPath } from 'node:url';
import path from 'node:path';

const baseUrl = process.argv[2] || process.env.BASE_URL || 'http://localhost:3000';

// Domains implemented so far are diffed; the manifest also lists the
// non-contract /healthz, / and /__routes entries, which are ignored.
const CHECKED_PREFIXES = [
  'meta.', 'users.', 'clubs.', 'players.', 'managers.',
  'fixtures.', 'calendar.', 'seasons.', 'awards.', 'places.',
  'play.', 'game.', 'facilities.', 'program.', 'campus.', 'grid.',
  'abilities.', 'traits.', 'orders.', 'league.',
  'associations.', 'season.', 'legacy.', 'honours.',
  'transfers.', 'editions.', 'challenges.', 'competitionDefinitions.',
  'world.', 'atlas.', 'tiles.',
];

function normalizePath(p) {
  // ':id' -> '{id}' so Go's ServeMux patterns compare.
  const parts = p.replace(/\/+$/, '').split('/').filter(Boolean);
  return (
    '/' +
    parts
      .map((part) => (part.startsWith(':') ? `{${part.slice(1)}}` : part))
      .join('/')
  );
}

// walkContract mirrors route-policy.ts's compile() walk. ts-rest bakes each
// router's pathPrefix into the route's own `path` (e.g. '/users/join'), so the
// full path is the Express mount '/api' plus that value.
function walkContract(contract) {
  const out = new Map();
  const visit = (node, prefixId) => {
    for (const [key, value] of Object.entries(node)) {
      if (!value || typeof value !== 'object') continue;
      if (typeof value.method === 'string' && typeof value.path === 'string') {
        const id = `${prefixId}${key}`;
        const statuses = Object.keys(value.responses ?? {})
          .map(Number)
          .sort((a, b) => a - b);
        out.set(id, {
          id,
          method: value.method.toUpperCase(),
          path: ('/api' + normalizePath(value.path)).replace(/\/{2,}/g, '/'),
          statuses,
        });
      } else {
        visit(value, `${prefixId}${key}.`);
      }
    }
  };
  visit(contract, '');
  return out;
}

async function loadExpected() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const dist = path.resolve(here, '../../../packages/api-contract/dist/index.js');
  const mod = await import(`file://${dist.replace(/\\/g, '/')}`);
  const contract = mod.apiContract ?? mod.default?.apiContract;
  if (!contract) throw new Error('apiContract not exported by compiled contract');
  return walkContract(contract);
}

async function main() {
  let expected;
  try {
    expected = await loadExpected();
  } catch (err) {
    console.error(`SKIP: could not load compiled @repo/api-contract (${err.message}).`);
    console.error('Run `npm run build --workspace @repo/api-contract` first.');
    process.exit(2);
  }

  let manifest;
  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, '')}/__routes`);
    if (!res.ok) throw new Error(`GET /__routes -> ${res.status}`);
    manifest = await res.json();
  } catch (err) {
    console.error(`SKIP: could not reach the Go server at ${baseUrl} (${err.message}).`);
    console.error('Start it with ENABLE_ROUTE_MANIFEST=true.');
    process.exit(2);
  }

  const actual = new Map();
  for (const route of manifest) {
    if (CHECKED_PREFIXES.some((p) => route.id.startsWith(p))) actual.set(route.id, route);
  }
  const wanted = new Map([...expected].filter(([id]) => CHECKED_PREFIXES.some((p) => id.startsWith(p))));

  const diffs = [];
  for (const [id, exp] of wanted) {
    const got = actual.get(id);
    if (!got) {
      diffs.push(`missing route ${id}`);
      continue;
    }
    if (got.method !== exp.method) diffs.push(`${id}: method ${got.method} != ${exp.method}`);
    if (got.path !== exp.path) diffs.push(`${id}: path ${got.path} != ${exp.path}`);
    const gs = [...got.statuses].sort((a, b) => a - b).join(',');
    const es = exp.statuses.join(',');
    if (gs !== es) diffs.push(`${id}: statuses [${gs}] != [${es}]`);
  }
  for (const id of actual.keys()) if (!wanted.has(id)) diffs.push(`unexpected route ${id}`);

  if (diffs.length) {
    console.error(`FAIL: ${diffs.length} diff(s) for ${wanted.size} checked routes:`);
    for (const d of diffs) console.error('  - ' + d);
    process.exit(1);
  }
  console.log(`PASS: ${wanted.size} route(s) match (${CHECKED_PREFIXES.map((p) => p.replace(/\.$/, '')).join(', ')}).`);
}

main();
