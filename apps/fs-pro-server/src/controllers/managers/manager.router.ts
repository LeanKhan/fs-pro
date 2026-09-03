import { initServer } from '@ts-rest/express';
import { apiContract as contract } from '@repo/api-contract';
import type { Manager as ContractManager } from '@repo/api-contract';

import {
  getManagers,
  getManagerById,
  deleteManagerById,
  updateManager,
  createManager,
} from './manager.service';
import type { ManagerInterface } from './manager.model';
import { appendClubRecord } from '../clubs/club.service';
import { getNextCounterId } from '../../utils/counter';

const s = initServer();

function fail(err: unknown) {
  return err instanceof Error ? err.message : String(err);
}

export const managerTsRestRoutes = s.router(contract.managers, {
  /** populate=Club now goes through the repository too, with Club selected
   * down to Name/ClubCode/LeagueCode. Nationality stays on for every list
   * read here (managers-table.vue/manager-picker.vue both display it) -
   * only the single-manager GET /:id (the edit form) needs a bare
   * NationalityId. */
  getManagers: async ({ query }) => {
    try {
      const managers = await getManagers(
        {
          isEmployed: query.isEmployed,
          ClubId: query.clubId,
        },
        {
          withClub: query.populate === 'Club',
          withNationality: true,
        }
      );

      return {
        status: 200,
        body: {
          success: true,
          message: 'Managers fetched successfully',
          payload: managers as unknown as ContractManager[],
        },
      };
    } catch (err) {
      return {
        status: 400,
        body: {
          success: false,
          message: 'Error fetching Managers',
          payload: fail(err),
        },
      };
    }
  },

  getUnemployedManagers: async () => {
    try {
      const managers = await getManagers(
        { isEmployed: false },
        { withClub: true, withNationality: true }
      );
      return {
        status: 200,
        body: {
          success: true,
          message: 'Managers fetched successfully',
          payload: managers as unknown as ContractManager[],
        },
      };
    } catch (err) {
      return {
        status: 400,
        body: {
          success: false,
          message: 'Error fetching players',
          payload: fail(err),
        },
      };
    }
  },

  getManager: async ({ params, query }) => {
    try {
      const manager =
        query.populate === 'true'
          ? await getManagerById(params.id, { withClub: true })
          : await getManagerById(params.id);

      return {
        status: 200,
        body: {
          success: true,
          message: 'Manager fetched successfully',
          payload: manager as unknown as ContractManager,
        },
      };
    } catch (err) {
      return {
        status: 400,
        body: {
          success: false,
          message: 'Error fetching Manager',
          payload: fail(err),
        },
      };
    }
  },

  /** Extracted from the old getManager -> _updateClub -> deleteManager
   * promise chain: if the Manager is currently employed, record their
   * departure on the Club before deleting them. */
  deleteManager: async ({ params }) => {
    try {
      const manager = await getManagerById(params.id);

      if (manager?.isEmployed && manager.ClubId) {
        // TODO: finish this, refer to manager when adding record
        await appendClubRecord(
          manager.ClubId,
          { ManagerId: null },
          {
            type: 'hired',
            title: `${manager.FirstName} ${manager.LastName} just left the club and the system :/`,
            date: new Date(),
            details: 'Manager is no longer in the system',
          }
        );
      }

      const deleted = await deleteManagerById(params.id);

      return {
        status: 200,
        body: {
          success: true,
          message: 'Manager deleted successfully',
          payload: deleted as unknown as ContractManager,
        },
      };
    } catch (err) {
      return {
        status: 400,
        body: {
          success: false,
          message: 'Error deleting Manager',
          payload: fail(err),
        },
      };
    }
  },

  updateManager: async ({ params, body }) => {
    try {
      const manager = await updateManager(
        params.id,
        body as Partial<ManagerInterface>
      );
      return {
        status: 200,
        body: {
          success: true,
          message: 'Manager updated successfully',
          payload: manager as unknown as ContractManager,
        },
      };
    } catch (err) {
      return {
        status: 400,
        body: {
          success: false,
          message: 'Error updating Manager',
          payload: fail(err),
        },
      };
    }
  },

  createManager: async ({ body }) => {
    try {
      // Reserves the next Key off the Postgres sequence - the real work
      // the old getCurrentCounter middleware did (via ?model=manager);
      // incrementCounter itself is a documented no-op.
      const { field, id } = await getNextCounterId('manager');

      const manager = await createManager({
        ...(body as Partial<ManagerInterface>),
        [field]: id,
      });

      return {
        status: 200,
        body: {
          success: true,
          message: 'Manger created successfully',
          payload: manager as unknown as ContractManager,
        },
      };
    } catch (err) {
      return {
        status: 400,
        body: {
          success: false,
          message: 'Error creating Manager',
          payload: fail(err),
        },
      };
    }
  },
});
