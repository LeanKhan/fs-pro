/**
 * One-off: print real attribute averages from the live DB to calibrate
 * Decider.ts's duel formulas against actual data instead of assumptions.
 * Usage: DEV_TEST=true npx ts-node src/scripts/checkAttributeDistribution.ts
 */
import * as dotenv from 'dotenv';
dotenv.config();

import DB from '../db';
import { fetchAllClubs } from '../controllers/clubs/club.service';

function avg(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

async function main() {
  await DB.start();
  const clubs = await fetchAllClubs();
  const players = clubs.flatMap((c: any) => c.Players || []);

  console.log(`Total players: ${players.length}`);

  const byPos = (pos: string) => players.filter((p: any) => p.Position === pos);

  for (const pos of ['GK', 'DEF', 'MID', 'ATT']) {
    const group = byPos(pos);
    if (group.length === 0) continue;
    console.log(`\n${pos} (n=${group.length}):`);
    console.log(`  Tackling:   ${avg(group.map((p: any) => p.Attributes.Tackling)).toFixed(1)}`);
    console.log(`  ShortPass:  ${avg(group.map((p: any) => p.Attributes.ShortPass)).toFixed(1)}`);
    console.log(`  LongPass:   ${avg(group.map((p: any) => p.Attributes.LongPass)).toFixed(1)}`);
    console.log(`  Mental:     ${avg(group.map((p: any) => p.Attributes.Mental)).toFixed(1)}`);
    console.log(`  Control:    ${avg(group.map((p: any) => p.Attributes.Control)).toFixed(1)}`);
    console.log(`  Dribbling:  ${avg(group.map((p: any) => p.Attributes.Dribbling)).toFixed(1)}`);
    console.log(`  Speed:      ${avg(group.map((p: any) => p.Attributes.Speed)).toFixed(1)}`);
    console.log(`  Aggression: ${avg(group.map((p: any) => p.Attributes.Aggression)).toFixed(1)}`);
  }
}

main()
  .catch((err) => console.error(err))
  .finally(async () => {
    await DB.disconnect();
    process.exit(0);
  });
