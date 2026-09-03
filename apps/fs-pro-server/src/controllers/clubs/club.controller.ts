import respond from '../../helpers/responseHandler';
import { NextFunction, Request, Response } from 'express';
import {
  getManagerById,
  appendManagerRecord,
} from '../managers/manager.service';
import {
  createManyClubs,
  getClubById,
  updateClubFields,
  appendClubRecord,
} from './club.service';
import log from '../../helpers/logger';
import { readCSVFileAsync, readCSVFileUploadAsync } from '../../utils/csv';
import multer from 'multer';
import { addClubsToUser } from '../user/user.service';
import { IClub } from '../../interfaces/Club';

export const upload_csv = multer({ dest: 'tmp/csv/' });

/** Hire a Manager for a Club - a Club must fire its current Manager (if
 * any) before hiring a new one. Plain function (not an Express handler) so
 * it can be called directly from the ts-rest handler in club.router.ts. */
export async function hireManagerForClub(
  clubId: string,
  managerId: string,
  details?: string
) {
  const manager = await getManagerById(managerId);
  if (!manager) {
    throw new Error('Manager does not exist!');
  }

  const club = await getClubById(clubId);
  if (!club) {
    throw new Error('Club does not exist!');
  }

  if (club.ManagerId) {
    throw new Error(
      'Club already has a manager. Remove manager before you can hire a new one'
    );
  }

  // TODO: make all this record more information in 'Records'

  // Both writes below go through the repository's plain-field `update` +
  // a read-modify-write Records append (`appendManagerRecord`/
  // `appendClubRecord`) instead of the `$set`/`$push` operator object this
  // used to build - see FUTURE-PLANS.md for the Club conversion writeup.
  await appendManagerRecord(
    manager._id as string,
    { isEmployed: true, ClubId: club._id },
    {
      type: 'hired',
      title: `${manager.FirstName} ${manager.LastName} joined ${club.Name} as their new manager`,
      date: new Date(),
      details,
      club: club._id,
    }
  );

  await appendClubRecord(
    club._id as string,
    { ManagerId: manager._id },
    {
      type: 'manager-hire',
      title: `Hired ${manager.FirstName} ${manager.LastName} as new manager!`,
      date: new Date(),
      details,
      manager: manager._id,
    }
  );

  log('Hired New Manager!');
}

/** Fire a Club's current Manager. Plain function (not an Express handler)
 * so it can be called directly from the ts-rest handler in club.router.ts. */
export async function fireManagerFromClub(clubId: string, reason?: string) {
  const club = await getClubById(clubId);
  if (!club) {
    throw new Error('Club does not exist!');
  }

  const manager = await appendManagerRecord(
    club.ManagerId as string,
    { isEmployed: false, ClubId: null },
    {
      type: 'manager-leaving',
      title: `Left ${club.Name} as their new manager.`,
      date: new Date(),
      club: clubId,
      details: reason,
    }
  );

  if (!manager) {
    throw new Error('Manager does not exist!');
  }

  await appendClubRecord(
    clubId,
    { ManagerId: null },
    {
      type: 'manager-leaving',
      title: `Manager ${manager.FirstName} ${manager.LastName} left the club`,
      date: new Date(),
      manager: manager._id,
      details: reason,
    }
  );

  log('Removed Manager');
}

// TODO: add Manager, League, LeagueCcode, Players
// Rating and the Position Ratings

const groupBy = function (data: any[], key: string) {
  return data.reduce(
    function (storage: any, item: any) {
      const group = item[key];

      storage[group] = storage[group] || [];

      storage[group].push(item);

      return storage;
    },
    {} as Record<string, any[]>
  );
};

/**
 * This function is meant to create many clubs from a list of clubs
 * It requires that you pass a csv filename saved in files directory
 * as a 'filename' query param.
 *
 */
export async function createManyClubsFromCSV(req: Request, res: Response) {
  let data: { data: any[]; rowCount: number } = { data: [], rowCount: 0 };

  // Competition.Clubs doesn't exist on Postgres - each club's own `League`
  // field (already set from the CSV row when created via createManyClubs)
  // is the reverse FK source of truth, so there's nothing left to sync here.
  const saveClubsInCompetition = (clubs: IClub[]) => Promise.resolve(null);

  const saveClubsInUser = (clubs: IClub[]) => {
    const user_clubs = groupBy(clubs, 'UserId');

    const all_club_ids: Record<string, string[]> = {};

    const promise_array: Promise<any>[] = [];

    for (const u of Object.keys(user_clubs)) {
      all_club_ids[u] = user_clubs[u].map((i: any) => i._id);
    }

    for (const u of Object.keys(all_club_ids)) {
      promise_array.push(addClubsToUser(u, all_club_ids[u]));
    }

    return Promise.all(promise_array);
  };

  try {
    if (!req.file) {
      return respond.fail(res, 400, 'No file uploaded', null);
    }

    data = await readCSVFileUploadAsync(req.file.path);
    // let club_ids = [];
    // the next thing for this would be to use the
    // generated objects to create Mongoose records
    let club_ids: string[] = [];
    let created_clubs: any[] = [];
    createManyClubs(data.data)
      .then((clubs: any) => {
        // get ids...
        club_ids = clubs.map((club: any) => club._id);
        created_clubs = clubs;
        return Promise.all([
          saveClubsInUser(clubs),
          saveClubsInCompetition(clubs),
        ]);
        // return clubs;
      })
      // .then(saveClubsInUser)
      .then((c: any) => {
        console.log('Updated Users and  Clubs => ', c);
        return club_ids;
      })
      // .then(saveClubsInCompetition)
      .then((comp: any) => {
        log('Clubs created successfully from upload');
        return respond.success(
          res,
          200,
          'Clubs created and Competition updated successfully!',
          created_clubs
        );
      })
      .catch((err: any) => {
        console.error(err);
        console.log('Failed to create Clubs and update Competition!', err);
        return respond.fail(res, 400, 'Failed to add Days to Calendar', err);
      });
  } catch (err) {
    console.error('ERROR READING CSV ', err);
    return respond.fail(
      res,
      400,
      'Error reading CSV File',
      (err as Error).toString()
    );
  }
}
