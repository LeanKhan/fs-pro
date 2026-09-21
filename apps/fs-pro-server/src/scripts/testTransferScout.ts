import 'dotenv/config';

import { scoutPlayerTransfer } from '../services/ai/transfer-scout.service';
import { DrizzleDatabase } from '../db/drizzle';
import { clubs, players } from '../db/drizzle/schema';
import { isNotNull } from 'drizzle-orm';

async function main() {
  const db = DrizzleDatabase.getInstance().database;
  const [club] = await db.select().from(clubs).limit(1);
  const [targetPlayer] = await db.select().from(players).where(isNotNull(players.Value)).limit(1);

  if (!club || !targetPlayer) {
    console.error('No club or player found in DB');
    process.exit(1);
  }

  console.log(`Scouting player: ${targetPlayer.FirstName} ${targetPlayer.LastName} (${targetPlayer.Position}, OVR ${targetPlayer.Rating}) for Club: ${club.Name}`);

  const report = await scoutPlayerTransfer(targetPlayer.id, club.id);
  console.log('\n--- TRANSFER SCOUT REPORT ---');
  console.log('Recommendation:', report.recommendation);
  console.log('Deal Rating:', report.dealRating, '/ 100');
  console.log('Confidence:', report.confidence, '%');
  console.log('Source:', report.source);
  console.log('Verdict:', report.verdict);
  console.log('Tactical Fit:', `[${report.tacticalFitLevel}]`, report.tacticalFit);
  console.log('Squad Role:', `[${report.squadRoleLevel}]`, report.squadRole);
  console.log('Financial:', report.financialAssessment);
  console.log('Comparison:', report.comparisonWithSquad);
  console.log('-----------------------------\n');
  process.exit(0);
}

main().catch((err) => {
  console.error('Error during test:', err);
  process.exit(1);
});
