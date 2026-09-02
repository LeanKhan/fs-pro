# Database Migration Guide

This project supports both **MongoDB** and **PostgreSQL** databases through a unified abstraction layer.

## Current Status

- ✅ Dual database support infrastructure ready
- ✅ MongoDB fully functional (current production database)
- 🚧 PostgreSQL ready for incremental migration

## Switching Between Databases

### Using MongoDB (Default)

```bash
# In your .env file
USE_POSTGRESQL=false
DEV_MONGO_URL="mongodb://localhost:27017/fspro-dev"
PROD_MONGO_URL="mongodb://localhost:27017/fspro"
```

### Using PostgreSQL

```bash
# In your .env file
USE_POSTGRESQL=true
DATABASE_URL="postgresql://user:password@localhost:5432/fspro?schema=public"
```

## PostgreSQL Setup

### 1. Install PostgreSQL

**Option A: Local Installation**
- Download from [postgresql.org](https://www.postgresql.org/download/)
- Or use Docker: `docker run --name fspro-postgres -e POSTGRES_PASSWORD=mysecret -p 5432:5432 -d postgres`

**Option B: Cloud Database**
- [Supabase](https://supabase.com) (Free tier available)
- [Neon](https://neon.tech) (Free tier available)
- [Railway](https://railway.app) (Free tier available)

### 2. Create Database

```sql
CREATE DATABASE fspro;
```

### 3. Configure Environment

```bash
# Update .env
DATABASE_URL="postgresql://username:password@localhost:5432/fspro?schema=public"
USE_POSTGRESQL=true
```

### 4. Generate Prisma Client

```bash
cd apps/fs-pro-server
npx prisma generate
```

### 5. Run Migrations (when schemas are added)

```bash
npx prisma migrate dev --name init
```

## Migration Strategy

We're migrating models incrementally in this order:

1. ✅ **Infrastructure** - Dual database support
2. ⏳ **Places** - Simple reference data
3. ⏳ **Awards** - Simple data
4. ⏳ **Users** - Authentication
5. ⏳ **Managers** - User management
6. ⏳ **Competitions** - Game structure
7. ⏳ **Clubs** - Team data
8. ⏳ **Calendar & Days** - Game schedule
9. ⏳ **Seasons** - Season management
10. ⏳ **Players** - Player data (complex)
11. ⏳ **Fixtures** - Match scheduling
12. ⏳ **Match Details** - Game statistics

## Architecture

```
src/db/
├── index.ts          # Main entry point, switches between databases
├── interfaces.ts     # Database abstraction interfaces
├── mongodb.ts        # MongoDB implementation (Mongoose)
└── postgresql.ts     # PostgreSQL implementation (Prisma)
```

### How It Works

1. **Abstraction Layer**: `IDatabase` interface provides unified API
2. **Environment-Based Selection**: `USE_POSTGRESQL` flag switches database
3. **Transparent Migration**: Controllers use `DB.Models` regardless of backend
4. **Incremental Approach**: Migrate one model at a time

## Development Workflow

### Testing PostgreSQL Connection

```bash
# Start with PostgreSQL
npm run dev:server

# You should see: 🐘 Using PostgreSQL database
```

### Testing MongoDB Connection

```bash
# Start with MongoDB
npm run dev:server

# You should see: 🍃 Using MongoDB database
```

## Prisma Commands

```bash
# Generate Prisma client
npx prisma generate

# Create migration
npx prisma migrate dev --name migration_name

# View database in browser
npx prisma studio

# Reset database (careful!)
npx prisma migrate reset

# Pull existing database schema
npx prisma db pull

# Push schema without migration
npx prisma db push
```

## Troubleshooting

### "Prisma Client not found"
```bash
cd apps/fs-pro-server
npx prisma generate
```

### Connection errors
- Check `DATABASE_URL` format
- Ensure PostgreSQL is running
- Verify credentials and database exists

### TypeScript errors
```bash
npm run tsc
```

## Next Steps

1. Add first model schema to `prisma/schema.prisma`
2. Create migration: `npx prisma migrate dev`
3. Implement repository pattern for the model
4. Write data migration script
5. Test with `USE_POSTGRESQL=true`
6. Repeat for next model

## Resources

- [Prisma Documentation](https://www.prisma.io/docs)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [Migration Guide](../../../docs/migration-guide.md) (coming soon)
