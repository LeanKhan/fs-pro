// Campus economy schemas (docs/coc-mapping/04, "Campus"): the Clubhouse tier,
// the crossed collectors and vaults, the Groundskeeper build-slot bottleneck and
// the Derelict Grounds obstacles. Mirrored by the Go server
// (apps/fs-pro-server-go/internal/campus); every timer is an absolute UTC
// ISO-8601 timestamp, never a duration or game-day (04 §12).
import { z } from 'zod';

export const CampusCurrencySchema = z.enum([
  'cash',
  'fans',
  'scout_tokens',
  'sponsor_credits',
]);

export const CollectorStateSchema = z.object({
  key: z.string(),
  name: z.string(),
  currency: CampusCurrencySchema,
  productionPerHour: z.number(),
  capacity: z.number(),
  pending: z.number(),
  collectedAt: z.string(),
  full: z.boolean(),
  secondsToFull: z.number(),
});

export const VaultStateSchema = z.object({
  currency: CampusCurrencySchema,
  level: z.number(),
  capacity: z.number(),
  balance: z.number(),
});

export const CampusGroundskeeperSchema = z.object({
  count: z.number(),
  max: z.number(),
  active: z.number(),
  nextCost: z.number().nullable(),
  nextCurrency: CampusCurrencySchema.nullable(),
  nextEarnedBy: z.enum(['milestone', 'purchase', 'legacy', 'max']),
});

export const CampusObstacleSchema = z.object({
  id: z.string(),
  kind: z.string(),
  x: z.number(),
  z: z.number(),
  rot: z.number(),
  clearCost: z.number(),
  clearBonus: z.number(),
});

/** One quick consumable Board Perk's remaining count (04 §7, §10). */
export const PerkStateSchema = z.object({
  key: z.string(),
  name: z.string(),
  count: z.number(),
});

export const CampusAssetUpgradeSchema = z.object({
  toLevel: z.number(),
  startAt: z.string(),
  readyAt: z.string(),
  secondsLeft: z.number(),
});

export const CampusAssetNextSchema = z.object({
  level: z.number(),
  cost: z.number(),
  minutes: z.number(),
  blockedReason: z.string().nullable(),
});

export const CampusAssetStateSchema = z.object({
  type: z.string(),
  name: z.string(),
  level: z.number(),
  maxLevel: z.number(),
  currency: CampusCurrencySchema,
  upgrade: CampusAssetUpgradeSchema.nullable(),
  next: CampusAssetNextSchema.nullable(),
});

export const ClubhouseStateSchema = z.object({
  tier: z.number(),
  maxTier: z.number(),
  upgradingTo: z.number().nullable(),
  readyAt: z.string().nullable(),
  missing: z.array(z.object({ facility: z.string(), level: z.number() })),
});

export const CampusStateSchema = z.object({
  clubId: z.string(),
  name: z.string(),
  code: z.string(),
  cash: z.number(),
  fans: z.number(),
  scoutTokens: z.number(),
  sponsorCredits: z.number(),
  standingPoints: z.number(),
  guardUntil: z.string().nullable(),
  clubhouse: ClubhouseStateSchema,
  collectors: z.array(CollectorStateSchema),
  vaults: z.array(VaultStateSchema),
  groundskeepers: CampusGroundskeeperSchema,
  obstacles: z.array(CampusObstacleSchema),
  perks: z.array(PerkStateSchema),
  assets: z.array(CampusAssetStateSchema),
  now: z.string(),
});

export const UpgradeRequestSchema = z.object({ assetType: z.string().min(1) });

export const PlaceRequestSchema = z.object({
  building: z.string().min(1),
  x: z.number().int(),
  z: z.number().int(),
  rot: z.number().int().min(0).max(3),
});

export const CollectRequestSchema = z.object({});

export const ClearObstacleRequestSchema = z.object({ obstacleId: z.string().min(1) });

export const BuyGroundskeeperRequestSchema = z.object({});

/** Redeem one quick consumable Board Perk (04 §7). `instanceId`, when supplied,
 * makes a retried request idempotent (the server applies the perk once). */
export const UsePerkRequestSchema = z.object({
  perk: z.string().min(1),
  instanceId: z.string().min(1).optional(),
});

export type CampusCurrency = z.infer<typeof CampusCurrencySchema>;
export type CollectorState = z.infer<typeof CollectorStateSchema>;
export type VaultState = z.infer<typeof VaultStateSchema>;
export type CampusGroundskeeper = z.infer<typeof CampusGroundskeeperSchema>;
export type CampusObstacle = z.infer<typeof CampusObstacleSchema>;
export type PerkState = z.infer<typeof PerkStateSchema>;
export type CampusAssetState = z.infer<typeof CampusAssetStateSchema>;
export type ClubhouseState = z.infer<typeof ClubhouseStateSchema>;
export type CampusState = z.infer<typeof CampusStateSchema>;
