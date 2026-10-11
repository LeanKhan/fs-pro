/**
 * The defense inbox's pure core (docs/coc-mapping/08 §6.1, 02 §E, OW-N09).
 *
 * The defender sees two streams: the club *inbox* (`play.getInbox` — how fans,
 * the board and the dressing room reacted) and the *defense log*
 * (`play.defenseLog` — one row per resolved raid against this club, with the
 * score, stars, loot lost and the Rest Window / Warm-up Guard). Both are typed
 * contract payloads; this module turns them into render-safe view models and
 * derives the one-line raid headline ("You were raided 1–2, 1★").
 *
 * Pure: no Vue, no network, no clock. Unit-tested in `defense-inbox.test.ts`.
 */
import type {
  DefenseEntry,
  DefenseLog,
  Inbox,
  InboxMessage,
} from '@repo/api-contract';

export type DefenseOutcome = 'win' | 'draw' | 'loss';

/** A resolved raid against this club, as the defense inbox row shows it. */
export interface DefenseView {
  raidId: string;
  attackerName: string;
  attackerCode: string;
  practice: boolean;
  outcome: DefenseOutcome;
  /** "You were raided 1–2, 1★" (or repelled/held for a win/draw). */
  headline: string;
  /** "Repelled" | "Held" | "Raided". */
  outcomeLabel: string;
  /** "1–2" (your goals first — you are the defender). */
  scoreLabel: string;
  stars: number;
  starsLabel: string;
  lootLost: { cash: number; fans: number; tokens: number };
  /** Non-zero lost currencies, in cash/fans/tokens order. */
  lootParts: { key: 'cash' | 'fans' | 'tokens'; amount: number }[];
  hasLoot: boolean;
  /** Absolute UTC timestamps (04 §12) — the panel renders these via CozyCountdown. */
  shieldUntil: string | null;
  guardUntil: string | null;
  resolvedAt: string;
}

/** En dash score, "1–2". */
export function scoreLabel(you: number, them: number): string {
  return `${you}–${them}`;
}

/** The star rating as one token, e.g. `2★`. */
export function starsLabel(stars: number): string {
  return `${Math.max(0, Math.min(3, Math.trunc(stars)))}★`;
}

/** The defender's result from their own goal count first. */
export function defenseOutcome(you: number, them: number): DefenseOutcome {
  if (you > them) return 'win';
  if (you < them) return 'loss';
  return 'draw';
}

/** One-line result copy: "You were raided 1–2, 1★". */
export function defenseHeadline(
  attackerName: string,
  you: number,
  them: number,
  stars: number
): string {
  const score = scoreLabel(you, them);
  const rating = starsLabel(stars);
  switch (defenseOutcome(you, them)) {
    case 'win':
      return `You repelled ${attackerName} ${score} (${rating})`;
    case 'draw':
      return `${attackerName} drew ${score} at your ground (${rating})`;
    default:
      return `Defeated ${score}, ${rating}`;
  }
}

/** A short verb for the row's outcome chip. */
export function defenseOutcomeLabel(outcome: DefenseOutcome): string {
  if (outcome === 'win') return 'Repelled';
  if (outcome === 'draw') return 'Held';
  return 'Conceded';
}

/** One defense log entry as a view model. */
export function defenseView(entry: DefenseEntry): DefenseView {
  const you = entry.score.you;
  const them = entry.score.them;
  const outcome = defenseOutcome(you, them);
  const lootLost = {
    cash: entry.lootLost.cash,
    fans: entry.lootLost.fans,
    tokens: entry.lootLost.tokens,
  };
  const lootParts: DefenseView['lootParts'] = [];
  if (lootLost.cash > 0) lootParts.push({ key: 'cash', amount: lootLost.cash });
  if (lootLost.fans > 0) lootParts.push({ key: 'fans', amount: lootLost.fans });
  if (lootLost.tokens > 0)
    lootParts.push({ key: 'tokens', amount: lootLost.tokens });
  return {
    raidId: entry.raidId,
    attackerName: entry.attackerName,
    attackerCode: entry.attackerCode,
    practice: entry.practice,
    outcome,
    headline: defenseHeadline(
      entry.attackerName,
      you,
      them,
      entry.stars
    ),
    outcomeLabel: defenseOutcomeLabel(outcome),
    scoreLabel: scoreLabel(you, them),
    stars: entry.stars,
    starsLabel: starsLabel(entry.stars),
    lootLost,
    lootParts,
    hasLoot: lootParts.length > 0,
    shieldUntil: entry.shieldUntil,
    guardUntil: entry.guardUntil,
    resolvedAt: entry.resolvedAt,
  };
}

/** Every defense row, newest first (the server sends them newest-first). */
export function defenseViews(log: DefenseLog): DefenseView[] {
  return log.defenses.map(defenseView);
}

/** Inbox messages, newest first, with the unread count. */
export function inboxView(inbox: Inbox): {
  unread: number;
  messages: InboxMessage[];
} {
  const messages = [...inbox.messages].sort(
    (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)
  );
  return { unread: inbox.unread, messages };
}

/** The unread-message count for the HUD/defense badge (never negative). */
export function unreadCount(inbox: Inbox): number {
  return Math.max(0, Math.trunc(inbox.unread));
}
