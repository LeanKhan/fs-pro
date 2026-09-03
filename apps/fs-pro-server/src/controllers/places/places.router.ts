import { initServer } from '@ts-rest/express';
import { apiContract as contract } from '@repo/api-contract';
import type { Place as ContractPlace } from '@repo/api-contract';

import {
  getAllPlaces,
  getPlace,
  getPlaceByNameOrCode,
  updatePlace,
} from './places.service';

const s = initServer();

function fail(err: unknown) {
  return err instanceof Error ? err.message : String(err);
}

export const placeTsRestRoutes = s.router(contract.places, {
  getPlaces: async ({ query }) => {
    try {
      const places = await getAllPlaces({
        Type: query.type,
        Code: query.code,
        Name: query.name,
        Region: query.region,
      });
      return {
        status: 200,
        body: {
          success: true,
          message: 'Places fetched successfully',
          payload: places as unknown as ContractPlace[],
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

  getCountries: async () => {
    try {
      const places = await getAllPlaces({ Type: 'country' });
      return {
        status: 200,
        body: {
          success: true,
          message: 'Countries fetched successfully',
          payload: places as unknown as ContractPlace[],
        },
      };
    } catch (err) {
      return {
        status: 400,
        body: {
          success: false,
          message: 'Error fetching Countries',
          payload: fail(err),
        },
      };
    }
  },

  getPlace: async ({ params }) => {
    try {
      const place = await getPlace(params.id);
      return {
        status: 200,
        body: {
          success: true,
          message: 'Place fetched successfully',
          payload: place as unknown as ContractPlace,
        },
      };
    } catch (err) {
      return {
        status: 400,
        body: {
          success: false,
          message: 'Error fetching Place',
          payload: fail(err),
        },
      };
    }
  },

  getPlaceByName: async ({ params }) => {
    try {
      const place = await getPlaceByNameOrCode(params.name);
      return {
        status: 200,
        body: {
          success: true,
          message: 'Place fetched successfully',
          payload: place as unknown as ContractPlace,
        },
      };
    } catch (err) {
      return {
        status: 400,
        body: {
          success: false,
          message: 'Error fetching Place',
          payload: fail(err),
        },
      };
    }
  },

  updatePlace: async ({ params, body }) => {
    try {
      const place = await updatePlace(params.id, body);
      return {
        status: 200,
        body: {
          success: true,
          message: 'Place updated successfully',
          payload: place as unknown as ContractPlace,
        },
      };
    } catch (err) {
      return {
        status: 400,
        body: {
          success: false,
          message: 'Error updating Place',
          payload: fail(err),
        },
      };
    }
  },
});
