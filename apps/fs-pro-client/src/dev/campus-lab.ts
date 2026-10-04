/**
 * Dev-only lab for the cozy campus scene (open /campus-lab.html on the dev
 * server). Mounts the real World with fixed data so every terrain and Tier can
 * be viewed and captured, and exposes the hooks the canvas inspector uses:
 * state names are `<terrain>-<early|mid|max|wide|north>`, e.g. `coastal-max`.
 */
import { CAMPUS_BUILDING_KEYS, DEFAULT_PLACEMENT, TOWN_TERRAINS } from '@repo/api-contract';
import { World, type CampusView } from '@/components/cozy/scene/world';
import { mulberry32, type CityVariant } from '@/components/cozy/scene/terrain';

const SHOTS = { early: 1, mid: 3, max: 5, wide: 4, north: 4 } as const;
type Shot = keyof typeof SHOTS;

const stage = document.getElementById('stage')!;
const bar = document.getElementById('bar')!;
let world: World | null = null;
let current = '';

function viewFor(tier: number): CampusView {
  return {
    tiers: Object.fromEntries(CAMPUS_BUILDING_KEYS.map((k) => [k, { tier, upgrading: false }])),
    placement: DEFAULT_PLACEMENT,
    players: Array.from({ length: 14 }, (_, i) => ({ id: `p${i}`, name: `Player ${i}`, injured: i === 13 })),
    fans: [0, 400, 3000, 12000, 20000, 40000][tier],
    matchDay: false,
    clubLevel: [1, 2, 4, 7, 10, 12][tier],
    colors: ['#d9483b', '#f5f1e6'],
  };
}

function show(name: string) {
  const [variant, shot] = name.split('-') as [CityVariant, Shot];
  if (!(TOWN_TERRAINS as readonly string[]).includes(variant) || !(shot in SHOTS)) throw new Error(`unknown state ${name}`);
  world?.dispose();
  world = new World(stage, variant);
  world.sync(viewFor(SHOTS[shot]));
  world.setBillboard(['Rovers sign star striker in record deal', 'Academy graduate makes debut']);
  if (shot === 'wide' || shot === 'north') world.zoom(110);
  // Panned towards the landmark and whatever rises behind the town.
  if (shot === 'north') world.focus(0, -38);
  current = name;
  for (const b of bar.querySelectorAll('button')) b.classList.toggle('on', b.textContent === name);
  return { state: name };
}

for (const v of TOWN_TERRAINS) {
  for (const s of Object.keys(SHOTS)) {
    const b = document.createElement('button');
    b.textContent = `${v}-${s}`;
    b.onclick = () => show(b.textContent!);
    bar.appendChild(b);
  }
}

const loop = () => {
  world?.render();
  if (world) (window as any).__THREE_GAME_DIAGNOSTICS__ = { state: current, renderer: { ...world.stats } };
  requestAnimationFrame(loop);
};
requestAnimationFrame(loop);
show(new URLSearchParams(location.search).get('state') ?? 'city-mid');

(window as any).__THREE_GAME_TEST_HOOKS__ = {
  async setState(name: string) {
    document.body.classList.add('shot');
    const r = show(name);
    // Let the first frames compile shaders and settle walkers.
    await new Promise((res) => setTimeout(res, 600));
    return r;
  },
  setPausedForScreenshot(paused: boolean) {
    if (world) world.paused = paused;
  },
  seed(n: number) {
    Math.random = mulberry32(n);
  },
};
