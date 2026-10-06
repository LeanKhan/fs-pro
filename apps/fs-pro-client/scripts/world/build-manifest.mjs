// Lists the world art that exists so the client can fall back when a plate
// or scene is missing (docs/WORLD-VIEW-UI-PLAN.md, "Files and fallback").
// Run after adding art:  node scripts/world/build-manifest.mjs
import { readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../public/world', import.meta.url));
const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir).sort()) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path);
    else if (/\.(png|jpe?g|webp)$/i.test(name)) files.push(relative(root, path).split('\\').join('/'));
  }
})(root);

writeFileSync(join(root, 'manifest.json'), JSON.stringify({ files }, null, 2) + '\n');
console.log(`world manifest: ${files.length} files`);
