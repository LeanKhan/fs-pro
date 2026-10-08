import { test, expect, type Page, type TestInfo } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

/**
 * The owner-program screens (phase-2 OWNER-PROGRAM-SPEC, agent 3B) at both
 * brief viewports. The full stack is not assumed: every API route is mocked
 * here, so the run is deterministic and needs no database, API or Go engine.
 *
 * Screenshots land in tests/e2e/artifacts/<project>/owner-program/.
 */

const CLUB = 'club-b3b';

// --- Fixtures --------------------------------------------------------------

const roster = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ Position: i === 0 ? 'GK' : ['CB', 'LB', 'CM', 'ST'][i % 4], isRetired: false }));

function advisor(text: string, expr = 'neutral') {
  return {
    id: 'step.manager.arrive',
    speaker: 'vintra',
    text,
    expr,
    pose: 'idle',
    target: null,
    priority: 80,
    dismissible: true,
    maxShows: 1,
    cooldownSeconds: 0,
    once: false,
  };
}

const club = (rosterSize: number, budget: number) => ({
  _id: CLUB,
  Name: 'Harbour Rovers',
  ClubCode: 'HBR',
  Budget: budget,
  Players: roster(rosterSize),
});

const campus = (budget: number) => ({
  clubId: CLUB,
  placement: {},
  budget,
  maxConcurrentUpgrades: 1,
  activeUpgrades: 0,
  assets: [
    fac('training_ground', 'Training Ground', '+8% training growth', 200_000, 20),
    fac('stands', 'Stands', '1,000 capacity', 300_000, 30),
    fac('medical_centre', 'Medical Centre', 'Faster recovery between matches', 260_000, 25),
    fac('stadium_grounds', 'Stadium Grounds', 'Pitch quality and floodlights', 250_000, 20),
    fac('scouting', 'Scouting Department', '1 scouted transfer target', 220_000, 25),
    fac('youth_academy', 'Youth Academy', 'Youth intake quality +6%', 350_000, 40),
    fac('staff_house', 'Staff House', 'Coaching level 1', 300_000, 35),
  ],
});

function fac(type: string, name: string, effectLabel: string, cost: number, minutes: number) {
  return {
    type,
    name,
    description: `Description for ${name}.`,
    level: 0,
    maxLevel: 5,
    effectLabel,
    effects: { training: 1 },
    upgrade: null,
    next: { level: 1, cost, minutes, effectLabel, blockedReason: null },
  };
}

const playBase = (level: number, budget: number) => ({
  club: { id: CLUB, name: 'Harbour Rovers', rating: 60, power: 60, xp: level * 100, level, xpIntoLevel: 45, xpForNext: 100, budget },
  standing: {
    fans: 150,
    reputation: 12,
    boardConfidence: 62,
    fanApproval: 58,
    squadMorale: 64,
    form: ['W', 'D', 'L'],
    streak: null,
  },
  cooldownSeconds: 0,
  challenge: { id: 'c1', title: 'First win', targetWins: 1, wins: 0, matchesPlayed: 0, status: 'active', expiresAt: '', secondsLeft: 0, rewardCash: 5000, rewardXP: 10 },
  recent: [
    { fixtureId: 'f1', opponent: 'Fenwick Rangers', score: '2-1', outcome: 'win', playedAt: new Date().toISOString() },
    { fixtureId: 'f2', opponent: 'Portstone FC', score: '1-1', outcome: 'draw', playedAt: new Date().toISOString() },
    { fixtureId: 'f3', opponent: 'Halewood Town', score: '0-2', outcome: 'loss', playedAt: new Date().toISOString() },
  ],
  shop: { pending: 0, cap: 20_000, perHour: 3400, secondsToFull: 3600 },
  league: null,
});

const league = {
  editionId: 'e1',
  competitionName: 'Kev National League',
  division: 1,
  poolName: 'Pool B — The Eastern Coast',
  promote: 2,
  relegate: 2,
  rank: 3,
  clubsInPool: 10,
  table: Array.from({ length: 10 }, (_, i) => ({
    clubId: `t${i}`,
    name: ['Fenwick Rangers', 'Harbour Rovers', 'Portstone FC', 'Halewood Town', 'Bray United', 'Ostmarket', 'Cavendish', 'Redhills', 'Northgate', 'Saltcoats'][i],
    code: `T${i}`,
    rank: i + 1,
    played: 4,
    wins: 3,
    draws: 1,
    losses: 0,
    gd: 6 - i,
    points: 10 - i,
  })),
  next: { fixtureId: 'fx1', opponentId: 't0', opponentName: 'Fenwick Rangers', opponentCode: 'FEN', home: true, day: 4, kickoffHour: 15, startsInSeconds: 900 },
  last: null,
};

const managers = [
  mgr('m1', 'Aldo', 'Rennick', 47, 48, 52, '433', 'possession', false, 90_000),
  mgr('m2', 'Bevan', 'Oakes', 52, 56, 60, '442', 'direct', false, 180_000),
  mgr('m3', 'Corin', 'Vasha', 58, 72, 78, '4231', 'pressing', true, 650_000),
  mgr('m4', 'Dara', 'Ness', 44, 46, 50, '352', 'counter', false, 40_000),
  mgr('m5', 'Emil', 'Brandt', 61, 64, 66, '433', 'balanced', false, 360_000),
  mgr('m6', 'Ferro', 'Quist', 39, 58, 62, '442', 'defensive', false, 120_000),
];

function mgr(
  id: string,
  firstName: string,
  lastName: string,
  age: number,
  low: number,
  high: number,
  formation: string,
  style: string,
  interviewed: boolean,
  fee: number
) {
  const spread = (base: number) => (interviewed ? { low: base, high: base } : { low: Math.max(40, base - 6), high: Math.min(90, base + 6) });
  return {
    id,
    firstName,
    lastName,
    age,
    nationalityId: 'n1',
    preferredFormation: formation,
    preferredStyle: style,
    overall: interviewed ? { low: high, high } : { low, high },
    tactics: spread(low + 4),
    motivation: spread(low - 2),
    development: spread(low + 1),
    discipline: spread(low - 4),
    interviewed,
    signingFee: fee,
    effectiveFee: interviewed ? Math.round(fee * 0.9) : fee,
    wage: Math.round(fee * 0.05),
  };
}

const positions = ['GK', 'CB', 'LB', 'RB', 'CM', 'LM', 'RM', 'ST', 'CF', 'CDM', 'CAM', 'LW'];
const firstNames = ['Ivo', 'Jaro', 'Kito', 'Lena', 'Milo', 'Nero', 'Oda', 'Pax', 'Quill', 'Rosa', 'Sena', 'Tovi'];
const lastNames = ['Aaro', 'Bello', 'Cassi', 'Dune', 'Elka', 'Faro', 'Gorm', 'Hale', 'Ibis', 'Jaan', 'Kesh', 'Lume'];

const freeAgents = Array.from({ length: 80 }, (_, i) => {
  const rating = 45 + ((i * 7) % 35);
  const value = rating < 50 ? 25_000 : rating < 55 ? 55_000 : rating < 60 ? 120_000 : rating < 65 ? 320_000 : 750_000;
  return {
    id: `p${i}`,
    firstName: firstNames[i % firstNames.length],
    lastName: lastNames[(i * 5) % lastNames.length],
    age: 18 + ((i * 3) % 17),
    position: positions[i % positions.length],
    nationalityId: 'n1',
    rating: { low: Math.max(40, rating - 6), high: Math.min(99, rating + 6) },
    scouted: false,
    value,
    wage: Math.round(value * 0.15),
  };
});

const otherPlayers = Array.from({ length: 8 }, (_, i) => ({
  _id: `op${i}`,
  FirstName: firstNames[(i + 3) % firstNames.length],
  LastName: lastNames[(i + 7) % lastNames.length],
  Age: 22 + i,
  Position: positions[(i + 2) % positions.length],
  Role: '',
  Attributes: {},
  Rating: 62 + i,
  Value: 320_000 + i * 80_000,
  Wage: 40_000 + i * 4000,
  isSigned: true,
  isRetired: false,
  ClubCode: `CL${i}`,
  isTransferListed: i % 3 === 0,
}));

// --- Scenario state --------------------------------------------------------

type Scenario = 'balance' | 'managers' | 'squad' | 'facilities' | 'level1' | 'league';

interface ScenarioData {
  state: Record<string, unknown>;
  rosterSize: number;
  budget: number;
  level: number;
}

function scenarioData(s: Scenario): ScenarioData {
  const rosterSize = s === 'squad' ? 7 : 11;
  const budget = s === 'balance' ? 2_400_000 : s === 'squad' ? 640_000 : 1_820_000;

  const baseState = {
    clubId: CLUB,
    step: 'manager',
    stepStars: {} as Record<string, number>,
    programXp: 0,
    startingBalance: 2_400_000,
    budget,
    completed: false,
    stars: 0,
    xp: 0,
    reasons: [] as string[],
    advisor: advisor('Right then. Every club needs one voice on the training pitch. Spend on a manager first — the rest waits on him.'),
    chapter: null,
  };

  switch (s) {
    case 'balance':
      return { state: baseState, rosterSize, budget, level: 0 };
    case 'managers':
      return { state: baseState, rosterSize, budget, level: 0 };
    case 'squad':
      return {
        state: {
          ...baseState,
          step: 'players',
          stepStars: { manager: 2 },
          programXp: 9,
          advisor: advisor('A manager needs a bench. Sign a legal matchday squad — eleven, and one of them a keeper.'),
        },
        rosterSize,
        budget,
        level: 0,
      };
    case 'facilities':
      return {
        state: {
          ...baseState,
          step: 'facilities',
          stepStars: { manager: 2, players: 3 },
          programXp: 27,
          advisor: advisor('Trophies are won on grass. Build the pitch that earns at home and the stand that fills.'),
        },
        rosterSize,
        budget: 1_400_000,
        level: 0,
      };
    case 'level1':
      return {
        state: {
          ...baseState,
          step: 'level1',
          stepStars: { manager: 3, players: 2, facilities: 3 },
          programXp: 45,
          advisor: advisor('One more push: Level 1 and the league takes us in. Earn it — we don’t hand out places.'),
        },
        rosterSize,
        budget: 780_000,
        level: 0,
      };
    case 'league':
      return {
        state: {
          ...baseState,
          step: 'done',
          stepStars: { manager: 3, players: 2, facilities: 3 },
          programXp: 45,
          completed: true,
          advisor: advisor('Level 1. Your league has a name now — and so do your rivals.', 'excited'),
        },
        rosterSize,
        budget: 780_000,
        level: 1,
      };
  }
}

const ok = (payload: unknown) => ({
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify({ success: true, message: 'ok', payload }),
});
const fail = (status: number, message: string) => ({
  status,
  contentType: 'application/json',
  body: JSON.stringify({ success: false, message, payload: null }),
});

async function mockApi(page: Page, scenario: Scenario): Promise<void> {
  const data = scenarioData(scenario);
  const state = { ...data.state };

  await page.route('**/api/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const p = url.pathname;
    const m = req.method();

    if (p === `/api/program/${CLUB}/managers` && m === 'GET') {
      return route.fulfill(ok({ managers, budget: data.budget, interviewFee: 25_000 }));
    }
    if (p.match(new RegExp(`^/api/program/${CLUB}/managers/([^/]+)/interview$`)) && m === 'POST') {
      const id = p.split('/')[5];
      const found = managers.find((x) => x.id === id) ?? managers[0];
      return route.fulfill(
        ok({
          managers: {
            id,
            overall: found.overall.high,
            tactics: found.tactics.high,
            motivation: found.motivation.high,
            development: found.development.high,
            discipline: found.discipline.high,
            signingFee: found.signingFee,
            wage: found.wage,
          },
        })
      );
    }
    if (p.match(new RegExp(`^/api/program/${CLUB}/managers/([^/]+)/sign$`)) && m === 'POST') {
      const after = { ...state, step: 'manager', budget: (state.budget as number) - 90_000, stepStars: {}, programXp: 0 };
      return route.fulfill(ok({ state: after, paid: 90_000 }));
    }
    if (p === `/api/program/${CLUB}/players` && m === 'GET') {
      return route.fulfill(ok({ players: freeAgents, budget: data.budget, scoutFee: 15_000, needed: 4 }));
    }
    if (p === `/api/program/${CLUB}/advance` && m === 'POST') {
      const next = {
        ...state,
        step: 'players',
        stepStars: { manager: 3 },
        programXp: 18,
        completed: false,
        stars: 3,
        xp: 18,
        reasons: ['A manager who carries out a brief', 'Fee under 40% of your opening balance', 'V400k still in the bank'],
        advisor: advisor('That’s a manager who carries out a brief. Now build him a team.', 'happy'),
      };
      return route.fulfill(ok(next));
    }
    if (p === `/api/program/${CLUB}` && m === 'GET') {
      return route.fulfill(ok(state));
    }
    if (p === `/api/facilities/${CLUB}` && m === 'GET') {
      return route.fulfill(ok(campus(data.budget)));
    }
    if (p === `/api/play/${CLUB}` && m === 'GET') {
      const play = playBase(data.level, data.budget);
      if (scenario === 'league') play.league = league as never;
      return route.fulfill(ok(play));
    }
    if (p === `/api/clubs/${CLUB}` && m === 'GET') {
      return route.fulfill(ok(club(data.rosterSize, data.budget)));
    }
    if (p === '/api/transfers/window' && m === 'GET') {
      return route.fulfill(ok({ open: false, closesDay: null, currentDay: 10, daysLeft: null }));
    }
    if (p === '/api/players/all' && m === 'GET') {
      return route.fulfill(ok(otherPlayers));
    }
    // Anything else: a clean failure so a missing mock is loud, not silent.
    return route.fulfill(fail(404, `No mock for ${m} ${p}`));
  });
}

async function authenticate(page: Page, revealBalance: boolean): Promise<void> {
  await page.addInitScript(
    ([clubId, reveal]) => {
      localStorage.setItem(
        'fspro-user',
        JSON.stringify({ userID: 'u1', _id: 'u1', username: 'e2eowner', fullname: 'E2E Owner', isAdmin: false, clubs: [{ _id: clubId }] })
      );
      localStorage.setItem('fspro_sfx', 'off');
      if (reveal) localStorage.setItem(`fspro_owner_balance_${clubId}`, '1');
      else localStorage.removeItem(`fspro_owner_balance_${clubId}`);
    },
    [CLUB, revealBalance] as const
  );
}

function shotter(testInfo: TestInfo) {
  const dir = path.join('artifacts', testInfo.project.name, 'owner-program');
  fs.mkdirSync(dir, { recursive: true });
  return async (page: Page, name: string) => {
    await page.screenshot({ path: path.join(dir, `${name}.png`), animations: 'disabled' });
  };
}

// --- Tests -----------------------------------------------------------------

for (const scenario of ['balance', 'managers', 'squad', 'facilities', 'level1', 'league'] as Scenario[]) {
  test(`owner program screen: ${scenario}`, async ({ page }, testInfo) => {
    await mockApi(page, scenario);
    await authenticate(page, scenario !== 'balance');
    const shot = shotter(testInfo);
    await page.goto(`/game/${CLUB}/program`);
    await expect(page.locator('.op')).toBeVisible({ timeout: 30_000 });
    // Let the count-ups and card reveals settle.
    await page.waitForTimeout(scenario === 'balance' ? 1800 : 900);
    await shot(page, `${String(['balance', 'managers', 'squad', 'facilities', 'level1', 'league'].indexOf(scenario) + 1).padStart(2, '0')}-${scenario}`);
  });
}

test('owner program: interview -> negotiate -> star reveal', async ({ page }, testInfo) => {
  await mockApi(page, 'managers');
  await authenticate(page, true);
  const shot = shotter(testInfo);
  await page.goto(`/game/${CLUB}/program`);
  await expect(page.locator('.op-mgr').first()).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(600);

  // Paid reveal
  await page.locator('.op-mgr').first().locator('.op-btn.ghost').click();
  await expect(page.locator('.op-mgr').first().locator('.op-mgr-badge')).toBeVisible();
  await page.waitForTimeout(400);
  await shot(page, '07-manager-interview');

  // Negotiate
  await page.locator('.op-mgr').first().locator('.op-btn.primary').click();
  await expect(page.locator('.op-modal-card')).toBeVisible();
  await page.waitForTimeout(300);
  await shot(page, '08-manager-negotiate');

  // Sign -> the server advances the step -> the star reveal
  await page.locator('.op-modal-actions .op-btn.primary').click();
  await expect(page.locator('.op-reveal-card')).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(900);
  await shot(page, '09-star-reveal');
});

test('owner program: transfer market tab', async ({ page }, testInfo) => {
  await mockApi(page, 'squad');
  await authenticate(page, true);
  const shot = shotter(testInfo);
  await page.goto(`/game/${CLUB}/program`);
  await expect(page.locator('.op-tabs')).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(600);
  await page.getByRole('tab', { name: 'Transfer market' }).click();
  await page.waitForTimeout(400);
  await shot(page, '10-transfer-market');
});

/**
 * One rendered DOM snapshot of the manager screen, so the design detector
 * (`npx impeccable detect`) can scan the real component output rather than a
 * redraw. CSS is inline (Vite dev injects <style> tags), so the scan is valid.
 */
test('owner program: DOM snapshot for the design detector', async ({ page }) => {
  test.skip(test.info().project.name !== 'desktop-1440x900', 'one snapshot is enough');
  await mockApi(page, 'managers');
  await authenticate(page, true);
  await page.goto(`/game/${CLUB}/program`);
  await expect(page.locator('.op-mgr').first()).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(600);
  const dir = path.join('artifacts', 'owner-program-dom');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'managers.html'), await page.content());
});

