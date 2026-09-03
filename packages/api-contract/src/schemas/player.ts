import { z } from 'zod';

// Verified against real GET /players/all, GET /players/:id, and club-nested
// Players responses. Note: `Attributes.Setpiece` (lowercase p) is the real
// stored/returned key on every one of those paths, NOT `SetPiece` as
// interfaces/Player.ts's IPlayerAttributes and the admin create/update form
// both assumed - `.passthrough()` tolerates either casing showing up
// (GET /players/stats's raw-SQL-attached player nested object independently
// uses `SetPiece`/`nationality`, a different, less-normalized read path -
// see PlayerStatsEntrySchema below, which does NOT reuse this schema for
// that reason).
// Every numeric attribute is optional - real data has both a fully-blank
// outlier record and ~46% of players missing Setpiece specifically, so this
// isn't a rare edge case to work around, it's the actual shape of the data.
export const PlayerAttributesSchema = z
  .object({
    Speed: z.number().optional(),
    Mental: z.number().optional(),
    Vision: z.number().optional(),
    Agility: z.number().optional(),
    Control: z.number().optional(),
    Keeping: z.number().optional(),
    Marking: z.number().optional(),
    Stamina: z.number().optional(),
    Crossing: z.number().optional(),
    LongPass: z.number().optional(),
    LongShot: z.number().optional(),
    Setpiece: z.number().optional(),
    Shooting: z.number().optional(),
    Strength: z.number().optional(),
    Tackling: z.number().optional(),
    Dribbling: z.number().optional(),
    ShortPass: z.number().optional(),
    ShotPower: z.number().optional(),
    Aggression: z.number().optional(),
    Positioning: z.number().optional(),
    Interception: z.number().optional(),
    PreferredFoot: z.string().optional(),
    // Observed as both real booleans and stringified booleans ("true") on
    // real data.
    AttackingMindset: z
      .union([z.boolean(), z.string()])
      .nullable()
      .optional(),
    DefensiveMindset: z
      .union([z.boolean(), z.string()])
      .nullable()
      .optional(),
  })
  .passthrough();

export const PlayerSchema = z.object({
  _id: z.string().optional(),
  FirstName: z.string(),
  LastName: z.string(),
  NationalityId: z.string().nullable().optional(),
  Age: z.number(),
  PlayerID: z.string().nullable().optional(),
  Position: z.string(),
  Role: z.string(),
  PositionNumber: z.number().nullable().optional(),
  Attributes: PlayerAttributesSchema,
  Rating: z.number(),
  ShirtNumber: z.union([z.string(), z.number()]).nullable().optional(),
  Value: z.number(),
  Form: z.number().nullable().optional(),
  isReserve: z.boolean().optional(),
  // Player-specific appearance/avatar config - shape not yet observed
  // populated on real data (always null so far).
  Appearance: z.unknown().nullable().optional(),
  TransferHistory: z.array(z.unknown()).optional(),
  RatingsHistory: z.array(z.unknown()).optional(),
  isSigned: z.boolean(),
  ClubCode: z.string().nullable().optional(),
  ClubId: z.string().nullable().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

export type Player = z.infer<typeof PlayerSchema>;
export type PlayerAttributes = z.infer<typeof PlayerAttributesSchema>;
