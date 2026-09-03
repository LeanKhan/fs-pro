// packages/api-contract/src/index.ts

import { initContract } from '@ts-rest/core';

import { clubsContract } from './routes/clubs';
import { metaContract } from './routes/meta';
import { fixturesContract } from './routes/fixtures';
import { playersContract } from './routes/players';
import { competitionsContract } from './routes/competitions';
import { managersContract } from './routes/managers';
import { calendarContract } from './routes/calendar';
import { placesContract } from './routes/places';
import { awardsContract } from './routes/awards';
import { seasonsContract } from './routes/seasons';
import { usersContract } from './routes/users';
import { gameContract } from './routes/game';

const c = initContract();

// Note: file uploads (/files/upload, /files/upload-clubs) are intentionally
// NOT part of this contract - multipart bodies are a poor fit for ts-rest's
// JSON-first model. They stay plain Express routes indefinitely.

export const apiContract = c.router({
  clubs: clubsContract,
  meta: metaContract,
  fixtures: fixturesContract,
  players: playersContract,
  competitions: competitionsContract,
  managers: managersContract,
  calendar: calendarContract,
  places: placesContract,
  awards: awardsContract,
  seasons: seasonsContract,
  users: usersContract,
  game: gameContract,
});

export type { Club } from './schemas/club';
export type { DbStatus } from './schemas/meta';
export type { Fixture } from './schemas/fixture';
export type { Player, PlayerAttributes } from './schemas/player';
export type { Competition } from './schemas/competition';
export type { Season, ClubStandings, WeekStandings } from './schemas/season';
export type { Manager, ManagerClubRef } from './schemas/manager';
export type { Calendar, Day } from './schemas/calendar';
export type { Place } from './schemas/place';
export type { Award } from './schemas/award';
export type { User } from './schemas/user';
export type { Tactic, PlayResult, GameResults } from './schemas/game';
