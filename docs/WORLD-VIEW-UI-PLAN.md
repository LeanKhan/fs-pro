# Plan: World View UI (Clash of Clans / SimCity feel, without drawing every object)

Companion to `docs/OPEN-PLAY-COMPETITIONS-SPEC.md`. Builds on the campus map from
`ideas/persistent-strat-game` (`components/game/campus-map.vue`,
`components/game/map-config.ts`).

## Problem

The campus view looks great but each facility is 1–4 hand-placed sprites, cut
out of AI-generated sprite sheets, for every level. Every new tier means more
cutting, sizing and placing. That doesn't scale to 7 facilities × 6 tiers, let
alone a world map.

## Principle

**Paint big pieces, show changing state on top, put data in panels.**

- Art is made at the size of a scene or a whole facility, never a single prop.
- Anything that changes often (timers, crowds, lights, badges) is drawn by code
  on top of the art.
- Anything with numbers or rows lives in a panel, not on the map.

## Art: only three kinds

| Kind | What it is | Count |
| --- | --- | --- |
| Scene | One painted background per view | 2 now (campus, world map), +1 later (match-day stadium) |
| Facility plate | One cut-out image per facility per **band** of tiers, with all its props (benches, lights, cones, fences) baked in | 7 facilities × 3 bands = 21 |
| Shared overlay | Reused on anything | ~6 |

### Tier bands

Facilities have Tiers 0–5 (never "Level"; see `CLAUDE.md`). Art only changes
per band:

| Band | Tiers | Look |
| --- | --- | --- |
| b0 | 0–1 | Grassroots: dirt, cones, cabins |
| b1 | 2–3 | Club: proper buildings, fences, signage |
| b2 | 4–5 | Pro: glass, floodlights, stands |

Within a band, the Tier shows as a badge on the pin (e.g. "Tier 3"), plus
small code-driven touches (flag count, light glow). A new band of art is 7
images.

### Facility plates

| Key | Title | Notes |
| --- | --- | --- |
| `stadium_grounds` | Pitch | Ground layer (z 0) |
| `stands` | Stands | Wraps the pitch |
| `training_ground` | Training Ground | Ground layer |
| `youth_academy` | Academy | |
| `scouting` | Scouting | |
| `medical_centre` | Medical Centre | |
| `staff_house` | Staff House | |

Plus two non-facility buildings with one fixed plate each: `office` (opens
the full dashboard, see "Panels") and `dugout` (opens the team sheet, as it
does today).

### Shared overlays

| Overlay | Used for |
| --- | --- |
| `scaffold.png` | Any facility with an upgrade in progress, drawn over its plot |
| `glow.png` | Floodlights on match days and at night |
| `flag.png` | Club flags, tinted with the club colour |
| `sign-panel.png` | Where the club crest is layered (existing crest SVGs) |
| `plot-empty.png` | Fallback for any plate that doesn't exist yet |
| crowd dots | Existing `campus-fans.vue`, density from fan count |

## Fixed plots

Each facility owns a fixed plot on the scene. A plot is an anchor point and a
box; any plate for that facility is scaled to fit the box, anchored at its
bottom centre. No per-prop placement ever again.

```ts
// components/world/campus-plots.ts
export interface Plot {
  key: FacilityKey | 'office' | 'dugout';
  title: string;
  /** Bottom-centre anchor, scene units (1376 x 768 for the campus). */
  x: number; y: number;
  /** Box the plate is fitted into (contain), scene units. */
  w: number; h: number;
  /** 0 = ground (pitch, pens), 1 = upright. Upright plots draw in y order. */
  z: 0 | 1;
  /** Pin override, scene units; default = top centre of the box. */
  pin?: [number, number];
}
```

The existing `HOTSPOTS` in `map-config.ts` become plots: take each facility's
current sprite union box as its plot box, so the current layout is kept.

### Files and fallback

```
public/world/campus/scene.jpg
public/world/campus/plates/<key>-b<band>.png     e.g. training_ground-b1.png
public/world/campus/plates/office.png
public/world/overlays/<name>.png
public/world/map/scene.jpg
public/world/map/venues/<format>.png            league | cup | groups | event
```

A small generated manifest (`public/world/manifest.json`, built by a script
that lists the folders) tells the client which plates exist. For a facility
at Tier t:

1. Use `<key>-b<band(t)>.png` if it exists.
2. Else the highest lower band that exists.
3. Else `plot-empty.png` with the facility name on it.

So a feature never waits on art, and adding art is dropping a correctly named
file in the folder.

## Making the art

One fixed prompt template for every plate, so they match:

```
Isometric 2:1 game art of a football club {facility} at {band description},
single self-contained building plot, {props list},
viewed from the south-east, soft light from the top-left,
bright stylised mobile-strategy-game look (Clash of Clans / SimCity),
clean edges, no text, no people, no ground beyond the plot,
plain flat white background, centred, whole plot visible
```

- Same size for every generation (e.g. 1024 × 1024), then remove the
  background and trim.
- Keep the scene images in the same camera and light.
- Store the prompt used next to each plate (`<key>-b<band>.txt`) so a band can
  be regenerated consistently.
- The current `l0-*` sprites stay as the b0 art until b0 plates are made:
  composite each facility's sprites into one PNG once (a small script using
  the existing `HOTSPOTS` positions) and it becomes its b0 plate.

## Living scene without new art

| Effect | How |
| --- | --- |
| Day / night | CSS filter on the scene layer driven by the game clock (`brightness`, `hue-rotate`), `glow` overlays on at night |
| Weather | CSS overlay layer (rain streaks, overcast tint), random per day |
| Match day | Floodlights on, crowd density up, flags out, banner "Match day vs X" |
| Upgrading | `scaffold` overlay + existing build-timer pin |
| Idle life | Existing walking fans, a couple of cars moving on a path (existing car sprites) |
| Club identity | Crest on sign panels, flags tinted with club colours |

## Campus layout variants

Three campus layouts, each a scene image plus its own plot coordinates. All
plates are shared, so a variant costs one painted scene and one plots file.

| Variant | Scene | Feel |
| --- | --- | --- |
| `city` | `public/world/campus/city/scene.jpg` | Tight plot, roads and buildings around the edges |
| `coastal` | `public/world/campus/coastal/scene.jpg` | Shoreline along one side, promenade |
| `hillside` | `public/world/campus/hillside/scene.jpg` | Terraced ground, trees, slope behind the stands |

- Plots per variant in `components/world/campus-plots/<variant>.ts`. Every
  variant must define a plot for every facility plus `office` and `dugout`;
  a test checks this.
- `Clubs.CampusLayout` text, not null, default picked at club creation:
  from the Imagination home place's terrain/type if known, otherwise by a
  stable hash of the club id, so existing clubs get a fixed variant without a
  choice screen.
- Admin can change it on the club form; changing it only swaps the scene and
  plot positions, never the facilities.
- Plate sizing: the plate prompt stays the same for all variants, so plots of
  the same facility should have similar box sizes across variants.
- File layout becomes `public/world/campus/<variant>/scene.jpg`; plates stay
  in `public/world/campus/plates/`.

## Views

### 1. Campus (home)

The club's own scene. Tap a plot → its panel.

- Pins: facility name, Tier badge, status (building timer, "upgrade ready",
  alert dot). Nothing else.
- `office` → full dashboard. `dugout` → team sheet.
- Visiting another club (from the World map) shows its campus read-only, with
  a "Challenge" button in the HUD.

### 2. World map

One painted region image. Nothing on it has unique art.

- **Clubs**: crest pins (existing SVGs), placed at their Imagination world
  home place (`Clubs.homePlaceId`). Clubs without one are listed in an
  "Unplaced clubs" tray at the map edge until they get one. Level shows as a
  badge on the pin, not as position.
- **Competitions**: each edition in registration or running is a venue marker
  using one of 4 generic plates by format (`league`, `cup`, `groups`,
  `event`), tinted with the competition colour, with a name banner, holder's
  crest and a status chip ("Open for entry · 3 days", "Round of 16").
- **Challenges**: tap a rival crest → mini card (name, Level, Elo, form) →
  "Challenge" (only where `eligible-opponents` allows, otherwise the reason).
  This is the Clash of Clans "attack".
- Filters: my competitions, rivals, open for entry.

### 3. Match

Existing matchzone / live pitch. Later: the stadium scene at the club's
`stands` band as the frame around it.

## Panels (where the data lives)

Rule: **the map shows at most 3 facts per object (name, tier/level, status).**
Anything else opens a panel.

| Trigger | Panel | Content |
| --- | --- | --- |
| Tap a facility | Side sheet (desktop) / bottom sheet (mobile) | Tier, effects, upgrade cost and time, upgrade button (existing `facility-detail-sheet.vue`) |
| Tap a venue | Sheet | Edition overview, stage timeline, table or bracket, entry button |
| Tap a rival | Card, then sheet | Profile, head-to-head, challenge |
| Office | Full page | The traditional dashboard: rankings, fixtures, finances, squad, transfers, history. Nothing is lost; it becomes the HQ interior |

Dense screens (squad, transfers, finances, rankings) are never squeezed onto
the map.

## HUD (always on, both map views)

- **Top bar**: crest and name, Level badge, Elo, cash, entries used (e.g.
  2 / 3), inbox bell with count.
- **Bottom dock**: Campus · World · Competitions · Squad · Office.
- **Toasts**: challenge received, upgrade finished, round drawn, promoted.
- **Return summary**: "While you were away" modal (existing
  `away-summary-modal.vue`).

## Tech

- Keep the current approach: DOM image layers plus an SVG hotspot layer in the
  same viewBox, pan/zoom with CSS transforms (as `campus-map.vue` does).
- One generic `world-scene.vue` renders any scene from `{ scene, plots,
  overlays }`, so campus and world map share pan/zoom, hit-testing, pins and
  fallback.
- No Phaser or PixiJS unless crowd animation gets heavy; if it does, move only
  the crowd layer to a canvas.
- Preload the scene and current-band plates; lazy-load others. Plates as WebP
  with PNG fallback.
- Accessibility: every plot and pin is a real button with a label; a "List
  view" toggle shows the same objects as a plain list.

## Naming to reconcile when merging with `ideas/persistent-strat-game`

- Facility levels 0–5 on that branch become **Tier** (`ClubAssets` level
  column, `Lv N` pins, `facility-detail-sheet.vue` text).
- That branch's XP-based Club Level **is** the competition spec's **Level**:
  one concept, derived from `Clubs.XP`, deciding which competitions a club may
  enter. A club's position in a table is its **Rank**. The HUD shows a Level
  badge with an XP progress ring.
- Its PLAY / matchmaking loop and the spec's challenges become one system:
  PLAY is the quick-match button that proposes a challenge to a suggested
  opponent in one of your running competitions.

## Build order

1. `world-scene.vue` + plot/manifest/fallback system; port the campus to it
   using composited b0 plates from the current sprites.
2. Overlays: scaffold, match day, day/night.
3. HUD and bottom dock; Office opens the existing dashboard.
4. Panels wired to facilities and venues.
5. World map scene, club crest pins at home places, venue markers,
   challenge flow.
6. b1 and b2 plates (14 images), generated with the template.
7. Weather, idle life, visiting other clubs' campuses.
8. Two more campus layout variants (`coastal`, `hillside`); the ported
   campus becomes `city`.

## Decisions

1. World map places clubs at their real home place only; no Level districts.
2. **Level** is the XP-based progression and decides competition entry;
   **Rank** is a club's position in a ranked competition's table.
3. Campuses come in 3 layout variants (city, coastal, hillside) that share all
   plates.
