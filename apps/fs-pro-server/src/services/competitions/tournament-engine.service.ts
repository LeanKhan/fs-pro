import { eq, and, desc, inArray } from 'drizzle-orm';
import { DrizzleDatabase } from '../../db/drizzle';
import {
  competitions,
  competitionClubs,
  seasons,
  fixtures,
  clubs as clubsTable,
} from '../../db/drizzle/schema';
import { getClubs, getClubById } from '../../controllers/clubs/club.service';
import { syncPlacesFromWorld } from '../worldPlaceService';
import {
  getCompetitions,
  getCompetitionById,
  getCompetitionWithClubsAndSeasons,
  createCompetition,
} from '../../controllers/competitions/competition.service';
import {
  getSeasons,
  getSeasonById,
  updateSeasonFields,
} from '../../controllers/seasons/season.service';
import {
  createFixtures,
  getFixtures,
  updateFixtureFields,
} from '../../controllers/fixtures/fixture.service';
import { getCalendar } from '../../controllers/calendar/calendar.service';
import { ClubInterface } from '../../controllers/clubs/club.model';
import { SeasonInterface, ClubStandings } from '../../controllers/seasons/season.model';
import { Fixture } from '../../controllers/fixtures/fixture.model';

import { compileStandings } from '../../utils/seasons';
import { payoutSeasonPrizes } from '../economy/prize-money.service';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Clubs each league sends to the continental competition. */
const CONTINENTAL_SPOTS_PER_LEAGUE = 4;

/** Days between knockout rounds. Even, so rounds keep the even-day offset
 * that separates cup/continental days from the league's odd days (see
 * arrangeSeasonFixturesAcrossDays). */
const KNOCKOUT_ROUND_GAP_DAYS = 8;

export interface GroupStandingItem {
  ClubCode: string;
  ClubID: string;
  Points: number;
  Played: number;
  Wins: number;
  Draws: number;
  Losses: number;
  GF: number;
  GA: number;
  GD: number;
}

export class TournamentEngineService {
  /**
   * Ensures the tournament competitions exist and their member lists are
   * current:
   *  - one domestic cup per country (`CountryId` set), every club in that
   *    country entered regardless of league/division;
   *  - one continental competition (`CCL`) whose members are the top 4 clubs
   *    of every league's most recent finished season (top 4 by Rating per
   *    league when a league has no finished season yet - first season only).
   *
   * `year` is the season cycle about to start: a competition that already
   * has a Season for that year keeps its member list, so re-running this
   * never reshuffles a season in progress.
   */
  static async seedDefaultTournaments(year?: string): Promise<{
    cups: any[];
    ccl: any;
  }> {
    // Refresh country rows from the world before grouping clubs by country. Best effort: offline keeps the local snapshot.
    try {
      await syncPlacesFromWorld();
    } catch (err) {
      console.warn('World place sync skipped:', err);
    }
    const allCompetitions: any[] = await getCompetitions(undefined, {
      withCountry: true,
    });
    const leagues = allCompetitions.filter(
      (c) => c.League || c.Type?.toLowerCase() === 'league'
    );
    const allClubs = await getClubs();
    const leagueById = new Map<string, any>(
      leagues.map((l) => [l._id as string, l])
    );

    const clubCountry = (club: ClubInterface): string | undefined =>
      club.AddressCountryId ?? leagueById.get(club.LeagueId ?? '')?.CountryId;

    const alreadySeeded = async (competition: any): Promise<boolean> => {
      if (!year) return false;
      const existing = await getSeasons({
        CompetitionId: competition._id,
        Year: year,
      });
      return existing.length > 0;
    };

    // 1. Domestic cups - one per country that has a league.
    const countries = new Map<string, any>();
    for (const league of leagues) {
      if (league.CountryId) countries.set(league.CountryId, league.Country);
    }

    const cups: any[] = [];
    for (const [countryId, country] of countries) {
      let cup = allCompetitions.find(
        (c) =>
          (c.Cup || c.Type?.toLowerCase() === 'cup') && c.CountryId === countryId
      );
      if (!cup) {
        const code = (country?.Code ?? countryId.slice(0, 4)).toUpperCase();
        console.log(`[TournamentEngine] Creating domestic cup for ${code}...`);
        cup = await createCompetition({
          Name: `${country?.Name ?? code} Association Cup`,
          CompetitionCode: `FAC-${code}`,
          CompetitionID: `fac-${code.toLowerCase()}`,
          Type: 'cup',
          Cup: true,
          League: false,
          Tournament: false,
          Division: 0,
          NumberOfTeams: 0,
          NumberOfWeeks: 0,
          CountryId: countryId,
        } as any);
      }

      if (!(await alreadySeeded(cup))) {
        const members = allClubs.filter((c) => clubCountry(c) === countryId);
        await this.replaceMembers(
          cup._id as string,
          members.map((c) => c._id as string)
        );
      }
      cups.push(cup);
    }

    // 2. Continental competition - qualifiers from previous-season league tables.
    let ccl = allCompetitions.find((c) => c.CompetitionCode === 'CCL');
    if (!ccl) {
      console.log('[TournamentEngine] Creating Continental Champions League (CCL)...');
      ccl = await createCompetition({
        Name: 'Continental Champions League',
        CompetitionCode: 'CCL',
        CompetitionID: 'ccl',
        Type: 'tournament',
        Tournament: true,
        Cup: false,
        League: false,
        Division: 0,
        NumberOfTeams: 16,
        NumberOfWeeks: 9,
      } as any);
    }

    if (!(await alreadySeeded(ccl))) {
      const qualifiers = await this.computeContinentalQualifiers(leagues, allClubs);
      await this.replaceMembers(ccl._id as string, qualifiers);
    }

    return { cups, ccl };
  }

  /** Replaces a competition's member list in the `competitionClubs` join table. */
  private static async replaceMembers(competitionId: string, clubIds: string[]) {
    const db = DrizzleDatabase.getInstance().database;
    await db
      .delete(competitionClubs)
      .where(eq(competitionClubs.CompetitionId, competitionId));
    for (const clubId of new Set(clubIds)) {
      await db
        .insert(competitionClubs)
        .values({
          CompetitionId: competitionId,
          ClubId: clubId,
          updatedAt: new Date(),
        } as any)
        .onConflictDoNothing();
    }
  }

  /** Top 4 of each league's most recent finished season; falls back to the
   * 4 highest-rated clubs of a league that has not finished a season yet. */
  private static async computeContinentalQualifiers(
    leagues: any[],
    allClubs: ClubInterface[]
  ): Promise<string[]> {
    const qualifiers: string[] = [];
    for (const league of leagues) {
      const finished = (await getSeasons({ CompetitionId: league._id }))
        .filter((s) => s.isFinished)
        .sort(
          (a, b) =>
            new Date(b.EndDate).getTime() - new Date(a.EndDate).getTime()
        );

      let ids: string[] = [];
      if (finished[0]) {
        const season = await getSeasonById(finished[0]._id as string);
        if (season?.Standings?.length) {
          ids = compileStandings(season.Standings)
            .slice(0, CONTINENTAL_SPOTS_PER_LEAGUE)
            .map((s: ClubStandings) => s.ClubID);
        }
      }
      if (!ids.length) {
        ids = allClubs
          .filter((c) => c.LeagueId === league._id)
          .sort((a, b) => (b.Rating ?? 0) - (a.Rating ?? 0))
          .slice(0, CONTINENTAL_SPOTS_PER_LEAGUE)
          .map((c) => c._id as string);
      }
      qualifiers.push(...ids);
    }
    return qualifiers;
  }

  /** Cups without a country are the retired single global cup from before
   * domestic cups existed - kept for its history, never given new seasons. */
  static isRetiredGlobalCup(competition: {
    Cup?: boolean;
    Type?: string;
    CountryId?: string | null;
  }): boolean {
    return (
      (competition.Cup === true || competition.Type?.toLowerCase() === 'cup') &&
      !competition.CountryId
    );
  }

  private static stageName(size: number): string {
    if (size === 2) return 'Final';
    if (size === 4) return 'Semi-Final';
    if (size === 8) return 'Quarter-Final';
    return `Round of ${size}`;
  }

  private static stageSize(stage: string): number | null {
    if (stage === 'Final') return 2;
    if (stage === 'Semi-Final') return 4;
    if (stage === 'Quarter-Final') return 8;
    const match = /^Round of (\d+)$/.exec(stage);
    return match ? Number(match[1]) : null;
  }

  private static stageCode(size: number): string {
    if (size === 2) return 'FINAL';
    if (size === 4) return 'SF';
    if (size === 8) return 'QF';
    return `R${size}`;
  }

  /**
   * Builds one knockout round for `participants` (length = a power of two,
   * ordered by bracket slot): slot j plays slot (size - 1 - j), so the
   * highest remaining seed always meets the lowest. A `null` participant is
   * a first-round bye and produces no fixture.
   */
  private static buildCupRound(params: {
    competition: any;
    seasonId: string;
    seasonCode: string;
    participants: (ClubInterface | null)[];
    day: number;
    date: Date;
    week: number;
  }): any[] {
    const { competition, seasonId, seasonCode, participants, day, date, week } =
      params;
    const size = participants.length;
    const stage = this.stageName(size);
    const code = this.stageCode(size);
    const fixtureObjects: any[] = [];

    for (let slot = 0; slot < size / 2; slot++) {
      const home = participants[slot];
      const away = participants[size - 1 - slot];
      if (!home || !away) continue;

      fixtureObjects.push({
        FixtureCode:
          size === 2
            ? `${seasonCode}|FINAL`
            : `${seasonCode}|${code}-M${slot + 1}`,
        Title: `${home.Name} vs ${away.Name}`,
        SeasonCode: seasonCode,
        LeagueCode: competition.CompetitionCode?.toUpperCase() ?? 'FAC',
        SeasonId: seasonId,
        Home: home.ClubCode,
        Away: away.ClubCode,
        HomeTeamId: home._id,
        AwayTeamId: away._id,
        Stadium:
          size === 2
            ? 'National Association Stadium'
            : ((home.Stadium as any)?.Name ?? 'Cup Stadium'),
        Type: 'cup',
        Stage: stage,
        Tie: stage,
        Week: week,
        ScheduledDay: day,
        ScheduledDate: date,
        isFinalMatch: size === 2,
      });
    }
    return fixtureObjects;
  }

  /**
   * Generates the first knockout round of a domestic cup. The field is any
   * size: it is padded up to the next power of two with phantom seeds, so
   * the top-rated clubs get first-round byes and everyone else plays.
   */
  static async createCupInitialFixtures(params: {
    competition: any;
    seasonId: string;
    seasonCode: string;
    clubs: ClubInterface[];
    startDay?: number;
  }): Promise<string[]> {
    const { competition, seasonId, seasonCode, clubs, startDay = 2 } = params;
    if (clubs.length < 2) {
      console.warn('[TournamentEngine] Not enough clubs for cup fixtures:', clubs.length);
      return [];
    }

    const calendar = await getCalendar();
    const currentDay = calendar?.CurrentDay ?? 0;
    const currentDate = calendar?.CurrentDate ?? new Date();

    const seeded = [...clubs]
      .map((club) => ({ club, tiebreak: Math.random() }))
      .sort(
        (a, b) =>
          (b.club.Rating ?? 0) - (a.club.Rating ?? 0) || a.tiebreak - b.tiebreak
      )
      .map((s) => s.club);

    let size = 2;
    while (size < seeded.length) size *= 2;
    const participants: (ClubInterface | null)[] = Array.from(
      { length: size },
      (_, i) => seeded[i] ?? null
    );

    const scheduledDay = Math.max(currentDay + 1, currentDay + startDay);
    const scheduledDate = new Date(
      currentDate.getTime() + (scheduledDay - currentDay) * DAY_MS
    );

    const fixtureObjects = this.buildCupRound({
      competition,
      seasonId,
      seasonCode,
      participants,
      day: scheduledDay,
      date: scheduledDate,
      week: 1,
    });

    const created = await createFixtures(fixtureObjects);
    return created.map((f: any) => f._id as string);
  }

  /**
   * Generates 6 matchdays of Group Stage fixtures for Continental Champions League.
   * 16 clubs split into 4 groups of 4 (Groups A, B, C, D).
   */
  static async createGroupStageInitialFixtures(params: {
    competition: any;
    seasonId: string;
    seasonCode: string;
    clubs: ClubInterface[];
    startDay?: number;
  }): Promise<{ fixtureIds: string[]; standings: any[] }> {
    const { competition, seasonId, seasonCode, clubs, startDay = 4 } = params;
    const calendar = await getCalendar();
    const currentDay = calendar?.CurrentDay ?? 0;
    const currentDate = calendar?.CurrentDate ?? new Date();

    // Draw from rating pots: the 16 clubs are ranked and cut into 4 pots of
    // 4; each group gets one club per pot, drawn at random within its pot.
    const ranked = [...clubs].sort((a, b) => (b.Rating ?? 0) - (a.Rating ?? 0));
    const pots = [0, 1, 2, 3].map((pot) =>
      ranked
        .slice(pot * 4, pot * 4 + 4)
        .map((club) => ({ club, tiebreak: Math.random() }))
        .sort((a, b) => a.tiebreak - b.tiebreak)
        .map((entry) => entry.club)
    );
    const groups = ['A', 'B', 'C', 'D'].map((letter, g) => ({
      letter,
      clubs: pots.map((pot) => pot[g]).filter(Boolean),
    }));

    const standingsGroups: any[] = [];
    const fixtureObjects: any[] = [];

    // Group round-robin schedule (4 clubs: 0, 1, 2, 3)
    // 6 matchdays:
    // MD1: 0v1, 2v3
    // MD2: 0v2, 3v1
    // MD3: 0v3, 1v2
    // MD4: 1v0, 3v2 (reverse)
    // MD5: 2v0, 1v3 (reverse)
    // MD6: 3v0, 2v1 (reverse)
    const matchdayPairings: [number, number][][] = [
      [[0, 1], [2, 3]],
      [[0, 2], [3, 1]],
      [[0, 3], [1, 2]],
      [[1, 0], [3, 2]],
      [[2, 0], [1, 3]],
      [[3, 0], [2, 1]],
    ];

    for (const group of groups) {
      if (group.clubs.length < 4) continue;

      const groupTable: GroupStandingItem[] = group.clubs.map((c) => ({
        ClubCode: c.ClubCode,
        ClubID: c._id as string,
        Points: 0,
        Played: 0,
        Wins: 0,
        Draws: 0,
        Losses: 0,
        GF: 0,
        GA: 0,
        GD: 0,
      }));

      standingsGroups.push({
        Group: group.letter,
        Table: groupTable,
      });

      // Generate fixtures for this group across 6 matchdays
      for (let md = 1; md <= 6; md++) {
        const pairings = matchdayPairings[md - 1];
        const matchdayOffset = (md - 1) * KNOCKOUT_ROUND_GAP_DAYS;
        const scheduledDay = currentDay + startDay + matchdayOffset;
        const scheduledDate = new Date(
          currentDate.getTime() + (scheduledDay - currentDay) * DAY_MS
        );

        for (let matchIdx = 0; matchIdx < pairings.length; matchIdx++) {
          const [hIdx, aIdx] = pairings[matchIdx];
          const home = group.clubs[hIdx];
          const away = group.clubs[aIdx];

          fixtureObjects.push({
            FixtureCode: `${seasonCode}|G${group.letter}-MD${md}-M${matchIdx + 1}`,
            Title: `${home.Name} vs ${away.Name}`,
            SeasonCode: seasonCode,
            LeagueCode: competition.CompetitionCode?.toUpperCase() ?? 'CCL',
            SeasonId: seasonId,
            Home: home.ClubCode,
            Away: away.ClubCode,
            HomeTeamId: home._id,
            AwayTeamId: away._id,
            Stadium: (home.Stadium as any)?.Name ?? 'Champions Stadium',
            Type: 'tournament',
            Stage: `Group ${group.letter}`,
            Tie: `Group ${group.letter} - Matchday ${md}`,
            Week: md,
            ScheduledDay: scheduledDay,
            ScheduledDate: scheduledDate,
            isFinalMatch: false,
          });
        }
      }
    }

    const created = await createFixtures(fixtureObjects);
    const fixtureIds = created.map((f: any) => f._id as string);

    return { fixtureIds, standings: standingsGroups };
  }

  /**
   * Inspects active Cup and Continental Champions League seasons, generates subsequent
   * knockout rounds when prior stages complete, and marks finished seasons with WinnerId.
   */
  static async checkAndAdvanceTournaments(): Promise<void> {
    const allSeasons = await getSeasons();
    const activeSeasons = allSeasons.filter((s) => !s.isFinished);
    if (!activeSeasons.length) return;

    for (const seasonStub of activeSeasons) {
      if (!seasonStub._id) continue;
      const season = await getSeasonById(seasonStub._id);
      if (!season || !season.CompetitionId) continue;

      const competition = await getCompetitionById(season.CompetitionId);
      if (!competition) continue;

      if (competition.Cup || competition.Type === 'cup') {
        await this.advanceCupSeason(season, competition);
      } else if (competition.Tournament || competition.Type === 'tournament') {
        await this.advanceTournamentSeason(season, competition);
      }
    }
  }

  /**
   * Advances a single-elimination domestic cup of any size. Each round's
   * fixtures are keyed by bracket slot (`-M<slot+1>` in the FixtureCode); when
   * every fixture of the latest round is played, the slot winners (plus, after
   * the first round, the clubs that had a bye) become the next round's
   * participants. The Final's winner finishes the season.
   */
  private static async advanceCupSeason(season: SeasonInterface, competition: any) {
    const seasonFixtures = await getFixtures({ SeasonId: season._id });
    if (!seasonFixtures.length) return;

    const calendar = await getCalendar();
    const currentDate = calendar?.CurrentDate ?? new Date();

    const rounds = new Map<number, Fixture[]>();
    for (const fixture of seasonFixtures) {
      const size = this.stageSize(fixture.Stage);
      if (size === null) continue;
      rounds.set(size, [...(rounds.get(size) ?? []), fixture]);
    }
    if (!rounds.size) return;

    // Latest round = smallest bracket size that has fixtures.
    const currentSize = Math.min(...rounds.keys());
    const currentRound = rounds.get(currentSize)!;
    if (!currentRound.every((f) => f.Played)) return;

    // 1. Final played -> complete
    if (currentSize === 2) {
      if (season.isFinished) return;
      const winnerId = (currentRound[0].Details as any)?.Winner?.id ?? null;
      console.log(`[TournamentEngine] ${season.SeasonCode} Final completed! Winner: ${winnerId}`);
      await updateSeasonFields(season._id as string, {
        isFinished: true,
        Status: 'completed',
        EndDate: new Date(),
        WinnerId: winnerId,
      });
      await this.payPrizes(season._id as string);
      return;
    }

    // 2. Round complete -> generate the next one
    console.log(`[TournamentEngine] ${this.stageName(currentSize)} complete for ${season.SeasonCode}. Generating next round...`);

    // Clubs that skipped the first round (members with no fixture at all),
    // strongest first, fill the slots that have no fixture.
    const playedClubIds = new Set(
      seasonFixtures.flatMap((f) => [f.HomeTeamId, f.AwayTeamId])
    );
    const withMembers = await getCompetitionWithClubsAndSeasons(competition._id as string);
    const byeClubs = ((withMembers?.Clubs ?? []) as ClubInterface[])
      .filter((c) => !playedClubIds.has(c._id as string))
      .sort((a, b) => (b.Rating ?? 0) - (a.Rating ?? 0));

    const slotWinners = new Map<number, ClubInterface>();
    for (const fixture of currentRound) {
      const code: string = (fixture as any).FixtureCode ?? fixture.FixtureID ?? '';
      const slot = Number(/-M(\d+)$/.exec(code)?.[1]);
      const [winner] = await this.extractWinners([fixture]);
      if (slot && winner) slotWinners.set(slot - 1, winner);
    }

    const participants: ClubInterface[] = [];
    for (let slot = 0; slot < currentSize / 2; slot++) {
      const club = slotWinners.get(slot) ?? byeClubs.shift();
      if (!club) {
        console.warn(`[TournamentEngine] No club for slot ${slot} of ${this.stageName(currentSize)} in ${season.SeasonCode}`);
        return;
      }
      participants.push(club);
    }

    const maxDay = Math.max(...currentRound.map((f) => f.ScheduledDay ?? 0));
    const nextDay = maxDay + KNOCKOUT_ROUND_GAP_DAYS;
    const nextDate = new Date(
      currentDate.getTime() + (nextDay - calendar.CurrentDay) * DAY_MS
    );

    const newFixtures = this.buildCupRound({
      competition,
      seasonId: season._id as string,
      seasonCode: season.SeasonCode,
      participants,
      day: nextDay,
      date: nextDate,
      week: rounds.size + 1,
    });
    await createFixtures(newFixtures);
  }

  /**
   * Advances Continental Champions League:
   * Group Stage (48 matches) -> Knockout QF (4) -> SF (2) -> Final (1) -> Completed.
   */
  private static async advanceTournamentSeason(season: SeasonInterface, competition: any) {
    const seasonFixtures = await getFixtures({ SeasonId: season._id });
    if (!seasonFixtures.length) return;

    const calendar = await getCalendar();
    const currentDate = calendar?.CurrentDate ?? new Date();

    const groupFixtures = seasonFixtures.filter((f) => f.Stage.startsWith('Group'));
    const qfFixtures = seasonFixtures.filter((f) => f.Stage === 'Quarter-Final');
    const sfFixtures = seasonFixtures.filter((f) => f.Stage === 'Semi-Final');
    const finalFixtures = seasonFixtures.filter((f) => f.Stage === 'Final');

    // 1. Group Stage -> QF
    if (groupFixtures.length >= 48 && qfFixtures.length === 0) {
      const allGroupPlayed = groupFixtures.every((f) => f.Played);
      if (allGroupPlayed) {
        console.log(`[TournamentEngine] Group Stage complete for ${season.SeasonCode}. Calculating standings & generating QF...`);

        // Calculate table for each group
        const groupQualifiers = await this.computeGroupQualifiers(groupFixtures);
        const maxDay = Math.max(...groupFixtures.map((f) => f.ScheduledDay ?? 0));
        const qfDay = maxDay + KNOCKOUT_ROUND_GAP_DAYS;
        const qfDate = new Date(currentDate.getTime() + (qfDay - calendar.CurrentDay) * DAY_MS);

        // Pairings:
        // QF1: Winner A vs Runner-up B
        // QF2: Winner B vs Runner-up A
        // QF3: Winner C vs Runner-up D
        // QF4: Winner D vs Runner-up C
        const pairings = [
          { home: groupQualifiers.A.winner, away: groupQualifiers.B.runnerUp },
          { home: groupQualifiers.B.winner, away: groupQualifiers.A.runnerUp },
          { home: groupQualifiers.C.winner, away: groupQualifiers.D.runnerUp },
          { home: groupQualifiers.D.winner, away: groupQualifiers.C.runnerUp },
        ];

        const newFixtures: any[] = [];
        for (let i = 0; i < pairings.length; i++) {
          const { home, away } = pairings[i];
          newFixtures.push({
            FixtureCode: `${season.SeasonCode}|QF-M${i + 1}`,
            Title: `${home.Name} vs ${away.Name}`,
            SeasonCode: season.SeasonCode,
            LeagueCode: competition.CompetitionCode?.toUpperCase() ?? 'CCL',
            SeasonId: season._id,
            Home: home.ClubCode,
            Away: away.ClubCode,
            HomeTeamId: home._id,
            AwayTeamId: away._id,
            Stadium: (home.Stadium as any)?.Name ?? 'Champions Arena',
            Type: 'tournament',
            Stage: 'Quarter-Final',
            Tie: 'Quarter-Final',
            Week: 7,
            ScheduledDay: qfDay,
            ScheduledDate: qfDate,
            isFinalMatch: false,
          });
        }
        await createFixtures(newFixtures);
        return;
      }
    }

    // 2. QF -> SF
    if (qfFixtures.length === 4 && sfFixtures.length === 0) {
      const allQfPlayed = qfFixtures.every((f) => f.Played);
      if (allQfPlayed) {
        console.log(`[TournamentEngine] QF complete for ${season.SeasonCode}. Generating Semi-Finals...`);
        const winners = await this.extractWinners(qfFixtures);
        const maxDay = Math.max(...qfFixtures.map((f) => f.ScheduledDay ?? 0));
        const sfDay = maxDay + KNOCKOUT_ROUND_GAP_DAYS;
        const sfDate = new Date(currentDate.getTime() + (sfDay - calendar.CurrentDay) * DAY_MS);

        // QF1 winner vs QF3 winner, QF2 winner vs QF4 winner
        const pairings = [
          { home: winners[0], away: winners[2] },
          { home: winners[1], away: winners[3] },
        ];

        const newFixtures: any[] = [];
        for (let i = 0; i < pairings.length; i++) {
          const { home, away } = pairings[i];
          newFixtures.push({
            FixtureCode: `${season.SeasonCode}|SF-M${i + 1}`,
            Title: `${home.Name} vs ${away.Name}`,
            SeasonCode: season.SeasonCode,
            LeagueCode: competition.CompetitionCode?.toUpperCase() ?? 'CCL',
            SeasonId: season._id,
            Home: home.ClubCode,
            Away: away.ClubCode,
            HomeTeamId: home._id,
            AwayTeamId: away._id,
            Stadium: (home.Stadium as any)?.Name ?? 'Champions Arena',
            Type: 'tournament',
            Stage: 'Semi-Final',
            Tie: 'Semi-Final',
            Week: 8,
            ScheduledDay: sfDay,
            ScheduledDate: sfDate,
            isFinalMatch: false,
          });
        }
        await createFixtures(newFixtures);
        return;
      }
    }

    // 3. SF -> Final
    if (sfFixtures.length === 2 && finalFixtures.length === 0) {
      const allSfPlayed = sfFixtures.every((f) => f.Played);
      if (allSfPlayed) {
        console.log(`[TournamentEngine] SF complete for ${season.SeasonCode}. Generating Final...`);
        const winners = await this.extractWinners(sfFixtures);
        const maxDay = Math.max(...sfFixtures.map((f) => f.ScheduledDay ?? 0));
        const finalDay = maxDay + KNOCKOUT_ROUND_GAP_DAYS;
        const finalDate = new Date(currentDate.getTime() + (finalDay - calendar.CurrentDay) * DAY_MS);

        const home = winners[0];
        const away = winners[1];
        const newFixture = {
          FixtureCode: `${season.SeasonCode}|FINAL`,
          Title: `${home.Name} vs ${away.Name}`,
          SeasonCode: season.SeasonCode,
          LeagueCode: competition.CompetitionCode?.toUpperCase() ?? 'CCL',
          SeasonId: season._id,
          Home: home.ClubCode,
          Away: away.ClubCode,
          HomeTeamId: home._id,
          AwayTeamId: away._id,
          Stadium: 'Grand Continental Stadium',
          Type: 'tournament' as const,
          Stage: 'Final',
          Tie: 'Final',
          Week: 9,
          ScheduledDay: finalDay,
          ScheduledDate: finalDate,
          isFinalMatch: true,
        };
        await createFixtures([newFixture]);
        return;
      }
    }

    // 4. Final played -> complete
    if (finalFixtures.length === 1 && finalFixtures[0].Played && !season.isFinished) {
      const finalMatch = finalFixtures[0];
      const winnerId = (finalMatch.Details as any)?.Winner?.id ?? null;
      console.log(`[TournamentEngine] ${season.SeasonCode} Champions League Final completed! Winner: ${winnerId}`);
      await updateSeasonFields(season._id as string, {
        isFinished: true,
        Status: 'completed',
        EndDate: new Date(),
        WinnerId: winnerId,
      });
      await this.payPrizes(season._id as string);
    }
  }

  /** Prize money for a season that just finished; logged, never thrown, since
   * the season itself is already saved as finished (and payouts are idempotent). */
  private static async payPrizes(seasonId: string) {
    try {
      await payoutSeasonPrizes(seasonId);
    } catch (error) {
      console.error('[TournamentEngine] Could not pay out prize money:', error);
    }
  }

  /**
   * Helper: resolves winner Club objects from an array of played knockout fixtures.
   */
  private static async extractWinners(fixturesArr: Fixture[]): Promise<ClubInterface[]> {
    const winners: ClubInterface[] = [];
    for (const f of fixturesArr) {
      const winnerId = (f.Details as any)?.Winner?.id;
      if (winnerId) {
        const club = await getClubById(winnerId);
        if (club) {
          winners.push(club);
          continue;
        }
      }
      // Fallback: higher score or home club
      const homeScore = (f.Details as any)?.HomeTeamScore ?? 0;
      const awayScore = (f.Details as any)?.AwayTeamScore ?? 0;
      const fallbackId = homeScore >= awayScore ? f.HomeTeamId : f.AwayTeamId;
      const fallbackClub = await getClubById(fallbackId);
      if (fallbackClub) winners.push(fallbackClub);
    }
    return winners;
  }

  /**
   * Helper: computes top 2 clubs (winner and runner-up) for each group (A, B, C, D).
   */
  private static async computeGroupQualifiers(groupFixtures: Fixture[]): Promise<{
    [groupLetter: string]: { winner: ClubInterface; runnerUp: ClubInterface };
  }> {
    const letters = ['A', 'B', 'C', 'D'];
    const qualifiers: any = {};

    for (const letter of letters) {
      const gFix = groupFixtures.filter((f) => f.Stage === `Group ${letter}`);
      const statsMap = new Map<
        string,
        { clubId: string; clubCode: string; pts: number; gd: number; gf: number }
      >();

      for (const f of gFix) {
        const hId = f.HomeTeamId;
        const aId = f.AwayTeamId;
        if (!statsMap.has(hId)) statsMap.set(hId, { clubId: hId, clubCode: f.Home, pts: 0, gd: 0, gf: 0 });
        if (!statsMap.has(aId)) statsMap.set(aId, { clubId: aId, clubCode: f.Away, pts: 0, gd: 0, gf: 0 });

        const hScore = Number((f.Details as any)?.HomeTeamScore ?? 0);
        const aScore = Number((f.Details as any)?.AwayTeamScore ?? 0);

        const hStats = statsMap.get(hId)!;
        const aStats = statsMap.get(aId)!;

        hStats.gf += hScore;
        hStats.gd += hScore - aScore;
        aStats.gf += aScore;
        aStats.gd += aScore - hScore;

        if (hScore > aScore) {
          hStats.pts += 3;
        } else if (aScore > hScore) {
          aStats.pts += 3;
        } else {
          hStats.pts += 1;
          aStats.pts += 1;
        }
      }

      const ranked = Array.from(statsMap.values()).sort((a, b) => {
        if (b.pts !== a.pts) return b.pts - a.pts;
        if (b.gd !== a.gd) return b.gd - a.gd;
        return b.gf - a.gf;
      });

      const winnerClub = (await getClubById(ranked[0]?.clubId)) ?? (await getClubById(gFix[0].HomeTeamId))!;
      const runnerUpClub = (await getClubById(ranked[1]?.clubId)) ?? (await getClubById(gFix[0].AwayTeamId))!;

      qualifiers[letter] = {
        winner: winnerClub,
        runnerUp: runnerUpClub,
      };
    }

    return qualifiers;
  }
}
