/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Request, Response, NextFunction } from 'express';
import respond from '../helpers/responseHandler';
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
      Competition: competitionID,
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

    // Competition.Seasons doesn't exist on Postgres - Seasons.Competition
    // (set above, in `data.Competition = competitionID`) already carries
    // this relationship, nothing left to write. Same no-op as
    // competition.controller.ts's addSeasonToCompetition.
    return Promise.resolve(null);
  };

  let competition: CompetitionInterface;

  const generateFixtures2 = async () => {
    competition = await getCompetitionWithClubsAndSeasons(competitionID) as CompetitionInterface;

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

export function createSeason(req: Request, res: Response, next: NextFunction) {
  // tslint:disable-next-line: variable-name

  /**
   * Get list of all competitions and create seasons for them based on the current year,
   * then update the Calendar by adding dates!
   *
   */

  req.body.data.CompetitionCode = req.body.data.CompetitionCode.toUpperCase();

  // No two seasons of the same competition and same month and year should exist at the same time...

  // Send Year from Client.
  // In client request for a list of all the Calendars available
  const year = process.env.CURRENT_YEAR!.trim().toUpperCase();

  const seasonCode = req.body.data.CompetitionCode + '-' + year;

  // NOTE: Before we were getting Year for Season here...
  //  req.body.data.Year

  log(year);

  const newSeason = () => {
    req.body.data.SeasonCode = seasonCode;
    req.body.data.Year = year;
    // Placeholders if the client didn't send them - see the equivalent
    // comment in the internal create()'s newSeason above for why.
    req.body.data.StartDate = req.body.data.StartDate ?? new Date();
    req.body.data.EndDate = req.body.data.EndDate ?? new Date();
    return createSeasonRecord(req.body.data).catch((err: any) => {
      throw err;
    });
  };

  newSeason()
    .then((season: any) => {
      void incrementCounter('season_counter');
      // createSeasonRecord (repository-backed, both backends) always
      // returns a plain object - no `._doc` (Mongoose-Document-specific,
      // left over from the raw `.save()` this used to call).
      req.body.seasonMongoID = season._id;
      return next();
    })
    .catch((error) => {
      console.error(error);
      return respond.fail(res, 400, 'Error creating Season', error);
    });
}

/**
 * fetch season clubs
 * in the req.body object...
 * competitionId,
 * seasonId,
 * leagueCode,
 *
 * @param req
 * @param res
 * @param next
 */

// TODO: remove this and move to the main function...
export function fetchCompetitionClubs(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const { competitionId } = req.body.data as GenerateFixturesBody;

  getCompetitionWithClubsAndSeasons(competitionId)
    .then((value: any) => {
      req.body.competition = value;
      next();
    })
    .catch((error: any) => {
      respond.fail(res, 400, 'Error fetching competition', error);
    });
}

interface GenerateFixturesBody {
  seasonCode: string;
  leagueCode: string;
  competitionType: string;
  competitionId: string;
}

export function generateFixtures(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const competition: CompetitionInterface = req.body.competition;

  const { leagueCode } = req.body.data as GenerateFixturesBody;

  /**
   * Things are slightly different for a Cup than for a League...
   * - A cup doesn't have all the matches before hand...
   * - A cup may have a mix of more than one type of match, e.g with revers fixtures and straigh tuo knockout!
   */

  const { id: seasonId, code: seasonCode } = req.params;

  const matchesPerWeek = competition.Clubs.length / 2;

  // Round Robin fixtures algorithm
  // h -> Home team , a -> Away team
  // the numbers are the Club numbers

  // const roundrobin = [
  //   { h: 1, a: 4 },
  //   { h: 2, a: 3 },
  //   { h: 1, a: 3 },
  //   { h: 4, a: 2 },
  //   { h: 1, a: 2 },
  //   { h: 3, a: 4 },
  //   { h: 4, a: 1 },
  //   { h: 3, a: 2 },
  //   { h: 3, a: 1 },
  //   { h: 2, a: 4 },
  //   { h: 2, a: 1 },
  //   { h: 4, a: 3 },
  // ];

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

  // respond.success(res, 200, 'Success creating Fixtures', fixtureObjects);

  createFixtures(fixtureObjects)
    .then((fixtures: any) => {
      const fixtureIds: string[] = fixtures.map((fixture: any) => {
        return fixture._id;
      });

      req.body.fixtureIds = fixtureIds;
      next();
    })
    .catch((err: any) => {
      respond.fail(res, 400, 'Error creating Fixtures', err);
    });
}

export function setInitialStandings(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const competition: CompetitionInterface = req.body.competition;

  const seasonId = req.params.id;

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

  updateSeasonFields(seasonId, { Standings: weeks })
    .then((season: any) => {
      next();
    })
    .catch((err: any) => {
      respond.fail(res, 400, 'Error creating Fixtures', err);
    });
}
