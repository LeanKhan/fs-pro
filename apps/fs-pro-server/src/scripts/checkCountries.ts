import 'dotenv/config';
import { DrizzleDatabase } from '../db/drizzle';
import { places } from '../db/drizzle/schema';
import { eq } from 'drizzle-orm';

async function main() {
  const db = DrizzleDatabase.getInstance().database;
  const countries = await db.select().from(places).where(eq(places.Type, 'country'));
  console.log(`Found ${countries.length} country places:`);
  console.log(countries.slice(0, 20).map(c => ({ id: c.id, code: c.Code, name: c.Name, fullname: c.Fullname })));
  process.exit(0);
}

main().catch(console.error);
