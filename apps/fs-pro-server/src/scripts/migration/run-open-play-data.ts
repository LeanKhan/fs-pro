import 'dotenv/config';
import { migrateOpenPlayData } from './open-play-data';

/**
 * Convert scheduled-season data to open play (see open-play-data.ts).
 * Take a database backup first.
 *
 *   npx ts-node src/scripts/migration/run-open-play-data.ts            # dry run: report only
 *   npx ts-node src/scripts/migration/run-open-play-data.ts --apply    # write it
 *   ... --apply --abandon    # also cancel part-played legacy seasons
 */
async function main() {
  const apply = process.argv.includes('--apply');
  const abandon = process.argv.includes('--abandon');
  const report = await migrateOpenPlayData({ apply, abandon });

  console.log(JSON.stringify(report, null, 2));
  if (report.blockedBy.length) {
    console.error(
      `\nNot migrated: ${report.blockedBy.length} season(s) are part-played (${report.blockedBy.join(', ')}). ` +
        'Finish them first, or re-run with --abandon to cancel their unplayed fixtures.'
    );
    process.exit(2);
  }
  console.log(
    report.applied
      ? '\nApplied.'
      : '\nDry run only: nothing was written. Re-run with --apply.'
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
