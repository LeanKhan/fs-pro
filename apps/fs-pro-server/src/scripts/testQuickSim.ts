import * as fs from 'fs';
import * as path from 'path';
import { QuickSimResolver } from '../simulation/quick-sim/QuickSimResolver';
import { IClub } from '../interfaces/Club';
import { ITactic } from '../simulation/state/PersistentState/Formations';
import { SimulateMatchRequest } from '../jobs/simulationContract';

interface IRosterPool {
  dumpedAt: string;
  clubs: IClub[];
  tactics: Record<string, ITactic>;
}

const POOL_PATH = path.join(__dirname, 'fixtures', 'simulation-roster-pool.json');

function runTest(matchCount = 1000) {
  console.log(`Loading roster pool from ${POOL_PATH}...`);
  const raw = fs.readFileSync(POOL_PATH, 'utf-8');
  const pool: IRosterPool = JSON.parse(raw);
  const clubs = pool.clubs;

  if (clubs.length < 2) {
    throw new Error('Not enough clubs in roster pool!');
  }

  console.log(`Loaded ${clubs.length} clubs. Simulating ${matchCount} matches via QuickSimResolver...`);

  const startTime = Date.now();

  let totalGoals = 0;
  let homeWins = 0;
  let awayWins = 0;
  let draws = 0;
  let totalYellows = 0;
  let totalReds = 0;
  let totalCleanSheets = 0;

  for (let i = 0; i < matchCount; i++) {
    // Pick two random distinct clubs
    const idx1 = Math.floor(Math.random() * clubs.length);
    let idx2 = Math.floor(Math.random() * clubs.length);
    while (idx2 === idx1) {
      idx2 = Math.floor(Math.random() * clubs.length);
    }

    const homeClub = clubs[idx1];
    const awayClub = clubs[idx2];

    const homeTactic = pool.tactics[homeClub._id as string] ?? {
      formationName: '433',
      styleName: 'Balanced',
    };
    const awayTactic = pool.tactics[awayClub._id as string] ?? {
      formationName: '433',
      styleName: 'Balanced',
    };

    const request: SimulateMatchRequest = {
      fixtureId: `test-fixture-${i}`,
      clubs: [homeClub, awayClub],
      sides: {
        home: homeClub._id as string,
        away: awayClub._id as string,
      },
      tactics: {
        home: homeTactic,
        away: awayTactic,
      },
    };

    const result = QuickSimResolver.resolve(request);

    const hGoals = result.Details.HomeTeamScore;
    const aGoals = result.Details.AwayTeamScore;
    totalGoals += hGoals + aGoals;

    if (hGoals > aGoals) homeWins++;
    else if (aGoals > hGoals) awayWins++;
    else draws++;

    totalYellows += result.Details.HomeTeamDetails.YellowCards + result.Details.AwayTeamDetails.YellowCards;
    totalReds += result.Details.HomeTeamDetails.RedCards + result.Details.AwayTeamDetails.RedCards;

    if (hGoals === 0 || aGoals === 0) totalCleanSheets++;

    // Sanity assertion on details
    if (!result.Details.MOTM || !result.Details.MOTM.id) {
      throw new Error(`Match ${i} missing MOTM!`);
    }
    if (result.Details.HomeTeamDetails.PlayerStats.length < Math.min(11, homeClub.Players?.length ?? 0)) {
      throw new Error(`Match ${i} home squad has fewer player stats than signed players!`);
    }
  }

  const durationMs = Date.now() - startTime;
  const avgMsPerMatch = durationMs / matchCount;

  console.log('\n================ QUICK SIM RESULTS ================');
  console.log(`Total Matches Simulated: ${matchCount}`);
  console.log(`Total Elapsed Time:      ${durationMs} ms`);
  console.log(`Average Time Per Match:  ${avgMsPerMatch.toFixed(3)} ms`);
  console.log(`Goals Per Match:         ${(totalGoals / matchCount).toFixed(2)}`);
  console.log(`Home Win Rate:           ${((homeWins / matchCount) * 100).toFixed(1)}%`);
  console.log(`Away Win Rate:           ${((awayWins / matchCount) * 100).toFixed(1)}%`);
  console.log(`Draw Rate:               ${((draws / matchCount) * 100).toFixed(1)}%`);
  console.log(`Yellow Cards Per Match:  ${(totalYellows / matchCount).toFixed(2)}`);
  console.log(`Red Cards Per Match:     ${(totalReds / matchCount).toFixed(2)}`);
  console.log(`Clean Sheet Rate:        ${((totalCleanSheets / matchCount) * 100).toFixed(1)}%`);
  console.log('===================================================\n');

  if (avgMsPerMatch > 5.0) {
    console.warn(`WARNING: Target was < 5.0ms per match, achieved ${avgMsPerMatch.toFixed(3)}ms`);
  } else {
    console.log(`SUCCESS: Performance target met (< 5.0ms per match)!`);
  }
}

const count = parseInt(process.argv[2] ?? '1000', 10);
runTest(count);
