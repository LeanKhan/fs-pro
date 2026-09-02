# Migration Example: Places Model

This document shows how to migrate a model from MongoDB to PostgreSQL.

## Step-by-Step Migration Process

### Step 1: Add Prisma Schema

Edit `prisma/schema.prisma`:

```prisma
model Place {
  id          String   @id @default(uuid())
  name        String
  code        String   @unique
  type        String   // e.g., "country", "city"
  population  Int?
  flag        String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  // Relations (add when migrating related models)
  players     Player[]
}
```

### Step 2: Create Migration

```bash
npx prisma migrate dev --name add_places_model
```

### Step 3: Create Repository Interface

Create `src/repositories/PlaceRepository.ts`:

```typescript
import { IPlace } from '../controllers/places/places.model';

export interface IPlaceRepository {
  findById(id: string): Promise<IPlace | null>;
  findAll(): Promise<IPlace[]>;
  create(data: Partial<IPlace>): Promise<IPlace>;
  update(id: string, data: Partial<IPlace>): Promise<IPlace>;
  delete(id: string): Promise<void>;
}
```

### Step 4: Implement MongoDB Repository

Create `src/repositories/mongo/PlaceRepository.ts`:

```typescript
import { IPlaceRepository } from '../PlaceRepository';
import DB from '../../db';
import { IPlace } from '../../controllers/places/places.model';

export class MongoPlaceRepository implements IPlaceRepository {
  async findById(id: string): Promise<IPlace | null> {
    return DB.Models.Place.findById(id).exec();
  }

  async findAll(): Promise<IPlace[]> {
    return DB.Models.Place.find().exec();
  }

  async create(data: Partial<IPlace>): Promise<IPlace> {
    return DB.Models.Place.create(data);
  }

  async update(id: string, data: Partial<IPlace>): Promise<IPlace> {
    return DB.Models.Place.findByIdAndUpdate(id, data, { new: true }).exec();
  }

  async delete(id: string): Promise<void> {
    await DB.Models.Place.findByIdAndDelete(id).exec();
  }
}
```

### Step 5: Implement PostgreSQL Repository

Create `src/repositories/sql/PlaceRepository.ts`:

```typescript
import { IPlaceRepository } from '../PlaceRepository';
import { PostgreSQLDatabase } from '../../db/postgresql';
import { IPlace } from '../../controllers/places/places.model';

export class SQLPlaceRepository implements IPlaceRepository {
  private prisma = (PostgreSQLDatabase.getInstance().getConnection() as any);

  async findById(id: string): Promise<IPlace | null> {
    return this.prisma.place.findUnique({ where: { id } });
  }

  async findAll(): Promise<IPlace[]> {
    return this.prisma.place.findMany();
  }

  async create(data: Partial<IPlace>): Promise<IPlace> {
    return this.prisma.place.create({ data });
  }

  async update(id: string, data: Partial<IPlace>): Promise<IPlace> {
    return this.prisma.place.update({
      where: { id },
      data,
    });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.place.delete({ where: { id } });
  }
}
```

### Step 6: Create Repository Factory

Create `src/repositories/PlaceRepositoryFactory.ts`:

```typescript
import { IPlaceRepository } from './PlaceRepository';
import { MongoPlaceRepository } from './mongo/PlaceRepository';
import { SQLPlaceRepository } from './sql/PlaceRepository';
import DB, { DatabaseType } from '../db';

export class PlaceRepositoryFactory {
  static create(): IPlaceRepository {
    if (DB.databaseType === DatabaseType.POSTGRESQL) {
      return new SQLPlaceRepository();
    }
    return new MongoPlaceRepository();
  }
}
```

### Step 7: Update Service Layer

Update `src/controllers/places/places.service.ts`:

```typescript
import { PlaceRepositoryFactory } from '../../repositories/PlaceRepositoryFactory';

const placeRepo = PlaceRepositoryFactory.create();

export async function getPlace(id: string) {
  return placeRepo.findById(id);
}

export async function getAllPlaces() {
  return placeRepo.findAll();
}

export async function createPlace(data: any) {
  return placeRepo.create(data);
}

export async function updatePlace(id: string, data: any) {
  return placeRepo.update(id, data);
}

export async function deletePlace(id: string) {
  return placeRepo.delete(id);
}
```

### Step 8: Update PostgreSQL Models Reference

Update `src/db/postgresql.ts`:

```typescript
import { PlaceRepositoryFactory } from '../repositories/PlaceRepositoryFactory';

// In constructor, update:
this._models = {
  // ... other models
  Place: PlaceRepositoryFactory.create(), // Now implemented!
  // ... rest
};
```

### Step 9: Data Migration Script

Create `src/scripts/migrate-places.ts`:

```typescript
import DB from '../db';
import { PostgreSQLDatabase } from '../db/postgresql';
import { MongoDatabase } from '../db/mongodb';

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
          name: place.name,
          code: place.code,
          type: place.type,
          population: place.population,
          flag: place.flag,
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
```

### Step 10: Run Migration

```bash
# Run the migration script
ts-node src/scripts/migrate-places.ts
```

### Step 11: Test with PostgreSQL

```bash
# Update .env
USE_POSTGRESQL=true

# Start server
npm run dev:server

# Test endpoints
curl http://localhost:3000/api/places
```

### Step 12: Verify Data

```bash
# Open Prisma Studio
npx prisma studio

# Check Places table
```

## Testing Strategy

### Shadow Testing

```typescript
// Temporarily query both databases and compare
const mongoResult = await mongoRepo.findAll();
const sqlResult = await sqlRepo.findAll();

if (mongoResult.length !== sqlResult.length) {
  console.warn('Data mismatch!', {
    mongo: mongoResult.length,
    sql: sqlResult.length
  });
}
```

### Gradual Rollout

1. **Week 1**: Read from MongoDB, log PostgreSQL queries
2. **Week 2**: Read from both, compare results
3. **Week 3**: Read from PostgreSQL, fallback to MongoDB
4. **Week 4**: Read only from PostgreSQL
5. **Week 5**: Remove MongoDB code

## Common Patterns

### Handling ObjectId vs UUID

```typescript
// MongoDB uses ObjectId, PostgreSQL uses UUID
const mongoId = '507f1f77bcf86cd799439011'; // 24 char hex
const postgresId = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'; // UUID

// Store mapping during migration
const idMapping = new Map();
idMapping.set(mongoId, postgresId);
```

### Nested Documents

```typescript
// MongoDB nested document
{
  address: {
    street: "123 Main St",
    city: "NYC"
  }
}

// PostgreSQL Option 1: JSON column
model Place {
  address Json?
}

// PostgreSQL Option 2: Separate table
model Place {
  id      String  @id
  address Address?
}

model Address {
  id      String @id
  place   Place  @relation(fields: [placeId], references: [id])
  placeId String @unique
  street  String
  city    String
}
```

### Arrays

```typescript
// MongoDB
players: [ObjectId('...'), ObjectId('...')]

// PostgreSQL
model Place {
  players Player[]
}

model Player {
  place   Place  @relation(fields: [placeId], references: [id])
  placeId String
}
```

## Rollback Plan

If issues occur:

1. Set `USE_POSTGRESQL=false`
2. Server automatically switches to MongoDB
3. Investigate issue
4. Fix and retry

No downtime required!
