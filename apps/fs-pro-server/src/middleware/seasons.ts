/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import {
  createSeasonRecord,
  getSeasons,
  updateSeasonFields,
} from '../controllers/seasons/season.service';
import { getCompetitionWithClubsAndSeasons } from '../controllers/competitions/competition.service';
import { CompetitionInterface } from '../controllers/competitions/competition.model';
import { createFixtures } from '../controllers/fixtures/fixture.service';
import {
  generateWeekTable,
  generateFixtureObject,
  RoundRobin,
  fixtureInterface,
} from '../utils/seasons';
import { incrementCounter } from '../utils/counter';
import log from '../helpers/logger';
import { ClubInterface } from '../controllers/clubs/club.model';

/**
 * Create Season :)
 *
 * @param competitionCode
 * @param competitionID
 */
export async function create(
  competitionCode: string,
  competitionID: string,
  year: string
) {
  const seasonCode = competitionCode.toUpperCase() + '-' + year;
  const [existingSeason] = await getSeasons({ SeasonCode: seasonCode });

  if (existingSeason) {
    console.log(`Season ${seasonCode} already exists. Skipping creation.`);
    return existingSeason;
  }

  await incrementCounter('season_counter');
  console.log('Counter incremented successfully!');

  log(year);

  const newSeason = () => {
    const data = {
      SeasonCode: seasonCode,
      CompetitionCode: competitionCode,
      CompetitionId: competitionID,
      Year: year,
      Status: 'pending',
      Title: `Season-${competitionCode}-${year}-${Math.round(
        Math.random() * 10
      )}`,
      // Placeholders - Postgres's Seasons.StartDate/EndDate are NOT NULL
      // (Mongo's schema never required them), and neither is meaningfully
      // set until the season actually starts/ends (PATCH /:id/start and
      // the finish-season flow both overwrite these with the real value).
      StartDate: new Date(),
      EndDate: new Date(),
    };

    return createSeasonRecord(data).catch((err: any) => {
      throw err;
    });
  };

  let season_id: string;
  let season_code: string;

  const addSeasonToComp = (season: any) => {
    // createSeasonRecord (repository-backed, both backends) always returns
    // a plain object - no `._doc` (that was Mongoose Document-specific,
    // left over from when this called the raw `.save()`).
    season_id = season._id;
    season_code = season.SeasonCode;

    // Competition.Seasons doesn't exist on Postgres - Seasons.CompetitionId
    // (set above, in `data.CompetitionId = competitionID`) already carries
    // this relationship, nothing left to write. Same no-op as
    // competition.controller.ts's addSeasonToCompetition.
    return Promise.resolve(null);
  };

  let competition: CompetitionInterface;

  const generateFixtures2 = async () => {
    competition = (await getCompetitionWithClubsAndSeasons(
      competitionID
    )) as CompetitionInterface;

    const matchesPerWeek = competition.Clubs.length / 2;

    const roundrobin = new RoundRobin(competition.Clubs.length);

    const rounds = roundrobin.generateFixtures();

    const fixtureObjects = rounds.map((fixture, index) => {
      const home = competition.Clubs[fixture.home] as ClubInterface;
      const away = competition.Clubs[fixture.away] as ClubInterface;
      const data = {
        homeId: home._id,
        awayId: away._id,
        homeCode: home.ClubCode,
        awayCode: away.ClubCode,
        homeName: home.Name,
        awayName: away.Name,
        seasonCode: season_code,
        seasonId: season_id,
        // the compettion of this fixture
        competition: competition._id,
        leagueCode: competition.CompetitionCode.toUpperCase(),
        stadium: home.Stadium!.Name,
        index,
        matchesPerWeek,
        type: competition.Type.toLowerCase(),
        isFinalMatch: index + 1 === rounds.length,
      } as fixtureInterface;
      return generateFixtureObject(data);
    });

    return fixtureObjects;
  };

  const createF = async (fixtureObjects: any) => {
    // respond.success(res, 200, 'Success creating Fixtures', fixtureObjects);

    return createFixtures(fixtureObjects)
      .then((fixtures: any) => {
        const fixtureIds: string[] = fixtures.map((fixture: any) => {
          return fixture._id;
        });

        return fixtureIds;
      })
      .catch((err: any) => {
        throw err;
      });
  };

  const saveFixtures = (fixtureIds: string[]) => {
    // Fixtures doesn't exist on Postgres (dropped in favor of the reverse
    // fixtures.Season FK, already set on each fixture at creation time via
    // generateFixtureObject's `Season: data.seasonId` - see
    // FUTURE-PLANS.md) - updateSeasonFields silently ignores the unknown
    // key there, and still writes the real array field on Mongo.
    return updateSeasonFields(season_id, { Fixtures: fixtureIds } as any);
  };

  // TODO: Make standings separate collection
  const setInitialStandings = () => {
    const numberOfMatches: number =
      (competition.Clubs.length - 1) * competition.Clubs.length;

    const matchesPerWeek = Math.round(competition.Clubs.length / 2);

    const numberOfWeeks: number = numberOfMatches / matchesPerWeek;

    const weeks = [];

    for (let i = 1; i <= numberOfWeeks; i++) {
      const week: { Week: number; Table: any[] } = {
        Week: i,
        Table: [],
      };

      week.Table = generateWeekTable(competition.Clubs as ClubInterface[]);

      weeks.push(week);
    }

    /**
     * This is the Updated Season!
     */
    return updateSeasonFields(season_id, { Standings: weeks });
  };

  return newSeason()
    .then(addSeasonToComp)
    .then(generateFixtures2)
    .then(createF)
    .then(saveFixtures)
    .then(setInitialStandings);
}

interface GenerateFixturesBody {
  seasonCode: string;
  leagueCode: string;
  competitionType: string;
  competitionId: string;
}

/** Get list of all competitions and create seasons for them based on the
 * current year. Plain function (not Express middleware) so it can be
 * called directly from a ts-rest handler - see season.router.ts's
 * createSeason. No two seasons of the same competition and same month and
 * year should exist at the same time.
 *
 * `competitionId` is a required param (not looked up from `competitionCode`)
 * because the original Express version of this never actually set
 * `CompetitionId` on the new season at all - the client sent it under the
 * wrong key (`Competition` instead of `CompetitionId`), so it was silently
 * dropped. Fixed by taking it explicitly, same as the other season-creation
 * path (middleware/seasons.ts's own `create()`, used by calendar) already
 * does correctly. */
export async function createSeasonPlain(
  competitionCode: string,
  competitionId: string,
  title?: string,
  startDate?: string,
  endDate?: string
) {
  const upperCode = competitionCode.toUpperCase();

  // Send Year from Client... In client request for a list of all the
  // Calendars available.
  const year = process.env.CURRENT_YEAR!.trim().toUpperCase();
  const seasonCode = upperCode + '-' + year;

  log(year);

  const data = {
    CompetitionCode: upperCode,
    CompetitionId: competitionId,
    SeasonCode: seasonCode,
    Year: year,
    // Title is NOT NULL with no DB default - the client's Title field has
    // always been optional (see season-form.vue), so fall back to the same
    // generated-title pattern the internal create()'s newSeason above uses,
    // rather than letting the insert fail when it's omitted.
    Title: title ?? `Season-${upperCode}-${year}-${Math.round(Math.random() * 10)}`,
    // Placeholders - see the equivalent comment in the internal create()'s
    // newSeason above for why.
    StartDate: startDate ? new Date(startDate) : new Date(),
    EndDate: endDate ? new Date(endDate) : new Date(),
  };

  const season = await createSeasonRecord(data);
  await incrementCounter('season_counter');
  return season;
}

/** Fetches the Competition (with Clubs/Seasons) that a new Season's
 * fixtures will be generated for. Plain function equivalent of the old
 * fetchCompetitionClubs Express middleware. */
export async function fetchCompetitionForFixtures(competitionId: string) {
  return getCompetitionWithClubsAndSeasons(competitionId);
}

/** Generates and persists a full round-robin Fixture set for a Season,
 * returning the created Fixture ids. Plain function equivalent of the old
 * generateFixtures Express middleware. Things are slightly different for a
 * Cup than for a League - a cup doesn't have all the matches beforehand,
 * and may mix reverse-fixture and straight-knockout formats - not yet
 * handled here (matches the original's scope). */
export async function generateSeasonFixtures(
  competition: CompetitionInterface,
  seasonId: string,
  seasonCode: string,
  leagueCode: string
): Promise<string[]> {
  const matchesPerWeek = competition.Clubs.length / 2;

  const roundrobin = new RoundRobin(competition.Clubs.length);
  const rounds = roundrobin.generateFixtures();

  const fixtureObjects = rounds.map((fixture, index) => {
    const home = competition.Clubs[fixture.home] as ClubInterface;
    const away = competition.Clubs[fixture.away] as ClubInterface;
    const data = {
      homeId: home._id,
      awayId: away._id,
      homeCode: home.ClubCode,
      awayCode: away.ClubCode,
      homeName: home.Name,
      awayName: away.Name,
      seasonCode,
      seasonId,
      leagueCode: leagueCode.toUpperCase(),
      stadium: home.Stadium!.Name,
      index,
      matchesPerWeek,
      type: competition.Type.toLowerCase(),
      isFinalMatch: index + 1 === rounds.length,
    } as fixtureInterface;
    return generateFixtureObject(data);
  });

  const fixtures = await createFixtures(fixtureObjects);
  return fixtures.map((fixture: any) => fixture._id);
}

/** Builds and persists the Season's initial (empty) Standings table, one
 * week per round of the fixture list. Plain function equivalent of the old
 * setInitialStandings Express middleware. */
export async function setSeasonInitialStandings(
  competition: CompetitionInterface,
  seasonId: string
) {
  const numberOfMatches: number =
    (competition.Clubs.length - 1) * competition.Clubs.length;
  const matchesPerWeek = Math.round(competition.Clubs.length / 2);
  const numberOfWeeks: number = numberOfMatches / matchesPerWeek;

  const weeks = [];
  for (let i = 1; i <= numberOfWeeks; i++) {
    const week: { Week: number; Table: any[] } = {
      Week: i,
      Table: generateWeekTable(competition.Clubs as ClubInterface[]),
    };
    weeks.push(week);
  }

  return updateSeasonFields(seasonId, { Standings: weeks });
}
