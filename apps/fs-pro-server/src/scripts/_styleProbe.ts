import * as dotenv from 'dotenv'; dotenv.config();
import * as fs from 'fs';
import { POOL_PATH, IRosterPool } from './simRealismCheck';
import { eligibleClubs, buildPairs, quietly } from './simBenchmark';
import App from '../controllers/app/App';
import { decisionEvents } from '../simulation/decision/decisionLog';
import { PLAYING_STYLES } from '../simulation/state/PersistentState/Formations';
(async () => {
  const pool: IRosterPool = JSON.parse(fs.readFileSync(POOL_PATH, 'utf8'));
  const pairs = buildPairs(await eligibleClubs(pool), Number(process.argv[2] ?? 60));
  const out: any = {};
  for (const style of Object.keys(PLAYING_STYLES)) {
    const dec: Record<string, number> = {}; const ptype: Record<string, number> = {}; let comp = 0, att = 0, poss = 0, seqs = 0, xgF = 0, xgA = 0;
    for (const p of pairs) {
      const h = String(p.home._id), aw = String(p.away._id);
      const m: any = await quietly(async () => {
        const app = new App();
        const g = await app.setupGame([h, aw], { home: h, away: aw }, [p.home, p.away], { home: { formationName: '433', styleName: style }, away: { formationName: '433', styleName: 'Balanced' } }, p.seed);
        const homeCode = p.home.ClubCode;
        const homeIds = new Set(g.Match.Home.StartingSquad.map((x: any) => x._id));
        decisionEvents.on(`${g.Match.id}-decision`, (e: any) => { if (homeIds.has(e.playerId)) { const k = e.chosen.type + (e.chosen.type === 'pass' ? ':' + e.chosen.detail : ''); dec[k] = (dec[k] || 0) + 1; } });
        const r = await app.startGame(); decisionEvents.removeAllListeners(); return r;
      });
      const homeCode = p.home.ClubCode;
      for (const e of m.Events) {
        if (e.playerTeamID !== homeCode) continue;
        if (e.type === 'pass') { comp++; att++; ptype[e.data?.passType] = (ptype[e.data?.passType] || 0) + 1; }
      }
      for (const e of m.Events) if (e.type === 'interception' && e.playerTeamID !== homeCode && e.playerTeamID) att++;
      poss += m.Details.HomeTeamDetails.Possession; xgF += m.Details.HomeTeamDetails.XG ?? 0; xgA += m.Details.AwayTeamDetails.XG ?? 0;
    }
    const n = pairs.length; const dt = Object.values(dec).reduce((a, b) => a + b, 0);
    out[style] = { poss: (poss / n).toFixed(0), 'cmp%': (comp / att * 100).toFixed(0), xgF: (xgF / n).toFixed(2), xgA: (xgA / n).toFixed(2),
      ...Object.fromEntries(Object.entries(dec).sort().map(([k, v]) => [k, (v / dt * 100).toFixed(0)])) };
  }
  console.table(out);
  process.exit(0);
})();
