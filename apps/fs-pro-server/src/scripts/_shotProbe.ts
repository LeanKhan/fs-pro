import * as dotenv from 'dotenv'; dotenv.config();
import * as fs from 'fs';
import { POOL_PATH, IRosterPool } from './simRealismCheck';
import { eligibleClubs, buildPairs, quietly } from './simBenchmark';
import App from '../controllers/app/App';
(async () => {
  const pool: IRosterPool = JSON.parse(fs.readFileSync(POOL_PATH, 'utf8'));
  const pairs = buildPairs(await eligibleClubs(pool), Number(process.argv[2] ?? 150));
  const rows: any[] = []; let goals = 0;
  for (const p of pairs) {
    const h = String(p.home._id), aw = String(p.away._id);
    const m: any = await quietly(async () => { const app = new App(); await app.setupGame([h, aw], { home: h, away: aw }, [p.home, p.away], { home: pool.tactics[h], away: pool.tactics[aw] }, p.seed); return app.startGame(); });
    for (const e of m.Events) if (['goal', 'miss', 'save'].includes(e.type) && e.data?.xG !== undefined) rows.push({ d: e.data.distance, xg: e.data.xG, goal: e.type === 'goal', r: e.data.reason });
    goals += m.Details.HomeTeamScore + m.Details.AwayTeamScore;
  }
  for (const [lo, hi] of [[0, 8], [8, 12], [12, 16.5], [16.5, 20], [20, 25], [25, 35], [35, 99]]) {
    const r = rows.filter(x => x.d >= lo && x.d < hi);
    console.log(`${lo}-${hi}m: ${(r.length / rows.length * 100).toFixed(0)}% of shots, xG ${(r.reduce((s, x) => s + x.xg, 0) / Math.max(1, r.length)).toFixed(3)}, conv ${(r.filter(x => x.goal).length / Math.max(1, r.length)).toFixed(3)}`);
  }
  const n = pairs.length;
  console.log(`shots/team ${(rows.length / n / 2).toFixed(1)} | xG/team ${(rows.reduce((s, x) => s + x.xg, 0) / n / 2).toFixed(2)} | goals/match ${(goals / n).toFixed(2)} | pens ${rows.filter(x=>x.r==='penalty').length} fks ${rows.filter(x=>x.r==='freekick').length}`);
  process.exit(0);
})();
