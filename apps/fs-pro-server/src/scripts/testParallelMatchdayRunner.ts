import 'dotenv/config';

import { MatchdayRunnerService } from '../services/calendar/matchday-runner.service';
import { getCalendar } from '../controllers/calendar/calendar.service';
import { getFixturesByDay, findNextUnplayedDay } from '../controllers/fixtures/fixture.service';

async function main() {
  console.log('--- Testing Fail-Safe Parallel Matchday Runner ---');

  const cal = await getCalendar();
  console.log(`Current Calendar Day: ${cal.CurrentDay} (${cal.CurrentDate})`);

  let testDay = cal.CurrentDay;
  let fixtures = await getFixturesByDay(testDay);
  let unplayed = fixtures.filter(f => !f.Played);

  if (unplayed.length === 0) {
    const next = await findNextUnplayedDay(testDay);
    if (!next) {
      console.log('No unplayed days found in calendar.');
      process.exit(0);
    }
    testDay = next.day;
    fixtures = await getFixturesByDay(testDay);
    unplayed = fixtures.filter(f => !f.Played);
    console.log(`Found next unplayed day: Day ${testDay} (${fixtures.length} fixtures, ${unplayed.length} unplayed)`);
  } else {
    console.log(`Day ${testDay} has ${fixtures.length} fixtures (${unplayed.length} unplayed)`);
  }

  const startMs = Date.now();
  const run = await MatchdayRunnerService.simulateDay(testDay, { concurrency: 4 });
  const durationMs = Date.now() - startMs;

  console.log('\n--- SIMULATION RESULTS ---');
  console.log(`Simulated Day:        ${run.day}`);
  console.log(`Total Fixtures:       ${run.totalFixtures}`);
  console.log(`Successfully Sim'd:   ${run.simulatedFixtures}`);
  console.log(`Failed Fixtures:      ${run.failedFixtures}`);
  console.log(`Advanced to Day:      ${run.advancedToDay}`);
  console.log(`Execution Time:       ${durationMs} ms`);
  console.log('--------------------------\n');

  process.exit(0);
}

main().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
