import { Router } from 'express';
import clubs from '../controllers/clubs/club.router';
import players from '../controllers/players/player.router';
import competitions from '../controllers/competitions/competition.router';
import seasons from '../controllers/seasons/season.router';
import users from '../controllers/user/user.router';
import games from '../controllers/game/game.router';
import calendars from '../controllers/calendar/calendar.router';
import fixtures from '../controllers/fixtures/fixture.router';
import files from '../services/file/file.service';
import managers from '../controllers/managers/manager.router';
import countries from '../controllers/countries/router';
import awards from '../controllers/awards/awards.router';

const router = Router();

router.use('/clubs', clubs);

router.use('/players', players);

router.use('/competitions', competitions);

router.use('/users', users);

router.use('/seasons', seasons);

router.use('/fixtures', fixtures);

router.use('/calendar', calendars);

router.use('/files', files);

router.use('/game', games);

router.use('/managers', managers);

router.use('/countries', countries);

router.use('/awards', awards);

export default router;
