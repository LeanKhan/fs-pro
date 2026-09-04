import 'dotenv/config';
import { newAttributeRatings, calculatePlayerRating } from './src/utils/players';
import { Roles } from './src/controllers/players/player.model';

function makeBasePlayer(age: number, rating: number, position: string) {
  // Build attributes that roughly produce the target rating for this position,
  // by setting every attribute to a flat baseline tuned to land near `rating`.
  const role = (Roles as any)[position][0];
  const base: any = {
    PreferredFoot: 'right', AttackingMindset: true, DefensiveMindset: true,
  };
  const attrs = ['Speed','Shooting','LongPass','ShortPass','Mental','Control','Tackling',
    'Dribbling','SetPiece','Strength','Stamina','Vision','ShotPower','Aggression',
    'Interception','Keeping','Marking','Agility','Positioning','Crossing','LongShot'];
  attrs.forEach(a => base[a] = rating);
  return {
    _id: 'sim', FirstName: 'Sim', LastName: 'Player', Age: age, Position: position,
    Role: role, Attributes: base, Rating: calculatePlayerRating(base, position, role),
    Value: 0, isSigned: true, GoalsScored: 0, ShirtNumber: '9', PlayerID: 'SIM',
  };
}

function trial(age: number, ratingTarget: number, position: string, pnts: number) {
  const player = makeBasePlayer(age, ratingTarget, position);
  const startRating = player.Rating;
  const origLog = console.log;
  console.log = () => {}; // silence the function's internal console.log spam
  const { new_rating } = newAttributeRatings(player as any, pnts);
  console.log = origLog;
  return new_rating - startRating;
}

function runScenario(label: string, age: number, ratingTarget: number, position: string, pnts: number, N = 300) {
  const deltas: number[] = [];
  for (let i = 0; i < N; i++) deltas.push(trial(age, ratingTarget, position, pnts));
  const min = Math.min(...deltas), max = Math.max(...deltas);
  const mean = deltas.reduce((a,b) => a+b, 0) / N;
  const sorted = [...deltas].sort((a,b) => a-b);
  const p90 = sorted[Math.floor(N * 0.9)];
  console.log(`${label.padEnd(45)} min=${min.toString().padStart(3)} mean=${mean.toFixed(2).padStart(6)} p90=${p90.toString().padStart(3)} max=${max.toString().padStart(3)}`);
}

console.log('=== Rating delta over ONE year, by age (fixed avg pnts=7, rating=55, MID) ===');
[16, 18, 20, 22, 25, 28, 30, 32, 34, 36].forEach(age => {
  runScenario(`age ${age}`, age, 55, 'MID', 7);
});

console.log('\n=== Rating delta over ONE year, by performance level (fixed age=17, rating=40, MID) ===');
[4, 5, 6, 7, 8, 9, 10].forEach(pnts => {
  runScenario(`pnts (avg match rating) ${pnts}`, 17, 40, 'MID', pnts);
});

console.log('\n=== A realistic youth prospect (age 17, rating 40) over consecutive good years (pnts=8) ===');
let simRating = 40;
for (let year = 1; year <= 5; year++) {
  const deltas: number[] = [];
  for (let i = 0; i < 300; i++) deltas.push(trial(16 + year, simRating, 'MID', 8));
  const mean = deltas.reduce((a,b)=>a+b,0)/300;
  simRating += mean;
  console.log(`Year ${year} (age ${16+year}): mean delta +${mean.toFixed(2)}, cumulative rating ~${simRating.toFixed(1)}`);
}

console.log('\n=== Rare high-roll check: out of 2000 trials for a 17yo (rating 40, pnts=7), how many single-year jumps exceed +6? ===');
let bigJumps = 0;
const allDeltas: number[] = [];
for (let i = 0; i < 2000; i++) {
  const d = trial(17, 40, 'MID', 7);
  allDeltas.push(d);
  if (d >= 6) bigJumps++;
}
console.log(`Big jumps (>=6 in one year): ${bigJumps}/2000 (${(bigJumps/2000*100).toFixed(1)}%)`);
console.log(`Max single-year jump observed: ${Math.max(...allDeltas)}`);
console.log(`Min single-year jump observed: ${Math.min(...allDeltas)}`);

process.exit(0);
