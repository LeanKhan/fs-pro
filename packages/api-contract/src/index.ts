// packages/api-contract/src/index.ts

import { initContract } from '@ts-rest/core';

import { clubsContract } from './routes/clubs';

const c = initContract();

export const apiContract = c.router({
  clubs: clubsContract,
});

export type { Club } from './schemas/club';
