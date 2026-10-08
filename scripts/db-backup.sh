#!/usr/bin/env bash
#
# Postgres backup (phase-1 B5B). Dumps DATABASE_URL in the compressed custom
# format and prunes old dumps. Run it from cron / a systemd timer on the DB
# host. Pair with scripts/db-restore.sh for the restore drill.
#
#   DATABASE_URL=postgresql://user:pass@host:5432/fspro \
#   BACKUP_DIR=/var/backups/fspro scripts/db-backup.sh
#
# Env:
#   DATABASE_URL   required
#   BACKUP_DIR     default ./backups
#   BACKUP_KEEP    number of dumps to keep (default 14)
#   PG_DUMP_BIN    pg_dump executable (default "pg_dump"; the client version
#                  must be >= the server's)
set -euo pipefail

: "${DATABASE_URL:?set DATABASE_URL}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
BACKUP_KEEP="${BACKUP_KEEP:-14}"
PG_DUMP_BIN="${PG_DUMP_BIN:-pg_dump}"

mkdir -p "$BACKUP_DIR"
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="$BACKUP_DIR/fspro-$STAMP.dump"

"$PG_DUMP_BIN" "$DATABASE_URL" --format=custom --no-owner --no-privileges --file="$OUT"
echo "[backup] wrote $OUT ($(du -h "$OUT" | cut -f1))"

# Prune: keep the newest BACKUP_KEEP dumps.
if [ "$BACKUP_KEEP" -gt 0 ]; then
  # shellcheck disable=SC2012
  ls -1t "$BACKUP_DIR"/fspro-*.dump 2>/dev/null | tail -n +"$((BACKUP_KEEP + 1))" | while read -r old; do
    echo "[backup] pruning $old"
    rm -f "$old"
  done
fi
