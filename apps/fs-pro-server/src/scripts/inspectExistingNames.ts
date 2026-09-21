import 'dotenv/config';
import { DrizzleDatabase } from '../db/drizzle';
import { players, places } from '../db/drizzle/schema';
import { eq } from 'drizzle-orm';

async function inspectNames() {
  const db = DrizzleDatabase.getInstance().database;
  const allPlaces = await db.select().from(places).where(eq(places.Type, 'country'));
  const placeMap = new Map(allPlaces.map(p => [p.id, p.Name]));

  const allPlayers = await db.select({
    first: players.FirstName,
    last: players.LastName,
    natId: players.NationalityId
  }).from(players);

  const byCountry = new Map<string, { first: Set<string>; last: Set<string> }>();
  for (const p of allPlayers) {
    const cName = placeMap.get(p.natId ?? '') ?? 'Unknown';
    if (!byCountry.has(cName)) byCountry.set(cName, { first: new Set(), last: new Set() });
    if (p.first) byCountry.get(cName)!.first.add(p.first);
    if (p.last) byCountry.get(cName)!.last.add(p.last);
  }

  for (const [country, sets] of byCountry) {
    console.log(`=== ${country} (${sets.first.size} first names, ${sets.last.size} last names) ===`);
    console.log('Sample First:', Array.from(sets.first).slice(0, 10).join(', '));
    console.log('Sample Last:', Array.from(sets.last).slice(0, 10).join(', '));
  }
}

inspectNames().then(() => process.exit(0)).catch((err) => {
  console.error(err);
  process.exit(1);
});
