-- 0047_grid_abilities.sql
--
-- Wave 1 / P0 (docs/coc-mapping/05 §8 "Grid" + "Abilities"; 02 §C, §F; 03).
-- Additive, idempotent, Node-compatible. Clubs.Layouts (home/match/derby
-- grids) is added by 0045; this file adds the published share codes and the
-- ability/trait/order/mastery data model. No engine effects yet (P4).

-- ---------------------------------------------------------------------------
-- ClubLayouts: published pitch-grid share codes (03 §1.8). A challenge code is
-- a self-contained snapshot anybody can attempt; `Grid` is the same JSON shape
-- as one entry of Clubs.Layouts.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "ClubLayouts" (
  "_id"         uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "ClubId"      uuid NOT NULL REFERENCES "Clubs"("_id"),
  "Slot"        text NOT NULL,
  "Code"        text NOT NULL UNIQUE,
  "Grid"        jsonb NOT NULL DEFAULT '{"slots":[]}'::jsonb,
  "PublishedAt" timestamp(3) NOT NULL DEFAULT now(),
  "createdAt"   timestamp(3) NOT NULL DEFAULT now(),
  "updatedAt"   timestamp(3) NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "club_layouts_club_idx" ON "ClubLayouts" ("ClubId", "Slot");

-- ---------------------------------------------------------------------------
-- PlayerMastery: ability mastery XP per player/ability (02 §C; mastery tiers in
-- internal/abilities).
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "PlayerMastery" (
  "_id"       uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "PlayerId"  uuid NOT NULL REFERENCES "Players"("_id"),
  "Ability"   text NOT NULL,
  "Xp"        integer NOT NULL DEFAULT 0,
  "createdAt" timestamp(3) NOT NULL DEFAULT now(),
  "updatedAt" timestamp(3) NOT NULL DEFAULT now(),
  CONSTRAINT "player_mastery_player_ability_uniq" UNIQUE ("PlayerId", "Ability")
);

-- ---------------------------------------------------------------------------
-- PlayerAbilities: a player's slotted abilities (max slots enforced in Go).
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "PlayerAbilities" (
  "_id"       uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "PlayerId"  uuid NOT NULL REFERENCES "Players"("_id"),
  "Ability"   text NOT NULL,
  "Slot"      integer NOT NULL DEFAULT 0,
  "createdAt" timestamp(3) NOT NULL DEFAULT now(),
  "updatedAt" timestamp(3) NOT NULL DEFAULT now(),
  CONSTRAINT "player_abilities_player_slot_uniq" UNIQUE ("PlayerId", "Slot"),
  CONSTRAINT "player_abilities_player_ability_uniq" UNIQUE ("PlayerId", "Ability")
);

-- ---------------------------------------------------------------------------
-- PlayerTraits: two equippable trait slots per player (02 §C).
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "PlayerTraits" (
  "_id"       uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "PlayerId"  uuid NOT NULL REFERENCES "Players"("_id"),
  "Trait"     text NOT NULL,
  "Slot"      integer NOT NULL DEFAULT 0,
  "Rarity"    text NOT NULL DEFAULT 'shiny',
  "createdAt" timestamp(3) NOT NULL DEFAULT now(),
  "updatedAt" timestamp(3) NOT NULL DEFAULT now(),
  CONSTRAINT "player_traits_player_slot_uniq" UNIQUE ("PlayerId", "Slot")
);

-- ---------------------------------------------------------------------------
-- PlayerMentor: the passive boon assigned to a player (02 §C, "Pets").
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "PlayerMentor" (
  "PlayerId"  uuid PRIMARY KEY REFERENCES "Players"("_id"),
  "Mentor"    text NOT NULL,
  "createdAt" timestamp(3) NOT NULL DEFAULT now(),
  "updatedAt" timestamp(3) NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- ClubOrders: the Tactical War Room inventory - Manager Orders prepared for a
-- match (02 §D). One row per (club, order).
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "ClubOrders" (
  "_id"       uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "ClubId"    uuid NOT NULL REFERENCES "Clubs"("_id"),
  "Order"     text NOT NULL,
  "Count"     integer NOT NULL DEFAULT 0,
  "createdAt" timestamp(3) NOT NULL DEFAULT now(),
  "updatedAt" timestamp(3) NOT NULL DEFAULT now(),
  CONSTRAINT "club_orders_club_order_uniq" UNIQUE ("ClubId", "Order")
);
