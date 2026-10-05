import 'dotenv/config';
import { ensureWorldCompetitions } from '../../services/competitions/world-competitions.service';

/**
 * Gives the world its standing competitions (see
 * services/competitions/world-competitions.service.ts): a pyramid league
 * for every country with clubs (drawn when none is running), and the
 * Amateur Cup with an edition open for entry. Idempotent; never edits
 * existing competitions.
 */
ensureWorldCompetitions()
  .then((r) => {
    for (const l of r.leagues)
      console.log(`pyramid ${l.competitionId}: ${l.clubs} clubs, ${l.divisions} divisions, ${l.pools} pools, ${l.fixtures} fixtures`);
    console.log(`amateur cup ${r.amateurCup.competitionId} created=${r.amateurCup.created} edition=${r.amateurCup.edition ?? 'already live'}`);
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
