# Switching to Drizzle ORM

The abstraction layer supports multiple SQL ORMs. Here's how to switch from Prisma to Drizzle.

## Why Drizzle?

- 🚀 **Faster**: Lighter than Prisma
- 💚 **TypeScript-first**: Better type inference
- 🎯 **SQL-like**: Write queries that feel like SQL
- 📦 **Smaller bundle**: No code generation bloat
- 🔧 **More control**: Direct SQL access when needed

## Installation

```bash
cd apps/fs-pro-server

# Install Drizzle
npm install drizzle-orm postgres

# Install Drizzle Kit (CLI tool)
npm install -D drizzle-kit
```

## Setup Steps

### 1. Create Drizzle Configuration

Create `drizzle.config.ts` in `apps/fs-pro-server/`:

```typescript
import type { Config } from 'drizzle-kit';
import * as dotenv from 'dotenv';

dotenv.config();

export default {
  schema: './src/db/drizzle/schema/*',
  out: './src/db/drizzle/migrations',
  driver: 'pg',
  dbCredentials: {
    connectionString: process.env.DATABASE_URL!,
  },
} satisfies Config;
```

### 2. Create Drizzle Schema

Create `src/db/drizzle/schema/places.ts`:

```typescript
import { pgTable, uuid, varchar, timestamp } from 'drizzle-orm/pg-core';

export const places = pgTable('places', {
  id: uuid('id').primaryKey().defaultRandom(),
  fullname: varchar('fullname', { length: 255 }).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  code: varchar('code', { length: 50 }).notNull().unique(),
  region: varchar('region', { length: 100 }),
  type: varchar('type', { length: 50 }),
  picture: varchar('picture', { length: 255 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export type Place = typeof places.$inferSelect;
export type NewPlace = typeof places.$inferInsert;
```

### 3. Create Drizzle Database Class

Create `src/db/drizzle.ts`:

```typescript
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { IDatabase, IModels } from './interfaces';
import * as schema from './drizzle/schema/places';

/**
 * PostgreSQL Database implementation using Drizzle ORM
 */
export class DrizzleDatabase implements IDatabase {
  private static instance: DrizzleDatabase;
  private client: ReturnType<typeof postgres>;
  private db: ReturnType<typeof drizzle>;
  private _models: IModels;

  constructor() {
    const connectionString = process.env.DATABASE_URL!;

    // Create postgres client
    this.client = postgres(connectionString, {
      max: 10,
      idle_timeout: 20,
      connect_timeout: 10,
    });

    // Initialize Drizzle
    this.db = drizzle(this.client, { schema });

    // Initialize placeholder models
    this._models = {
      Competition: null,
      Player: null,
      Season: null,
      Club: null,
      User: null,
      Fixture: null,
      Calendar: null,
      Day: null,
      Manager: null,
      ClubMatch: null,
      PlayerMatch: null,
      Place: null, // Will be implemented
      Award: null,
    };
  }

  public static getInstance(): DrizzleDatabase {
    if (!DrizzleDatabase.instance) {
      DrizzleDatabase.instance = new DrizzleDatabase();
    }
    return DrizzleDatabase.instance;
  }

  public async start(): Promise<void> {
    try {
      // Test connection
      await this.client`SELECT 1`;
      console.log('✅ Drizzle PostgreSQL connection successful!');
    } catch (err) {
      console.error('❌ Error connecting to PostgreSQL with Drizzle:', err);
      throw err;
    }
  }

  public get Models(): IModels {
    return this._models;
  }

  public getConnection() {
    return this.db;
  }

  public async disconnect(): Promise<void> {
    await this.client.end();
  }

  /**
   * Get Drizzle database instance for direct queries
   */
  public get database() {
    return this.db;
  }

  /**
   * Get postgres client for raw SQL queries
   */
  public get sql() {
    return this.client;
  }
}
```

### 4. Update DB Index to Support Drizzle

Update `src/db/index.ts`:

```typescript
/**
 * Database abstraction layer
 * Supports MongoDB, PostgreSQL (Prisma), and PostgreSQL (Drizzle)
 *
 * Environment variables:
 * - USE_POSTGRESQL=true - Use PostgreSQL
 * - USE_DRIZZLE=true - Use Drizzle ORM (requires USE_POSTGRESQL=true)
 */

import { IDatabase, IModels, DatabaseType } from './interfaces';
import { MongoDatabase } from './mongodb';
import { PostgreSQLDatabase } from './postgresql';
import { DrizzleDatabase } from './drizzle';
import { connection } from 'mongoose';

// Determine which database to use
const USE_POSTGRESQL = process.env.USE_POSTGRESQL?.trim() === 'true';
const USE_DRIZZLE = process.env.USE_DRIZZLE?.trim() === 'true';

// MongoDB URL configuration
let prod_db = '';
if (process.env.DEV_TEST?.trim()) {
  prod_db = process.env.DEV_MONGO_URL?.trim() as string;
} else {
  prod_db = process.env.PROD_MONGO_URL?.trim() as string;
}

export const MONGO_URL = prod_db;

/**
 * Database singleton
 * Automatically selects MongoDB, Prisma, or Drizzle based on environment
 */
export default class DB {
  private static instance: IDatabase;

  public static start() {
    if (!DB.instance) {
      if (USE_POSTGRESQL) {
        if (USE_DRIZZLE) {
          console.log('🐉 Using PostgreSQL with Drizzle ORM');
          DB.instance = DrizzleDatabase.getInstance();
        } else {
          console.log('🐘 Using PostgreSQL with Prisma ORM');
          DB.instance = PostgreSQLDatabase.getInstance();
        }
      } else {
        console.log('🍃 Using MongoDB database');
        DB.instance = MongoDatabase.getInstance(MONGO_URL);
      }
      DB.instance.start();
    }
  }

  public static get Models(): IModels {
    if (!DB.instance) {
      DB.start();
    }
    return DB.instance!.Models;
  }

  public static get db() {
    if (USE_POSTGRESQL) {
      if (USE_DRIZZLE) {
        // Return Drizzle database
        return (DB.instance as DrizzleDatabase).database;
      } else {
        // Return Prisma client
        return (DB.instance as PostgreSQLDatabase).client;
      }
    } else {
      // Return MongoDB connection
      return connection.db;
    }
  }

  public static async disconnect(): Promise<void> {
    if (DB.instance) {
      await DB.instance.disconnect();
    }
  }

  public static get databaseType(): DatabaseType {
    return USE_POSTGRESQL ? DatabaseType.POSTGRESQL : DatabaseType.MONGODB;
  }

  public static get connection(): IDatabase {
    if (!DB.instance) {
      DB.start();
    }
    return DB.instance!;
  }

  public static get ormType(): 'mongoose' | 'prisma' | 'drizzle' {
    if (USE_POSTGRESQL) {
      return USE_DRIZZLE ? 'drizzle' : 'prisma';
    }
    return 'mongoose';
  }
}
```

### 5. Update Environment Variables

Update `.env.example`:

```bash
# Database Configuration
USE_POSTGRESQL=false
USE_DRIZZLE=false  # Only used when USE_POSTGRESQL=true

# PostgreSQL Connection
DATABASE_URL="postgresql://user:password@localhost:5432/fspro?schema=public"

# MongoDB Connection
DEV_MONGO_URL="mongodb://localhost:27017/fspro-dev"
PROD_MONGO_URL="mongodb://localhost:27017/fspro"
```

### 6. Add NPM Scripts

Update `package.json`:

```json
{
  "scripts": {
    "drizzle:generate": "drizzle-kit generate:pg",
    "drizzle:push": "drizzle-kit push:pg",
    "drizzle:studio": "drizzle-kit studio",
    "drizzle:migrate": "tsx src/db/drizzle/migrate.ts"
  }
}
```

## Drizzle vs Prisma Comparison

### Prisma Example
```typescript
// Create
await prisma.place.create({
  data: {
    fullname: 'Republic of Bellean',
    name: 'Bellean',
    code: 'BELL',
  }
});

// Query
const places = await prisma.place.findMany({
  where: { region: 'east' },
  orderBy: { name: 'asc' }
});
```

### Drizzle Example
```typescript
import { db } from './db/drizzle';
import { places } from './db/drizzle/schema/places';
import { eq } from 'drizzle-orm';

// Create
await db.insert(places).values({
  fullname: 'Republic of Bellean',
  name: 'Bellean',
  code: 'BELL',
});

// Query
const result = await db
  .select()
  .from(places)
  .where(eq(places.region, 'east'))
  .orderBy(places.name);
```

## Creating a Place Repository with Drizzle

Create `src/repositories/drizzle/PlaceRepository.ts`:

```typescript
import { IPlaceRepository } from '../PlaceRepository';
import { DrizzleDatabase } from '../../db/drizzle';
import { places } from '../../db/drizzle/schema/places';
import { eq } from 'drizzle-orm';
import { IPlace } from '../../controllers/places/places.model';

export class DrizzlePlaceRepository implements IPlaceRepository {
  private db = DrizzleDatabase.getInstance().database;

  async findById(id: string): Promise<IPlace | null> {
    const [place] = await this.db
      .select()
      .from(places)
      .where(eq(places.id, id))
      .limit(1);

    return place || null;
  }

  async findAll(): Promise<IPlace[]> {
    return await this.db.select().from(places);
  }

  async create(data: Partial<IPlace>): Promise<IPlace> {
    const [place] = await this.db
      .insert(places)
      .values(data)
      .returning();

    return place;
  }

  async update(id: string, data: Partial<IPlace>): Promise<IPlace> {
    const [place] = await this.db
      .update(places)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(places.id, id))
      .returning();

    return place;
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(places).where(eq(places.id, id));
  }
}
```

## Switching Between ORMs

### Use MongoDB (Default)
```bash
USE_POSTGRESQL=false
```

### Use PostgreSQL with Prisma
```bash
USE_POSTGRESQL=true
USE_DRIZZLE=false
```

### Use PostgreSQL with Drizzle
```bash
USE_POSTGRESQL=true
USE_DRIZZLE=true
```

## Migration Commands

### Drizzle Kit Commands
```bash
# Generate migration files
npm run drizzle:generate

# Push schema to database (dev only)
npm run drizzle:push

# Open Drizzle Studio (database GUI)
npm run drizzle:studio
```

## Advantages of Drizzle

1. **Type Safety**: Better TypeScript inference
2. **Performance**: Faster queries, no code generation
3. **SQL-like**: Easier if you know SQL
4. **Flexibility**: Mix ORM queries with raw SQL
5. **Bundle Size**: Much smaller than Prisma

## When to Use Each

### Use Prisma if:
- You want a mature, well-documented ORM
- You prefer GraphQL-like query syntax
- You need comprehensive tooling (Studio, migrations)
- You want extensive ecosystem support

### Use Drizzle if:
- You want maximum performance
- You prefer SQL-like syntax
- You need fine-grained control
- Bundle size matters
- You're comfortable with TypeScript

## Next Steps

1. Install Drizzle: `npm install drizzle-orm postgres drizzle-kit`
2. Create schema files in `src/db/drizzle/schema/`
3. Update `src/db/index.ts` to support Drizzle
4. Create Drizzle repositories
5. Set `USE_DRIZZLE=true` in `.env`
6. Test with your application

## Resources

- [Drizzle Documentation](https://orm.drizzle.team/docs/overview)
- [Drizzle vs Prisma Comparison](https://orm.drizzle.team/docs/prisma-to-drizzle)
- [Drizzle Examples](https://github.com/drizzle-team/drizzle-orm/tree/main/examples)
