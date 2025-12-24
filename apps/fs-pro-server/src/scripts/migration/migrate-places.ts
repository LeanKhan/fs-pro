import DB from '../../db';
import { PostgreSQLDatabase } from '../../db/postgresql';
import { MongoDatabase } from '../../db/mongodb';

async function migratePlaces() {
  console.log('Starting Places migration...');

  // Connect to both databases
  const mongoDB = MongoDatabase.getInstance(process.env.DEV_MONGO_URL!);
  await mongoDB.start();

  const postgreSQL = PostgreSQLDatabase.getInstance();
  await postgreSQL.start();

  // Fetch all places from MongoDB
  const places = await mongoDB.Models.Place.find({}).lean().exec();
  console.log(`Found ${places.length} places to migrate`);

  // Migrate each place
  for (const place of places) {
    try {
      await postgreSQL.client.place.create({
        data: {
          id: place._id.toString(),
          Fullname: place.Fullname,
		  Name: place.Name,
          Code: place.Code,
          Type: place.Type,
          Picture: place.Picture,
          Region: place.Region,
          createdAt: place.createdAt,
          updatedAt: place.updatedAt,
        },
      });
      console.log(`✓ Migrated: ${place.name}`);
    } catch (err) {
      console.error(`✗ Failed: ${place.name}`, err);
    }
  }

  console.log('Migration complete!');
  await mongoDB.disconnect();
  await postgreSQL.disconnect();
}

migratePlaces().catch(console.error);
