import 'dotenv/config';
import { ensureWorldCompetitions } from '../../services/competitions/world-competitions.service';

/**
 * Gives the world its standing competitions (see
 * services/competitions/world-competitions.service.ts): a national Open
 * League for every country with clubs, and the Amateur Cup, each with an
 * edition open for entry. Idempotent; never edits existing competitions.
 */
ensureWorldCompetitions()
  .then((r) => {
    for (const l of r.leagues) console.log(`league ${l.competitionId} created=${l.created} edition=${l.edition ?? 'already live'}`);
    console.log(`amateur cup ${r.amateurCup.competitionId} created=${r.amateurCup.created} edition=${r.amateurCup.edition ?? 'already live'}`);
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
