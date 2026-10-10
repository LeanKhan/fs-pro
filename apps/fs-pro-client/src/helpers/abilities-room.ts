/**
 * The Gated-abilities / War Room surface's pure core (docs/coc-mapping/03 Part 2,
 * 02 §C/§D/§F, 08 §2 P4, OW-N11).
 *
 * `abilities.list` returns every signed player's family syllabus with mastery
 * and the exact facility/mastery **gate reason strings**; `traits.list` is the
 * trait catalogue (2 slots); `orders.inventory` is the Tactical War Room stock.
 * `abilities.slot` / `traits.equip` / `orders.prepare` echo a player loadout or
 * a fresh inventory. The Go payloads are untyped, so this module coerces them.
 *
 * Pure: no Vue, no network, no clock. Unit-tested in `abilities-room.test.ts`.
 */
import { bool, int, isRecord, list, nullableStr, record, str } from './coerce';

/** One slotted ability on a player. */
export interface SlottedAbilityView {
  abilityId: string;
  name: string;
  slot: number;
  xp: number;
  masteryTier: number;
}

/** One syllabus entry (an ability a player could slot), with its gate. */
export interface SyllabusEntryView {
  abilityId: string;
  name: string;
  family: string;
  /** Coaching tier the ability needs. */
  facilityTier: number;
  /** Mastery tier the ability needs. */
  masteryTier: number;
  trigger: string;
  /** The player's current mastery tier in this ability. */
  mastery: number;
  eligible: boolean;
  /** The exact refusal reason (never silent). */
  reason: string | null;
}

/** One player's ability screen. */
export interface PlayerAbilitiesView {
  playerId: string;
  name: string;
  position: string;
  role: string;
  family: string;
  masteryTier: number;
  slots: number;
  usedSlots: number;
  slotted: SlottedAbilityView[];
  syllabus: SyllabusEntryView[];
}

/** The club's ability screen. */
export interface AbilitiesView {
  clubId: string;
  name: string;
  clubhouseTier: number;
  /** Effective Coaching/Video research tier. */
  facilityTier: number;
  schools: {
    academy: number;
    eliteAcademy: number;
    squadCamp: number;
    coaching: number;
    videoAnalysis: number;
  };
  players: PlayerAbilitiesView[];
}

/** One trait in the catalogue. */
export interface TraitView {
  id: string;
  name: string;
  description: string;
  rarity: string;
  effect: string;
}

/** The trait catalogue. */
export interface TraitCatalogueView {
  traits: TraitView[];
  rarities: string[];
  maxSlots: number;
}

/** One War-Room order line. */
export interface OrderView {
  id: string;
  name: string;
  description: string;
  /** Fans cost per copy. */
  cost: number;
  trigger: string;
  /** Stock held. */
  count: number;
  /** Stock cap. */
  max: number;
  region: { x0: number; x1: number; y0: number; y1: number } | null;
}

/** The War-Room inventory. */
export interface OrderInventoryView {
  clubId: string;
  name: string;
  fans: number;
  orders: OrderView[];
}

/** A player's loadout, as `abilities.slot` / `traits.equip` echo it. */
export interface PlayerLoadoutView {
  playerId: string;
  masteryTier: number;
  slots: number;
  usedSlots: number;
  slotted: SlottedAbilityView[];
  mastery: { abilityId: string; xp: number; tier: number }[];
  traits: { traitId: string; slot: number; rarity: string }[];
}

function slottedOf(raw: unknown): SlottedAbilityView | null {
  if (!isRecord(raw)) return null;
  const abilityId = str(raw.abilityId);
  if (!abilityId) return null;
  return {
    abilityId,
    name: str(raw.name, abilityId),
    slot: int(raw.slot, 0),
    xp: int(raw.xp, 0),
    masteryTier: int(raw.masteryTier, 1),
  };
}

function syllabusOf(raw: unknown): SyllabusEntryView | null {
  if (!isRecord(raw)) return null;
  const abilityId = str(raw.abilityId);
  if (!abilityId) return null;
  return {
    abilityId,
    name: str(raw.name, abilityId),
    family: str(raw.family, 'ALL'),
    facilityTier: int(raw.facilityTier, 0),
    masteryTier: int(raw.masteryTier, 1),
    trigger: str(raw.trigger, 'always'),
    mastery: int(raw.mastery, 1),
    eligible: bool(raw.eligible),
    reason: nullableStr(raw.reason),
  };
}

function playerOf(raw: unknown): PlayerAbilitiesView | null {
  if (!isRecord(raw)) return null;
  const playerId = str(raw.playerId);
  if (!playerId) return null;
  return {
    playerId,
    name: str(raw.name, playerId),
    position: str(raw.position),
    role: str(raw.role),
    family: str(raw.family, 'ALL'),
    masteryTier: int(raw.masteryTier, 1),
    slots: int(raw.slots, 0),
    usedSlots: int(raw.usedSlots, 0),
    slotted: list(raw.slotted)
      .map(slottedOf)
      .filter((s): s is SlottedAbilityView => s !== null),
    syllabus: list(raw.syllabus)
      .map(syllabusOf)
      .filter((s): s is SyllabusEntryView => s !== null),
  };
}

/** Coerce an `abilities.list` payload, or null when malformed. */
export function coerceAbilities(raw: unknown): AbilitiesView | null {
  if (!isRecord(raw)) return null;
  const clubId = str(raw.clubId);
  if (!clubId) return null;
  const schools = record(raw.schools);
  return {
    clubId,
    name: str(raw.name, 'Club'),
    clubhouseTier: int(raw.clubhouseTier, 0),
    facilityTier: int(raw.facilityTier, 0),
    schools: {
      academy: int(schools.academy, 0),
      eliteAcademy: int(schools.eliteAcademy, 0),
      squadCamp: int(schools.squadCamp, 0),
      coaching: int(schools.coaching, 0),
      videoAnalysis: int(schools.videoAnalysis, 0),
    },
    players: list(raw.players)
      .map(playerOf)
      .filter((p): p is PlayerAbilitiesView => p !== null),
  };
}

/** Coerce a `traits.list` payload, or null when malformed. */
export function coerceTraits(raw: unknown): TraitCatalogueView | null {
  if (!isRecord(raw)) return null;
  const traits = list(raw.traits)
    .filter(isRecord)
    .map((t) => {
      const id = str(t.id);
      return id
        ? {
            id,
            name: str(t.name, id),
            description: str(t.description),
            rarity: str(t.rarity, 'shiny'),
            effect: str(t.effect),
          }
        : null;
    })
    .filter((t): t is TraitView => t !== null);
  return {
    traits,
    rarities: list(raw.rarities).filter(
      (r): r is string => typeof r === 'string'
    ),
    maxSlots: int(raw.maxSlots, 2),
  };
}

function orderOf(raw: unknown): OrderView | null {
  if (!isRecord(raw)) return null;
  const id = str(raw.id);
  if (!id) return null;
  const region = record(raw.region);
  const hasRegion = isRecord(raw.region);
  return {
    id,
    name: str(raw.name, id),
    description: str(raw.description),
    cost: int(raw.cost, 0),
    trigger: str(raw.trigger, 'always'),
    count: int(raw.count, 0),
    max: int(raw.max, 0),
    region: hasRegion
      ? {
          x0: int(region.x0, 0),
          x1: int(region.x1, 0),
          y0: int(region.y0, 0),
          y1: int(region.y1, 0),
        }
      : null,
  };
}

/** Coerce an `orders.inventory` payload, or null when malformed. */
export function coerceOrders(raw: unknown): OrderInventoryView | null {
  if (!isRecord(raw)) return null;
  const clubId = str(raw.clubId);
  if (!clubId) return null;
  return {
    clubId,
    name: str(raw.name, 'Club'),
    fans: int(raw.fans, 0),
    orders: list(raw.orders)
      .map(orderOf)
      .filter((o): o is OrderView => o !== null),
  };
}

/** Coerce a `PlayerLoadout` (slot/equip response), or null when malformed. */
export function coerceLoadout(raw: unknown): PlayerLoadoutView | null {
  if (!isRecord(raw)) return null;
  const playerId = str(raw.playerId);
  if (!playerId) return null;
  return {
    playerId,
    masteryTier: int(raw.masteryTier, 1),
    slots: int(raw.slots, 0),
    usedSlots: int(raw.usedSlots, 0),
    slotted: list(raw.slotted)
      .map(slottedOf)
      .filter((s): s is SlottedAbilityView => s !== null),
    mastery: list(raw.mastery)
      .filter(isRecord)
      .map((m) => ({
        abilityId: str(m.abilityId),
        xp: int(m.xp, 0),
        tier: int(m.tier, 1),
      }))
      .filter((m) => m.abilityId !== ''),
    traits: list(raw.traits)
      .filter(isRecord)
      .map((t) => ({
        traitId: str(t.traitId),
        slot: int(t.slot, 0),
        rarity: str(t.rarity, 'shiny'),
      }))
      .filter((t) => t.traitId !== ''),
  };
}

/** "Tier 3". */
export function masteryLabel(tier: number): string {
  return `Tier ${Math.max(0, Math.trunc(tier))}`;
}

/** Whether the player has a free ability slot. */
export function hasFreeSlot(player: PlayerAbilitiesView): boolean {
  return player.usedSlots < player.slots;
}

/** "3 / 5" slot usage. */
export function slotLabel(player: PlayerAbilitiesView): string {
  return `${player.usedSlots} / ${player.slots}`;
}
