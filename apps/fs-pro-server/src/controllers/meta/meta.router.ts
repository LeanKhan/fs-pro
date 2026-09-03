import { initServer } from '@ts-rest/express';
import { apiContract as contract } from '@repo/api-contract';

const s = initServer();

export const metaTsRestRoutes = s.router(contract.meta, {
  getDbStatus: async () => {
    return {
      status: 200,
      body: {
        success: true,
        message: 'Database status fetched successfully',
        payload: { backend: 'postgresql' },
      },
    };
  },
});
