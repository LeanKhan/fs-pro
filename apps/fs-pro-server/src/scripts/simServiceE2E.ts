/**
 * End-to-end check of the Rust sim service through the REAL path a fixture
 * takes: matchQueue -> worker -> Go service -> Rust engine. Validates the
 * fields play()/updateFixture() read (winner/draw, MOTM, per-player stats,
 * goal events vs score, frames/halves) and that seeds behave (same seed =
 * same match, different seed = different match).
 *
 * Needs the service running (services/sim-service):
 *   SIM_SERVICE_URL=http://127.0.0.1:5050 npx ts-node --transpile-only src/scripts/simServiceE2E.ts
 * "0/20 served by the Rust engine" means every match fell back to the
 * in-process engine - see the worker's warning for why.
 */
import * as dotenv from 'dotenv'; dotenv.config();
import * as fs from 'fs';
import { POOL_PATH, IRosterPool } from './simRealismCheck';
import { simulateMatch } from '../jobs/matchQueue';
import { unpackFrames } from '../realtime/packedFrames';
(async () => {
  const pool: IRosterPool = JSON.parse(fs.readFileSync(POOL_PATH, 'utf8'));
  const clubs = pool.clubs.filter((c) => (c.Players ?? []).some((p) => p.Position === 'GK'));
  const problems: string[] = [];
  const req = (i: number, seed: string) => {
    const h = clubs[i % clubs.length], a = clubs[(i + 5) % clubs.length];
    return { fixtureId: 'e2e' + i, seed, clubs: [h, a], sides: { home: String(h._id), away: String(a._id) }, tactics: { home: pool.tactics[String(h._id)], away: pool.tactics[String(a._id)] } };
  };
  let rust = 0, goals = 0;
  for (let i = 0; i < 20; i++) {
    const r = req(i, 'e2e-seed-' + i);
    const res = await simulateMatch(r as any);
    if (!res.ok) { problems.push(`${i}: not ok ${res.error}`); continue; }
    const m: any = { ...res.match, Frames: unpackFrames(res.match.Frames) }, d = m.Details;
    if ('PassesAttempted' in d.HomeTeamDetails) rust++;
    const [hc, ac] = r.clubs;
    const ids = new Set([...hc.Players!, ...ac.Players!].map((p) => String(p._id)));
    const check = (ok: boolean, what: string) => { if (!ok) problems.push(`${i}: ${what}`); };
    check(d.Draw === (d.HomeTeamScore === d.AwayTeamScore), 'Draw flag');
    check(d.Draw ? d.Winner === null : d.Winner.id === (d.HomeTeamScore > d.AwayTeamScore ? hc._id : ac._id), 'Winner');
    check(d.HomeTeamDetails.Won === d.HomeTeamScore > d.AwayTeamScore && d.AwayTeamDetails.Drew === d.Draw, 'Won/Drew');
    check(ids.has(d.MOTM?.id), 'MOTM is a real player');
    for (const side of [d.HomeTeamDetails, d.AwayTeamDetails]) {
      check(side.PlayerStats.length === 11 && side.PlayerStats.every((s: any) => ids.has(s.PlayerId)), 'PlayerStats = 11 real players');
    }
    const goalEvents = m.Events.filter((e: any) => e.type === 'goal');
    check(goalEvents.length === d.HomeTeamScore + d.AwayTeamScore, 'goal events = goals');
    check(goalEvents.every((e: any) => ids.has(e.playerID) && [hc.ClubCode, ac.ClubCode].includes(e.playerTeamID)), 'goal event player/team');
    const scorerGoals = [...d.HomeTeamDetails.PlayerStats, ...d.AwayTeamDetails.PlayerStats].reduce((s: number, p: any) => s + p.Goals, 0);
    check(scorerGoals === d.HomeTeamScore + d.AwayTeamScore, 'player goals sum = score');
    check(m.Frames.length === 720 && m.Frames[359].half === 1 && m.Frames[360].half === 2, 'frames/half');
    check(m.Frames[0].players.length === 22 && m.Frames[0].players.every((p: any) => ids.has(p.id)), 'frame players real');
    goals += d.HomeTeamScore + d.AwayTeamScore;
  }
  const a = await simulateMatch(req(0, 'same') as any), b = await simulateMatch(req(0, 'same') as any), c = await simulateMatch(req(0, 'other') as any);
  const fp = (x: any) => JSON.stringify(x.ok && x.match.Frames);
  if (fp(a) !== fp(b)) problems.push('same seed differs');
  if (fp(a) === fp(c)) problems.push('different seed identical');
  console.log(`E2E: ${rust}/20 served by the Rust engine | ${(goals / 20).toFixed(2)} goals/match | problems: ${problems.length ? '\n  ' + problems.join('\n  ') : 'none'}`);
  process.exit(0);
})();
