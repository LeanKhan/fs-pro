#!/bin/sh
# Brings the database up to date. Safe to run on every deploy: each step skips
# what it already applied. (A database whose 0015+ migrations were applied by
# hand needs BASELINE=1 once - see apply-sql-migrations.ts.)
# Run from apps/fs-pro-server (the image's working directory).
set -e
npx drizzle-kit migrate
npx ts-node --transpile-only src/scripts/migration/apply-sql-migrations.ts
npx ts-node --transpile-only src/scripts/migration/setup-sessions-table.ts
npx ts-node --transpile-only src/scripts/migration/setup-counter-sequences.ts
