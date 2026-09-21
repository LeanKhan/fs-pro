import { eq } from 'drizzle-orm';
import { DrizzleDatabase } from '../../db/drizzle';
import { clubs, players } from '../../db/drizzle/schema';
import { JevService, ChoiceAnswer } from './jev.service';

export interface TransferScoutReport {
  player: any;
  recommendation: 'MUST_BUY' | 'RECOMMENDED' | 'ROTATION' | 'OVERPRICED' | 'HIGH_RISK';
  dealRating: number;
  confidence: number;
  verdict: string;
  tacticalFit: string;
  tacticalFitLevel: 'EXCELLENT' | 'GOOD' | 'NEUTRAL' | 'POOR';
  financialAssessment: string;
  squadRole: string;
  squadRoleLevel: 'STARTER_UPGRADE' | 'KEY_DEPTH' | 'FUTURE_PROSPECT' | 'SURPLUS';
  comparisonWithSquad: {
    currentBestRating: number | null;
    ratingDelta: number;
    samePositionCount: number;
  };
  source: 'jev' | 'local';
}

function generateVerdictText(
  player: any,
  recommendation: string,
  ratingDelta: number,
  currentBest: number | null
): string {
  const name = `${player.FirstName} ${player.LastName}`;
  switch (recommendation) {
    case 'MUST_BUY':
      return currentBest !== null && ratingDelta > 0
        ? `High-priority target: ${name} is an immediate +${ratingDelta} OVR upgrade for your starting lineup with elite tactical value.`
        : `High-priority target: ${name} offers premier quality and exceptional squad impact at this price point.`;
    case 'RECOMMENDED':
      return `Solid acquisition: ${name} provides reliable starting quality and technical balance at a sensible market valuation.`;
    case 'ROTATION':
      return `Useful squad depth: ${name} will strengthen bench options and rotation during tight matchday schedules.`;
    case 'OVERPRICED':
      return `Valuation alert: While ${name} possesses talent, the requested transfer fee and wage demand exceed market efficiency for this position.`;
    case 'HIGH_RISK':
      return `Caution advised: High financial burden or age profile makes this transfer a significant gamble relative to current squad requirements.`;
    default:
      return `${name} is currently scouted as a viable transfer candidate.`;
  }
}

function generateTacticalText(
  player: any,
  style: string,
  level: string,
  attrs: Record<string, any>
): string {
  const s = style.toLowerCase();
  if (s.includes('press')) {
    const pace = attrs.Speed ?? 50;
    const stamina = attrs.Stamina ?? 50;
    return `In your High Press system, ${player.LastName}'s stamina (${stamina}) and pace (${pace}) provide the physical engine needed to disrupt opposition build-up.`;
  }
  if (s.includes('possession')) {
    const pass = attrs.ShortPass ?? 50;
    const ctrl = attrs.Control ?? 50;
    return `In your Possession structure, ${player.LastName}'s passing (${pass}) and ball control (${ctrl}) ensure fluid distribution and tempo control.`;
  }
  if (s.includes('block')) {
    const tack = attrs.Tackling ?? 50;
    const mark = attrs.Marking ?? attrs.Positioning ?? 50;
    return `In your Low Block defensive shape, ${player.LastName}'s tackling (${tack}) and marking (${mark}) strengthen defensive compactness.`;
  }
  if (s.includes('direct')) {
    const speed = attrs.Speed ?? 50;
    const shoot = attrs.Shooting ?? 50;
    return `In your Direct setup, ${player.LastName}'s speed (${speed}) and finishing (${shoot}) facilitate rapid counter-attacking transitions.`;
  }
  return `Balanced profile: ${player.LastName} adapts comfortably to your tactical instructions with no glaring structural trade-offs.`;
}

function generateFinancialText(
  player: any,
  budget: number,
  valuation: number,
  wage: number
): string {
  const pct = budget > 0 ? Math.round((valuation / budget) * 100) : 100;
  if (!player.ClubId) {
    return `Free Agent: Zero transfer fee required. Requires only annual wage commitment, making this an ultra-cost-effective signing.`;
  }
  if (pct <= 25) {
    return `Minor financial impact: Fee represents only ${pct}% of your available transfer budget, leaving ample flexibility for other moves.`;
  }
  if (pct <= 60) {
    return `Moderate investment: Fee consumes ${pct}% of available transfer funds with sustainable wage impact.`;
  }
  return `Major financial commitment: Consumes ${pct}% of your current transfer budget. Careful wage management advised.`;
}

function generateRoleText(
  player: any,
  roleLevel: string,
  delta: number,
  samePosCount: number
): string {
  if (roleLevel === 'STARTER_UPGRADE') {
    return `Starting XI Upgrade: Projected first-choice ${player.Position}, immediately boosting lineup strength by +${Math.max(1, delta)} OVR.`;
  }
  if (roleLevel === 'FUTURE_PROSPECT') {
    return `Future Prospect: Young talent (Age ${player.Age}) with significant developmental upside and long-term resale potential.`;
  }
  if (roleLevel === 'KEY_DEPTH') {
    return `Key Squad Cover: Competes for a starting berth alongside ${samePosCount} current ${player.Position}s and provides matchday security.`;
  }
  return `Squad Depth: Provides secondary coverage across rotational fixtures.`;
}

export async function scoutPlayerTransfer(
  playerId: string,
  clubId: string
): Promise<TransferScoutReport> {
  const db = DrizzleDatabase.getInstance().database;

  // 1. Fetch player and club
  const [player] = await db.select().from(players).where(eq(players.id, playerId)).limit(1);
  if (!player) {
    throw new Error('Player not found');
  }

  const [club] = await db.select().from(clubs).where(eq(clubs.id, clubId)).limit(1);
  if (!club) {
    throw new Error('Club not found');
  }

  const squad = await db.select().from(players).where(eq(players.ClubId, clubId));

  // 2. Position context
  const samePos = squad.filter((p) => p.Position === player.Position);
  const currentBest = samePos.length > 0 ? Math.max(...samePos.map((p) => Math.round(p.Rating ?? 0))) : null;
  const ratingDelta = currentBest !== null ? Math.round(player.Rating ?? 0) - currentBest : 0;

  // 3. Tactic & Financial Context
  const playingStyle = club.Tactic?.styleName ?? 'Balanced';
  const formation = club.Tactic?.formationName ?? '4-3-3';
  const budget = club.Budget ?? 0;
  const valuation = player.Value ?? 0;
  const wage = player.Wage ?? 0;
  const attrs = (player.Attributes as Record<string, any>) ?? {};

  const state = {
    clubName: club.Name,
    budget,
    playingStyle,
    formation,
    targetPlayer: {
      name: `${player.FirstName} ${player.LastName}`,
      age: player.Age,
      position: player.Position,
      rating: Math.round(player.Rating ?? 0),
      value: valuation,
      wage,
      isFreeAgent: !player.ClubId,
      attributes: {
        pace: attrs.Speed ?? 50,
        passing: attrs.ShortPass ?? 50,
        shooting: attrs.Shooting ?? 50,
        tackling: attrs.Tackling ?? 50,
        stamina: attrs.Stamina ?? 50,
        mental: attrs.Mental ?? 50,
      },
    },
    squadContext: {
      squadSize: squad.length,
      samePositionCount: samePos.length,
      currentBestRatingInPosition: currentBest,
      ratingDelta,
      canAffordValue: budget >= valuation,
      budgetSharePercent: budget > 0 ? Math.round((valuation / budget) * 100) : 100,
    },
  };

  // 4. Ask Jev
  const jevRes = await JevService.ask(state, {
    transferVerdict: {
      type: 'choice',
      instructions:
        'Evaluate whether this player transfer is a must-buy, recommended, rotation depth, overpriced, or high risk for the club.',
      criteria: {
        MUST_BUY: 'Exceptional starting upgrade and high tactical value within financial limits',
        RECOMMENDED: 'Solid addition that improves squad depth or starting quality at a fair price',
        ROTATION: 'Decent squad option or depth player, but not a clear upgrade over current starters',
        OVERPRICED: 'Asking price or wage is excessive relative to player rating and squad budget',
        HIGH_RISK: 'Advanced age, poor tactical fit, or disproportionate budget consumption',
      },
    },
    tacticalFit: {
      type: 'choice',
      instructions:
        'Evaluate how well the player attributes match the club tactical playing style (High Press, Possession, Direct, etc.).',
      criteria: {
        EXCELLENT: 'Attributes directly reinforce key tactical demands of the playing style',
        GOOD: 'Well suited to the system with minor attribute trade-offs',
        NEUTRAL: 'Standard baseline fit with no distinct advantages or drawbacks',
        POOR: 'Attributes clash with tactical demands (e.g. low stamina/pace in High Press)',
      },
    },
    squadRole: {
      type: 'choice',
      instructions: 'Classify the expected role of this player in the club squad.',
      criteria: {
        STARTER_UPGRADE: 'Immediate first-choice starter upgrading the position',
        KEY_DEPTH: 'Valuable rotational starter and reliable cover for match congestion',
        FUTURE_PROSPECT: 'Young talent with room to develop and accrue resale value',
        SURPLUS: 'Unnecessary depth given current roster strength at this position',
      },
    },
  });

  const verdictAnswer = jevRes.answers?.transferVerdict as ChoiceAnswer<
    'MUST_BUY' | 'RECOMMENDED' | 'ROTATION' | 'OVERPRICED' | 'HIGH_RISK'
  >;
  const tacticalAnswer = jevRes.answers?.tacticalFit as ChoiceAnswer<'EXCELLENT' | 'GOOD' | 'NEUTRAL' | 'POOR'>;
  const roleAnswer = jevRes.answers?.squadRole as ChoiceAnswer<
    'STARTER_UPGRADE' | 'KEY_DEPTH' | 'FUTURE_PROSPECT' | 'SURPLUS'
  >;

  const recommendation = verdictAnswer?.choice ?? (ratingDelta > 0 && budget >= valuation ? 'MUST_BUY' : 'RECOMMENDED');
  const confidence = Math.round((verdictAnswer?.confidence ?? 0.88) * 100);
  const tacticalFitLevel = tacticalAnswer?.choice ?? 'GOOD';
  const squadRoleLevel = roleAnswer?.choice ?? (ratingDelta > 0 ? 'STARTER_UPGRADE' : 'KEY_DEPTH');

  let dealRating = 75;
  if (recommendation === 'MUST_BUY') dealRating = Math.min(98, 88 + Math.round(confidence * 0.1));
  else if (recommendation === 'RECOMMENDED') dealRating = Math.min(86, 75 + Math.round(confidence * 0.1));
  else if (recommendation === 'ROTATION') dealRating = 65;
  else if (recommendation === 'OVERPRICED') dealRating = 48;
  else if (recommendation === 'HIGH_RISK') dealRating = 35;

  return {
    player,
    recommendation,
    dealRating,
    confidence,
    verdict: generateVerdictText(player, recommendation, ratingDelta, currentBest),
    tacticalFit: generateTacticalText(player, playingStyle, tacticalFitLevel, attrs),
    tacticalFitLevel,
    financialAssessment: generateFinancialText(player, budget, valuation, wage),
    squadRole: generateRoleText(player, squadRoleLevel, ratingDelta, samePos.length),
    squadRoleLevel,
    comparisonWithSquad: {
      currentBestRating: currentBest,
      ratingDelta,
      samePositionCount: samePos.length,
    },
    source: jevRes.source ?? 'jev',
  };
}
