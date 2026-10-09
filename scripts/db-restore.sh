#!/usr/bin/env bash
#
# Postgres restore (phase-1 B5B). Restores a dump produced by
# scripts/db-backup.sh into TARGET_DATABASE_URL, replacing its contents.
#
#   TARGET_DATABASE_URL=postgresql://user:pass@host:5432/fspro_restore_test \
#   scripts/db-restore.sh backups/fspro-20260101-120000.dump
#
# Env:
#   TARGET_DATABASE_URL  required (never point this at production unless you
#                        mean to overwrite it)
#   PG_RESTORE_BIN       pg_restore executable (default "pg_restore")
#
# Exit code 0 = restore clean. pg_restore returns 1 for warnings (e.g. role
# grants); we treat only >=2 as failure, and print a note for 1.
set -uo pipefail

DUMP="${1:?usage: db-restore.sh <dump-file>}"
: "${TARGET_DATABASE_URL:?set TARGET_DATABASE_URL}"

if [ ! -f "$DUMP" ]; then
  echo "[restore] no such dump: $DUMP" >&2
  exit 2
fi

PG_RESTORE_BIN="${PG_RESTORE_BIN:-pg_restore}"
"$PG_RESTORE_BIN" --clean --if-exists --no-owner --no-privileges \
  --dbname="$TARGET_DATABASE_URL" "$DUMP"
code=$?
case "$code" in
  0) echo "[restore] clean restore into $TARGET_DATABASE_URL" ;;
  1) echo "[restore] completed with warnings (exit 1) into $TARGET_DATABASE_URL" ;;
  *) echo "[restore] FAILED (exit $code)" >&2; exit "$code" ;;
esac
