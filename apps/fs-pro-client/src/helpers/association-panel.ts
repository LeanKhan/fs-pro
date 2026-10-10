/**
 * The Association surface's pure core (docs/coc-mapping/02 §G, 04 §7, 08 §2 P7,
 * OW-N10).
 *
 * Associations are the ≤50-club social group: a roster with roles, loans, a
 * Derby lifecycle, an Association League, weekly Directives with tier rewards,
 * and the shared Association Grounds + Festival Weekend. `associations.get` and
 * the other association routes return untyped Go maps, so this module coerces
 * them and derives the co-op views (membership, grounds progress, the Festival
 * countdown instant).
 *
 * Pure: no Vue, no network, no clock. Unit-tested in `association-panel.test.ts`.
 */
import { bool, counts, int, isRecord, list, num, nullableStr, record, str } from './coerce';

/** One member club. */
export interface AssocMemberView {
  clubId: string;
  name: string;
  code: string;
  role: string;
  isLeader: boolean;
}

/** The shared Association Grounds + Festival Weekend window. */
export interface GroundsView {
  level: number;
  maxLevel: number;
  capitalGold: number;
  nextCost: number;
  festivalActive: boolean;
  /** Absolute UTC instant the Festival window closes (04 §12). */
  festivalClosesAt: string | null;
  /** capitalGold vs. the next level's cost, clamped 0..1 (1 at max level). */
  fill: number;
  maxed: boolean;
}

/** The association read model. */
export interface AssociationView {
  id: string;
  name: string;
  tag: string;
  description: string | null;
  level: number;
  xp: number;
  memberCount: number;
  maxMembers: number;
  open: boolean;
  region: string | null;
  loanSlots: number;
  perks: { vaultBonusPct: number; incomeBonusPct: number };
  members: AssocMemberView[];
  grounds: GroundsView | null;
}

/** One weekly Directive with the caller's progress and claim state. */
export interface DirectiveView {
  id: string;
  code: string;
  title: string;
  tier: number;
  goal: number;
  progress: number;
  claimedTier: number;
  canClaim: boolean;
  fill: number;
  rewards: {
    cash: number;
    fans: number;
    xp: number;
    perks: { key: string; count: number }[];
  };
}

/** The weekly Directives board. */
export interface DirectivesView {
  associationId: string;
  weekKey: string;
  directives: DirectiveView[];
}

/** One Derby attempt. */
export interface DerbyMatchView {
  id: string;
  attackerClubId: string;
  defenderClubId: string;
  attempt: number;
  stars: number;
  destruction: number;
}

/** The Derby lifecycle. */
export interface DerbyView {
  id: string;
  phase: string;
  homeAssociationId: string;
  awayAssociationId: string;
  homeStars: number;
  awayStars: number;
  homeDestruction: number;
  awayDestruction: number;
  /** Absolute UTC lifecycle instants (04 §12). */
  prepStartsAt: string | null;
  battleStartsAt: string | null;
  endsAt: string | null;
  completedAt: string | null;
  practice: boolean;
  result: 'home' | 'away' | 'draw';
  matches: DerbyMatchView[];
}

function memberOf(raw: unknown): AssocMemberView | null {
  if (!isRecord(raw)) return null;
  const clubId = str(raw.clubId);
  if (!clubId) return null;
  const role = str(raw.role, 'member');
  return {
    clubId,
    name: str(raw.name, clubId),
    code: str(raw.code),
    role,
    isLeader: role === 'leader',
  };
}

function groundsOf(raw: unknown): GroundsView | null {
  if (!isRecord(raw)) return null;
  const level = Math.max(1, int(raw.level, 1));
  const maxLevel = int(raw.maxLevel, level);
  const capitalGold = num(raw.capitalGold, 0);
  const nextCost = num(raw.nextCost, 0);
  const maxed = level >= maxLevel;
  return {
    level,
    maxLevel,
    capitalGold,
    nextCost,
    festivalActive: bool(raw.festivalActive),
    festivalClosesAt: nullableStr(raw.festivalClosesAt),
    fill: maxed
      ? 1
      : nextCost > 0
        ? Math.min(1, Math.max(0, capitalGold / nextCost))
        : 0,
    maxed,
  };
}

/** Coerce a `associations.get` (or create/join) payload, or null. */
export function coerceAssociation(raw: unknown): AssociationView | null {
  if (!isRecord(raw)) return null;
  const id = str(raw.id);
  if (!id) return null;
  const perks = record(raw.perks);
  const grounds = isRecord(raw.grounds) ? groundsOf(raw.grounds) : null;
  return {
    id,
    name: str(raw.name, 'Association'),
    tag: str(raw.tag),
    description: nullableStr(raw.description),
    level: Math.max(1, int(raw.level, 1)),
    xp: int(raw.xp, 0),
    memberCount: int(raw.memberCount, 0),
    maxMembers: int(raw.maxMembers, 0),
    open: bool(raw.open, true),
    region: nullableStr(raw.region),
    loanSlots: int(raw.loanSlots, 0),
    perks: {
      vaultBonusPct: num(perks.vaultBonusPct, 0),
      incomeBonusPct: num(perks.incomeBonusPct, 0),
    },
    members: list(raw.members)
      .map(memberOf)
      .filter((m): m is AssocMemberView => m !== null),
    grounds,
  };
}

function directiveOf(raw: unknown): DirectiveView | null {
  if (!isRecord(raw)) return null;
  const id = str(raw.id);
  if (!id) return null;
  const goal = Math.max(1, int(raw.goal, 1));
  const progress = Math.max(0, int(raw.progress, 0));
  const rewards = record(raw.rewards);
  return {
    id,
    code: str(raw.code, id),
    title: str(raw.title, str(raw.code, 'Directive')),
    tier: int(raw.tier, 1),
    goal,
    progress,
    claimedTier: int(raw.claimedTier, 0),
    canClaim: bool(raw.canClaim, progress >= goal),
    fill: Math.min(1, progress / goal),
    rewards: {
      cash: num(rewards.cash, 0),
      fans: int(rewards.fans, 0),
      xp: int(rewards.xp, 0),
      perks: counts(rewards.perks),
    },
  };
}

/** Coerce an `associations.directives` payload, or null when malformed. */
export function coerceDirectives(raw: unknown): DirectivesView | null {
  if (!isRecord(raw)) return null;
  const associationId = str(raw.associationId);
  if (!associationId) return null;
  return {
    associationId,
    weekKey: str(raw.weekKey),
    directives: list(raw.directives)
      .map(directiveOf)
      .filter((d): d is DirectiveView => d !== null),
  };
}

function derbyMatchOf(raw: unknown): DerbyMatchView | null {
  if (!isRecord(raw)) return null;
  const id = str(raw.id);
  if (!id) return null;
  return {
    id,
    attackerClubId: str(raw.attackerClubId),
    defenderClubId: str(raw.defenderClubId),
    attempt: int(raw.attempt, 0),
    stars: int(raw.stars, 0),
    destruction: num(raw.destruction, 0),
  };
}

/** Coerce an `associations.derby` payload, or null when malformed. */
export function coerceDerby(raw: unknown): DerbyView | null {
  if (!isRecord(raw)) return null;
  const id = str(raw.id);
  if (!id) return null;
  const result = str(raw.result, 'draw');
  return {
    id,
    phase: str(raw.phase, 'prep'),
    homeAssociationId: str(raw.homeAssocId),
    awayAssociationId: str(raw.awayAssocId),
    homeStars: int(raw.homeStars, 0),
    awayStars: int(raw.awayStars, 0),
    homeDestruction: num(raw.homeDestruction, 0),
    awayDestruction: num(raw.awayDestruction, 0),
    prepStartsAt: nullableStr(raw.prepStartsAt),
    battleStartsAt: nullableStr(raw.battleStartsAt),
    endsAt: nullableStr(raw.endsAt),
    completedAt: nullableStr(raw.completedAt),
    practice: bool(raw.practice),
    result: result === 'home' || result === 'away' ? result : 'draw',
    matches: list(raw.matches)
      .map(derbyMatchOf)
      .filter((m): m is DerbyMatchView => m !== null),
  };
}

/** Whether a club id is a member of the association (drives owner actions). */
export function isMember(view: AssociationView, clubId: string): boolean {
  return view.members.some((m) => m.clubId === clubId);
}

/** "III" for tier 3 (the Directive/Derby tier chip). */
export function tierLabel(tier: number): string {
  const roman = ['', 'I', 'II', 'III', 'IV', 'V'];
  const n = Math.trunc(tier);
  return n >= 1 && n < roman.length ? roman[n]! : `T${n}`;
}

/** The Festival window as the grounds panel shows it. */
export function festivalLabel(grounds: GroundsView): string {
  if (!grounds.festivalActive) return 'Festival closed';
  return 'Festival Weekend live';
}

/** Board Perks a Directive tier grants, merged for a reward chip list. */
export function directivePerks(directive: DirectiveView): string[] {
  return directive.rewards.perks.map((p) => p.key);
}
