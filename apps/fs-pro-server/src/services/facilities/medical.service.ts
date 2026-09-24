import { and, desc, eq, sql } from 'drizzle-orm';
import { DrizzleDatabase } from '../../db/drizzle';
import { clubs, players, transferLedger } from '../../db/drizzle/schema';
import { getAssetEffects } from './facilities.service';
import log from '../../helpers/logger';

const db = () => DrizzleDatabase.getInstance().database;

const SQUAD_RECOVERY_BASE_COST = 20_000;
const REHAB_BASE_COST = 16_000;
const HYPERBARIC_BASE_COST = 9_000;
const SURGERY_BASE_COST = 45_000;
const SQUAD_RECOVERY_BASE_COOLDOWN_SEC = 900; // 15 minutes

export interface TreatmentCosts {
  squadRecovery: number;
  rehab: number;
  hyperbaric: number;
  surgery: number;
}

export function calculateTreatmentCosts(discount = 0): TreatmentCosts {
  const factor = 1 - Math.min(Math.max(discount, 0), 0.5);
  return {
    squadRecovery: Math.round(SQUAD_RECOVERY_BASE_COST * factor),
    rehab: Math.round(REHAB_BASE_COST * factor),
    hyperbaric: Math.round(HYPERBARIC_BASE_COST * factor),
    surgery: Math.round(SURGERY_BASE_COST * factor),
  };
}

export async function getMedicalStatus(clubId: string) {
  const club = await db().query.clubs.findFirst({ where: eq(clubs.id, clubId) });
  if (!club) throw new Error('Club not found');

  const effects = await getAssetEffects(clubId);
  const facilityLevel = effects.medicalLevel ?? 0;
  const treatmentBays = effects.treatmentBays ?? 1;
  const discount = effects.treatmentDiscount ?? 0;
  const cooldownMultiplier = effects.cooldownMultiplier ?? 1;
  const costs = calculateTreatmentCosts(discount);

  // Check squad recovery cooldown from TransferLedger
  const [lastSquadRecovery] = await db()
    .select({ createdAt: transferLedger.createdAt })
    .from(transferLedger)
    .where(
      and(
        eq(transferLedger.BuyerClubId, clubId),
        eq(transferLedger.Type, 'medical_treatment'),
        eq(transferLedger.Note, 'Squad Cryotherapy Session')
      )
    )
    .orderBy(desc(transferLedger.createdAt))
    .limit(1);

  const cooldownPeriod = Math.round(SQUAD_RECOVERY_BASE_COOLDOWN_SEC * cooldownMultiplier);
  let cooldownSeconds = 0;
  let available = true;

  if (lastSquadRecovery?.createdAt) {
    const elapsedSec = (Date.now() - lastSquadRecovery.createdAt.getTime()) / 1000;
    if (elapsedSec < cooldownPeriod) {
      available = false;
      cooldownSeconds = Math.ceil(cooldownPeriod - elapsedSec);
    }
  }

  // Fetch squad members
  const squad = await db()
    .select({
      id: players.id,
      FirstName: players.FirstName,
      LastName: players.LastName,
      Position: players.Position,
      Age: players.Age,
      Rating: players.Rating,
      Fitness: players.Fitness,
      Injury: players.Injury,
    })
    .from(players)
    .where(and(eq(players.ClubId, clubId), eq(players.isRetired, false)));

  const injuredPlayers = squad
    .filter((p) => p.Injury && Number(p.Injury.daysRemaining) > 0)
    .map((p) => ({
      id: p.id,
      name: `${p.FirstName} ${p.LastName}`,
      position: p.Position ?? 'SUB',
      age: p.Age,
      rating: p.Rating,
      fitness: Math.round(p.Fitness ?? 100),
      injury: p.Injury as { type: string; daysRemaining: number },
    }));

  const fatiguedPlayers = squad
    .filter((p) => (p.Fitness ?? 100) < 85 && (!p.Injury || Number(p.Injury.daysRemaining) <= 0))
    .sort((a, b) => (a.Fitness ?? 100) - (b.Fitness ?? 100))
    .map((p) => ({
      id: p.id,
      name: `${p.FirstName} ${p.LastName}`,
      position: p.Position ?? 'SUB',
      age: p.Age,
      rating: p.Rating,
      fitness: Math.round(p.Fitness ?? 100),
      injury: null,
    }));

  return {
    facilityLevel,
    treatmentBays,
    baysAvailable: treatmentBays,
    squadRecovery: {
      available,
      cooldownSeconds,
      cost: costs.squadRecovery,
    },
    costs,
    injuredPlayers,
    fatiguedPlayers,
  };
}

export async function executeSquadRecovery(clubId: string) {
  const club = await db().query.clubs.findFirst({ where: eq(clubs.id, clubId) });
  if (!club) throw new Error('Club not found');

  const effects = await getAssetEffects(clubId);
  const discount = effects.treatmentDiscount ?? 0;
  const costs = calculateTreatmentCosts(discount);
  const cost = costs.squadRecovery;

  const currentBudget = club.Budget ?? 0;
  if (currentBudget < cost) {
    throw new Error(`Insufficient budget for Squad Cryotherapy ($${cost.toLocaleString()} required)`);
  }

  // Atomic update
  const res = await db().transaction(async (tx) => {
    // 1. Deduct budget
    const [updatedClub] = await tx
      .update(clubs)
      .set({
        Budget: sql`${clubs.Budget} - ${cost}`,
        updatedAt: new Date(),
      })
      .where(eq(clubs.id, clubId))
      .returning({ budget: clubs.Budget });

    // 2. Insert ledger record
    await tx.insert(transferLedger).values({
      Type: 'medical_treatment',
      BuyerClubId: clubId,
      Amount: cost,
      Note: 'Squad Cryotherapy Session',
      updatedAt: new Date(),
    });

    // 3. Recover all players
    await tx.execute(
      sql`UPDATE "Players"
          SET "Fitness" = LEAST(100, COALESCE("Fitness", 100) + 30),
              "Injury" = CASE
                WHEN "Injury" IS NOT NULL AND ("Injury"->>'daysRemaining')::int <= 1 THEN NULL
                WHEN "Injury" IS NOT NULL THEN jsonb_set("Injury", '{daysRemaining}', to_jsonb(("Injury"->>'daysRemaining')::int - 1))
                ELSE "Injury"
              END
          WHERE "ClubId" = ${clubId}::uuid AND "isRetired" = false`
    );

    return updatedClub?.budget ?? (currentBudget - cost);
  });

  log(`[MedicalService] Squad recovery executed for club ${clubId} (Cost: $${cost})`);

  return {
    success: true,
    message: 'Squad Cryotherapy complete! All players recovered +30 Fitness and -1 injury day.',
    cost,
    playersRecovered: 1,
    remainingBudget: res,
  };
}

export async function executePlayerTreatment(
  clubId: string,
  playerId: string,
  treatmentType: 'rehab' | 'hyperbaric' | 'surgery'
) {
  const club = await db().query.clubs.findFirst({ where: eq(clubs.id, clubId) });
  if (!club) throw new Error('Club not found');

  const player = await db().query.players.findFirst({
    where: and(eq(players.id, playerId), eq(players.ClubId, clubId)),
  });
  if (!player) throw new Error('Player not found in your club roster');

  const effects = await getAssetEffects(clubId);
  const facilityLevel = effects.medicalLevel ?? 0;
  const discount = effects.treatmentDiscount ?? 0;
  const costs = calculateTreatmentCosts(discount);

  let cost = 0;
  let actionLabel = '';
  let outcomeMessage = '';

  if (treatmentType === 'rehab') {
    cost = costs.rehab;
    actionLabel = 'Intensive Physio & Rehab';
    if (!player.Injury || Number(player.Injury.daysRemaining) <= 0) {
      throw new Error(`${player.FirstName} ${player.LastName} does not have an active injury`);
    }
  } else if (treatmentType === 'hyperbaric') {
    cost = costs.hyperbaric;
    actionLabel = 'Hyperbaric Oxygen Boost';
  } else if (treatmentType === 'surgery') {
    if (facilityLevel < 3) {
      throw new Error('Specialist Surgery requires Medical Centre Level 3 or higher');
    }
    cost = costs.surgery;
    actionLabel = 'Specialist Surgery';
    if (!player.Injury || Number(player.Injury.daysRemaining) <= 0) {
      throw new Error(`${player.FirstName} ${player.LastName} does not have an active injury to operate on`);
    }
  } else {
    throw new Error('Unknown treatment type');
  }

  const currentBudget = club.Budget ?? 0;
  if (currentBudget < cost) {
    throw new Error(`Insufficient budget for ${actionLabel} ($${cost.toLocaleString()} required)`);
  }

  // Execute treatment
  const result = await db().transaction(async (tx) => {
    // 1. Deduct budget
    const [updatedClub] = await tx
      .update(clubs)
      .set({
        Budget: sql`${clubs.Budget} - ${cost}`,
        updatedAt: new Date(),
      })
      .where(eq(clubs.id, clubId))
      .returning({ budget: clubs.Budget });

    // 2. Insert ledger record
    await tx.insert(transferLedger).values({
      Type: 'medical_treatment',
      BuyerClubId: clubId,
      PlayerId: playerId,
      Amount: cost,
      Note: `${actionLabel}: ${player.FirstName} ${player.LastName}`,
      updatedAt: new Date(),
    });

    // 3. Update player
    if (treatmentType === 'rehab') {
      const cut = Math.max(2, 2 + facilityLevel);
      const curDays = Number(player.Injury?.daysRemaining ?? 0);
      if (curDays <= cut) {
        // Full recovery
        await tx.execute(
          sql`UPDATE "Players"
              SET "Injury" = NULL,
                  "Fitness" = GREATEST(COALESCE("Fitness", 100), 85)
              WHERE _id = ${playerId}::uuid`
        );
        outcomeMessage = `Full recovery! ${player.FirstName} ${player.LastName} is cured of ${player.Injury?.type} and match-ready.`;
      } else {
        const remaining = curDays - cut;
        await tx.execute(
          sql`UPDATE "Players"
              SET "Injury" = jsonb_set("Injury", '{daysRemaining}', to_jsonb(${remaining}::int))
              WHERE _id = ${playerId}::uuid`
        );
        outcomeMessage = `Intensive Rehab shaved ${cut} days off ${player.FirstName}'s recovery (${remaining} days remaining).`;
      }
    } else if (treatmentType === 'hyperbaric') {
      await tx.execute(
        sql`UPDATE "Players"
            SET "Fitness" = 100
            WHERE _id = ${playerId}::uuid`
      );
      outcomeMessage = `${player.FirstName} ${player.LastName} conditioned in the Hyperbaric chamber to 100% Fitness!`;
    } else if (treatmentType === 'surgery') {
      await tx.execute(
        sql`UPDATE "Players"
            SET "Injury" = NULL,
                "Fitness" = 80
            WHERE _id = ${playerId}::uuid`
      );
      outcomeMessage = `Specialist Surgery successful! ${player.FirstName} ${player.LastName}'s injury is completely healed.`;
    }

    // Read back updated player
    const updatedPlayer = await tx.query.players.findFirst({
      where: eq(players.id, playerId),
    });

    return {
      remainingBudget: updatedClub?.budget ?? (currentBudget - cost),
      updatedPlayer,
    };
  });

  const p = result.updatedPlayer!;
  return {
    success: true,
    message: outcomeMessage,
    cost,
    remainingBudget: result.remainingBudget,
    player: {
      id: p.id,
      name: `${p.FirstName} ${p.LastName}`,
      position: p.Position ?? 'SUB',
      age: p.Age,
      rating: p.Rating,
      fitness: Math.round(p.Fitness ?? 100),
      injury: p.Injury as { type: string; daysRemaining: number } | null,
    },
  };
}
