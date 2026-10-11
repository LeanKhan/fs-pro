-- 0054_drop_board_perks.sql
--
-- Wave 8 / housekeeping (OW-H01; docs/coc-mapping/09 §5, 04 §7, §10). Drop the
-- now-unused "BoardPerks" table created by 0046_economy_liveops.sql.
--
-- Superseded before it was ever used: the Board-Perk inventory of record is the
-- single Clubs.Perks jsonb map (0053_campus_perks.sql), written only through
-- campus.usePerk / campus.GrantPerks. No shipped Go, Node or client code ever
-- SELECTed, INSERTed, UPDATEd or JOINed "BoardPerks" - a whole-repo grep finds
-- the name only in the 0046 DDL (and this drop), so the table was never
-- populated and the drop is clearly safe.
--
-- Additive-safe / idempotent: DROP TABLE IF EXISTS is replayable and carries no
-- data statement, so apply, re-run and a rolled-back apply are all no-ops.

DROP TABLE IF EXISTS "BoardPerks";
