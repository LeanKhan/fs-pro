import * as dotenv from 'dotenv'; dotenv.config();
import * as fs from 'fs';
import { POOL_PATH, IRosterPool } from './simRealismCheck';
import { eligibleClubs, buildPairs, quietly } from './simBenchmark';
import App from '../controllers/app/App';
import { decisionEvents } from '../simulation/decision/decisionLog';
(async () => {
  const pool: IRosterPool = JSON.parse(fs.readFileSync(POOL_PATH, 'utf8'));
  const pairs = buildPairs(await eligibleClubs(pool), 20);
  const sum: Record<string, number[]> = {}; let n = 0, dribbleTop = 0, engaged = 0;
  for (const p of pairs) {
    const h = String(p.home._id), aw = String(p.away._id);
    await quietly(async () => {
      const app = new App(); const g = await app.setupGame([h, aw], { home: h, away: aw }, [p.home, p.away], { home: pool.tactics[h], away: pool.tactics[aw] }, p.seed);
      decisionEvents.on(`${g.Match.id}-decision`, (e: any) => {
        n++;
        for (const c of e.candidates) { const k = c.type + (c.type === 'pass' ? ':' + c.detail : ''); (sum[k] ??= []).push(c.score); }
        const d = e.candidates.find((c: any) => c.type === 'dribble'); if (d.score > 0) engaged++;
        if (Math.max(...e.candidates.map((c: any) => c.score)) === d.score) dribbleTop++;
      });
      const r = await app.startGame(); decisionEvents.removeAllListeners(); return r;
    });
  }
  const q = (xs: number[], f: number) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length * f)];
  console.table(Object.fromEntries(Object.entries(sum).map(([k, v]) => [k, { present: (v.length / n * 100).toFixed(0) + '%', p25: q(v, .25).toFixed(2), p50: q(v, .5).toFixed(2), p75: q(v, .75).toFixed(2) }])));
  console.log(`decisions ${n}, dribble candidate engaged ${(engaged / n * 100).toFixed(0)}%, dribble top-scored ${(dribbleTop / n * 100).toFixed(0)}%`);
  process.exit(0);
})();
