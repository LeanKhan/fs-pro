import {
  CompetitionDefinitionSchema,
  type CompetitionDefinition,
  type EntryConditions,
  type LeagueRules,
  type Rewards,
  type StageDefinition,
} from '@repo/api-contract';

/**
 * Defaults and validation for open-play competition definitions
 * (docs/OPEN-PLAY-COMPETITIONS-SPEC.md). Order of precedence for league
 * rules: these code defaults, then the world's Calendars.DefaultRules, then
 * the stage's own `rules`.
 */

export const DEFAULT_LEAGUE_RULES: LeagueRules = {
  metric: 'ppg',
  tiebreakers: ['gd', 'gf', 'wins'],
  pointsForWin: 3,
  pointsForDraw: 1,
  minGamesToRank: 10,
  maxGames: 40,
  maxVsSameOpponent: 2,
  rematchCooldownDays: 14,
  challengeRange: 5,
  respondWithinDays: 3,
  maxOpenChallenges: 3,
  minDeclinesBeforeForfeit: 3,
};

export const DEFAULT_ENTRY: EntryConditions = {
  mode: 'open',
  minClubs: 4,
  maxClubs: null,
};

export const DEFAULT_REWARDS: Rewards = {
  prizeMoney: [],
  xp: [],
};

export const DEFAULT_XP_PER_MATCH = { win: 30, draw: 15, loss: 5 };

export const DEFAULT_PRESTIGE = 2;

/** Board expectation per Level: 0.4 at Level 0 rising to 0.7 by `topLevel`. */
export function defaultLevelTargets(topLevel = 20): number[] {
  return Array.from(
    { length: topLevel + 1 },
    (_, n) => Math.round((0.4 + (0.3 * n) / topLevel) * 100) / 100
  );
}

/** Full league rules for a league/groups stage. */
export function resolveLeagueRules(
  stage: StageDefinition,
  worldDefaults?: Partial<LeagueRules> | null
): LeagueRules {
  if (stage.type === 'knockout') {
    throw new Error('Knockout stages have no league rules');
  }
  return { ...DEFAULT_LEAGUE_RULES, ...worldDefaults, ...stage.rules };
}

/** What the admin may send: everything with a default can be left out. */
export type CompetitionDefinitionInput = Omit<
  CompetitionDefinition,
  'Prestige' | 'Entry' | 'WinCondition' | 'Rewards'
> & {
  Prestige?: number;
  Entry?: Partial<EntryConditions>;
  WinCondition?: CompetitionDefinition['WinCondition'];
  Rewards?: Partial<Rewards>;
};

export type DefinitionResult =
  | { ok: true; definition: CompetitionDefinition }
  | { ok: false; errors: { path: string; message: string }[] };

/** Fills defaults, then validates. Never throws on bad input. */
export function buildDefinition(
  input: CompetitionDefinitionInput
): DefinitionResult {
  const lastStage = input.Stages?.[input.Stages.length - 1];
  const candidate = {
    ...input,
    Prestige: input.Prestige ?? DEFAULT_PRESTIGE,
    Entry: { ...DEFAULT_ENTRY, ...input.Entry },
    WinCondition:
      input.WinCondition ??
      (lastStage?.type === 'knockout' && input.Stages.length === 1
        ? { type: 'last-standing' as const }
        : { type: 'final-stage' as const }),
    Rewards: { ...DEFAULT_REWARDS, ...input.Rewards },
  };

  const parsed = CompetitionDefinitionSchema.safeParse(candidate);
  if (parsed.success) return { ok: true, definition: parsed.data };
  return {
    ok: false,
    errors: parsed.error.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    })),
  };
}
