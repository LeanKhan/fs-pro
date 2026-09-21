import 'dotenv/config';
import { DrizzleDatabase } from '../db/drizzle';
import { players, places, transferLedger } from '../db/drizzle/schema';
import { eq, and, sql } from 'drizzle-orm';
import { generateSystemCountryName, SYSTEM_COUNTRY_SYLLABLES } from '../services/transfers/system-country-names.service';
import { generateForeignLeagueIntake, ensureFreeAgentMarketStock } from '../services/transfers/foreign-intake.service';

async function main() {
  console.log('--- Testing Procedural System Country Name Generator ---');

  const countries = Object.keys(SYSTEM_COUNTRY_SYLLABLES);
  for (const country of countries) {
    const names = Array.from({ length: 3 }, () => generateSystemCountryName(country));
    console.log(`[${country.toUpperCase()}]: ${names.map(n => `${n.firstName} ${n.lastName}`).join(' | ')}`);
  }

  console.log('\n--- Testing Foreign League Intake Generation ---');
  const recruits = await generateForeignLeagueIntake({ count: 20 });
  console.log(`Generated ${recruits.length} foreign league players.`);

  // Position breakdown
  const byPosition: Record<string, number> = {};
  const ages: number[] = [];
  const ratings: number[] = [];

  for (const p of recruits) {
    byPosition[p.Position] = (byPosition[p.Position] ?? 0) + 1;
    ages.push(p.Age);
    ratings.push(Math.round(p.Rating));
  }

  console.log('Position Distribution:', byPosition);
  console.log('Age Spread:', `Min ${Math.min(...ages)}, Max ${Math.max(...ages)}, Avg ${(ages.reduce((a, b) => a + b, 0) / ages.length).toFixed(1)}`);
  console.log('Rating Spread:', `Min ${Math.min(...ratings)}, Max ${Math.max(...ratings)}, Avg ${(ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1)}`);

  console.log('\nSample Generated Overseas Players:');
  for (const p of recruits.slice(0, 8)) {
    console.log(`- ${p.FirstName} ${p.LastName} (${p.Position}, Age: ${p.Age}, Rating: ${Math.round(p.Rating)}, Value: ${p.Value} VLA) | Country: ${p.countryName} | League: ${p.originLeague}`);
  }

  // Verify in DB
  const db = DrizzleDatabase.getInstance().database;
  const freeGKs = await db
    .select({ count: sql<number>`count(*)` })
    .from(players)
    .where(and(eq(players.Position, 'GK'), eq(players.isSigned, false), eq(players.isRetired, false)));

  console.log(`\nFree Agent Goalkeepers in DB: ${freeGKs[0]?.count}`);

  const freeDEFs = await db
    .select({ count: sql<number>`count(*)` })
    .from(players)
    .where(and(eq(players.Position, 'DEF'), eq(players.isSigned, false), eq(players.isRetired, false)));

  console.log(`Free Agent Defenders in DB: ${freeDEFs[0]?.count}`);

  if (Number(freeGKs[0]?.count) < 2) {
    throw new Error('Expected at least 2 free agent GKs in database!');
  }

  console.log('\n✅ Foreign League Intake & Procedural Name Generator verified successfully!');
  process.exit(0);
}

main().catch((err) => {
  console.error('Test error:', err);
  process.exit(1);
});
