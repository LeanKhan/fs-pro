import { initServer } from '@ts-rest/express';
import { apiContract as contract } from '@repo/api-contract';
import type { Player as ContractPlayer } from '@repo/api-contract';

import {
  getPlayers,
  getSpecificPlayerStats,
  getPlayerById,
  updatePlayerFields,
  deletePlayerById,
  createPlayer,
  PlayerStatSortKey,
} from './player.service';
import type { PlayerInterface } from './player.model';
import { generateAndSavePlayers } from './player.controller';
import {
  calculatePlayerRating,
  calculatePlayerValue,
} from '../../utils/players';
import { fetchAppearance } from '../../utils/appearance';
import { getNextCounterId } from '../../utils/counter';

const s = initServer();

function fail(err: unknown) {
  return err instanceof Error ? err.message : String(err);
}

export const playerTsRestRoutes = s.router(contract.players, {
  getPlayers: async ({ query }) => {
    try {
      const filter: {
        ClubId?: string;
        ClubCode?: string;
        isSigned?: boolean;
      } = {};
      if (query.club) filter.ClubId = query.club;
      if (query.clubCode) filter.ClubCode = query.clubCode;
      if (query.isSigned !== undefined) filter.isSigned = query.isSigned;

      const players = await getPlayers(filter);
      return {
        status: 200,
        body: {
          success: true,
          message: 'Players fetched successfully',
          payload: players as unknown as ContractPlayer[],
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

  updatePlayer: async ({ params, body }) => {
    try {
      const player = await updatePlayerFields(
        params.id,
        body as Partial<PlayerInterface>
      );
      return {
        status: 200,
        body: {
          success: true,
          message: 'Player updated successfully',
          payload: player as unknown as ContractPlayer,
        },
      };
    } catch (err) {
      return {
        status: 400,
        body: {
          success: false,
          message: 'Error updating Player',
          payload: fail(err),
        },
      };
    }
  },

  createPlayer: async ({ body }) => {
    try {
      const newRating = Math.round(
        calculatePlayerRating(
          body.Attributes as any,
          body.Position as string,
          body.Role as any
        )
      );
      const newValue = calculatePlayerValue(
        body.Position as string,
        newRating,
        body.Age as number
      );

      // Reserves the next PlayerID off the Postgres sequence - the real
      // work the old getCurrentCounter middleware did (via ?model=player);
      // incrementCounter itself is a documented no-op.
      const { field, id } = await getNextCounterId('player');

      const created = await createPlayer({
        ...(body as Partial<PlayerInterface>),
        Rating: newRating,
        Value: newValue,
        [field]: id,
      });

      return {
        status: 200,
        body: {
          success: true,
          message: 'Player created successfully',
          payload: created as unknown as ContractPlayer,
        },
      };
    } catch (err) {
      return {
        status: 400,
        body: {
          success: false,
          message: 'Error creating player',
          payload: fail(err),
        },
      };
    }
  },

  getPlayerRating: async ({ params }) => {
    try {
      const player = (await getPlayerById(params.id)) as PlayerInterface;
      if (!player) {
        return {
          status: 400,
          body: { success: false, message: 'Player not found!' },
        };
      }

      const new_rating = Math.round(
        calculatePlayerRating(player.Attributes, player.Position, player.Role)
      );
      const new_value = calculatePlayerValue(
        player.Position,
        new_rating,
        player.Age
      );

      return {
        status: 200,
        body: {
          success: true,
          message: 'Player Rating and Value successfully',
          payload: { new_rating, new_value },
        },
      };
    } catch (err) {
      return {
        status: 400,
        body: {
          success: false,
          message: fail(err),
        },
      };
    }
  },

  getAppearanceFeatures: async () => {
    try {
      const features = await fetchAppearance();
      return {
        status: 200,
        body: {
          success: true,
          message: 'Fetched Appearance successfully',
          payload: features,
        },
      };
    } catch (err) {
      return {
        status: 400,
        body: {
          success: false,
          message: 'Error fetching appearance features',
          payload: fail(err),
        },
      };
    }
  },

  /** Use like this -> /players/stats?competitionCode=EFL&sortBy=goals&sortDir=desc */
  getPlayerStats: async ({ query }) => {
    try {
      const sortBy = (query.sortBy ?? 'points') as PlayerStatSortKey;
      const sortDir = query.sortDir ?? 'desc';

      const updated = await getSpecificPlayerStats(
        query.competitionCode,
        sortBy,
        sortDir
      );

      return {
        status: 200,
        body: {
          success: true,
          message: `The Best 5 Players by ${sortBy.toUpperCase()}`,
          payload: updated.slice(0, 5) as any,
        },
      };
    } catch (err) {
      return {
        status: 400,
        body: {
          success: false,
          message: 'Error fetching Player stats',
          payload: fail(err),
        },
      };
    }
  },

  generatePlayers: async ({ query }) => {
    try {
      const generated = await generateAndSavePlayers(
        query.number,
        query.culture,
        query.position
      );
      return {
        status: 200,
        body: {
          success: true,
          message: 'Players generated successfully!',
          payload: generated as unknown as ContractPlayer[],
        },
      };
    } catch (err) {
      console.log(err);
      return {
        status: 400,
        body: {
          success: false,
          message: 'Error generating Players',
          payload: fail(err),
        },
      };
    }
  },

  getPlayer: async ({ params }) => {
    try {
      const player = await getPlayerById(params.id);
      return {
        status: 200,
        body: {
          success: true,
          message: 'Player fetched successfully',
          payload: player as unknown as ContractPlayer,
        },
      };
    } catch (err) {
      return {
        status: 400,
        body: {
          success: false,
          message: 'Error fetching Player',
          payload: fail(err),
        },
      };
    }
  },

  deletePlayer: async ({ params }) => {
    try {
      const player = await deletePlayerById(params.id);
      return {
        status: 200,
        body: {
          success: true,
          message: 'Player deleted successfully',
          payload: player as unknown as ContractPlayer,
        },
      };
    } catch (err) {
      return {
        status: 400,
        body: {
          success: false,
          message: 'Error deleting Player => ',
          payload: fail(err),
        },
      };
    }
  },
});
