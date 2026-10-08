# B3-B-C-REPORT — zoomable world map client + atlas retirement

Agents: **3B (client LOD map) + 3C (atlas API migration)**, one worktree.
Branch `perfect/b3-3c`, worktree `.claude/worktrees/b3c`, branched from
`perfect/integration` @ `3bacbc0`.
Program of record: `FOR-AGENTS.md` (Batch 3, agents 3B/3C), spec
`docs/perfect/WORLD-HIERARCHY-SPEC.md` §7. Inputs: the shipped world-service
tiles (`B3-3A-REPORT.md`), `GET /api/tiles/{z}/{x}/{y}` and `TileSchema`.

## 1. What changed

| File | Change |
| --- | --- |
| `apps/fs-pro-client/src/store/world-tiles.ts` | **new.** Pinia store: owns the viewport, derives the tile level `z` from the view width, loads exactly the visible quadtree cells (concurrency 6, debounced, bounded LRU-ish cache), merges visible places/clubs, and does navigation (focus/city/\|zoom) + search. |
| `apps/fs-pro-client/src/services/tiles.ts` | **new.** `fetchTile(z,x,y)` for `GET /api/tiles/{z}/{x}/{y}`, validated with the frozen `TileSchema`. See §3 for why it is not the ts-rest route. |
| `apps/fs-pro-client/src/components/atlas/world-tiles-map.vue` | **new.** SVG level-of-detail renderer (world→country→region→city→district→club), reusing the cozy sea/land/goo/flag/house/crest language of the retired atlas. Pan/pinch/wheel zoom + animated `flyTo`; exposes `flyTo/fitAll/focusCountry/focusPoint/zoomBy`. |
| `apps/fs-pro-client/src/components/atlas/atlas-map.vue` | **deleted.** The whole-world atlas renderer is retired (no callers left). |
| `apps/fs-pro-client/src/views/game/world-map.vue` | **rewritten** to the tile store + renderer; adds the search box and a "My club" jump; panels read tiles/chrome instead of the atlas; `world:founded` now invalidates visible tiles. |
| `apps/fs-pro-client/src/views/game/found-club.vue` | **updated** to the tile store + renderer; `getPlacement` (the founding preview) unchanged. |
| `apps/fs-pro-client/src/helpers/open-play.ts` | `ClubLite` keeps `Fans` (used by the selected-club panel). |
| `packages/api-contract/src/schemas/atlas.ts` | Extracts `AtlasMeSchema`, adds `AtlasChromeSchema` and `AtlasSearchResultSchema`. |
| `packages/api-contract/src/routes/atlas.ts` | Adds `getChrome` (`GET /atlas/chrome`) and `search` (`GET /atlas/search?q=`). |
| `apps/fs-pro-server/src/services/world/atlas.service.ts` | Adds `getAtlasChrome()` and `searchAtlas()`; `getAtlas()`'s `me` now carries `home`. |
| `apps/fs-pro-server/src/controllers/world/atlas.router.ts` | Handlers for `getChrome` / `search`. |
| `apps/fs-pro-server/src/middleware/route-policy.ts` | `atlas.getChrome`/`atlas.search` marked public. |
| `docs/perfect/assets/b3c/**` | **new.** 12 screenshots (desktop 1440×900 + mobile 390×844 × z0–z5). |

`grep -rn "getAtlas" apps/fs-pro-client/src` → **no matches** (both callers
replaced). `grep -rn "atlas-map\|AtlasMap" apps/fs-pro-client/src` → no matches.

## 2. Architecture

**Data.** The map is driven only by bounded tiles. `world-tiles.ts` computes
`z = clamp(round(log2(1024 / view.w)), 0, 5)` (so ~3–6 tiles span the view at
every level; `cellSize(z) = 256 / 2^z`, mirroring the Go `internal/tiles`
scheme), then fetches the cells intersecting `view` plus a one-cell margin. A
tile that returns its parent on overflow is kept under the requested key and
tracked by `requestedZ`, so the renderer shows exactly the current level. The
cache is pruned to 320 tiles, so memory is bounded by the viewport, not the
world (≤60 KB/tile server-side).

**Rendering.** SVG (see §5). Land is a soft `feTurbulence`-free "goo" blob per
visible place, tinted by the **nearest country's** founder-chosen colour
(countries do not overlap on the map, so nearest is exact enough and keeps the
nation identity at every zoom). Country flags/names come from chrome, so they
stay visible even before a cell loads. Regions/cities/districts become houses;
clubs become crest pins, fanned when several share a district centre. At z5
there are no place markers, so each club becomes a small land patch.

**Why two small server endpoints (the only server change).** A tile carries
`{id,name,type,x,y,clubs}` and top-K clubs `{id,name,code,x,y,prominence,human}`
— no flag colours, no `me`/limits, and no name lookup. Spec §7.6 says exactly
this: keep the founding summary on a small endpoint, not the whole atlas. So:
- `GET /atlas/chrome` → `{ countries: AtlasCountry[], me: AtlasMe | null }`
  (`AtlasCountry` reused verbatim: spot + colours + motto + founder; `me` gains
  `home {clubId,countryId,cityId,districtId,x,y}` for the "my club" jump). One
  row per country: ~11 countries at 10k, ~105 at 100k — bounded and stable.
- `GET /atlas/search?q=` → `AtlasSearchResult[]` (place or club, with `x/y` and
  `countryId`) so the map's search can find anything, not only loaded cells.
Both default to public (`GET` with no rule is public; the explicit rules are
documentation). `GET /atlas` still exists for admin/scripts but no client path
uses it.

## 3. Bug found and worked around: ts-rest drops a path param of `0`

`@ts-rest/core` builds a path with
`path.replace(/\/?:([^/?]+)\??/g, (m, p) => params[p] ? ... : '')`
(`node_modules/@ts-rest/core/index.cjs.js:167`) — a **falsy** param is replaced
by an empty segment. The quadtree origin is `z=0` (the whole-world level) and
cells start at `x=0`/`y=0`, so `client.tiles.getTile.query({params:{z:0,x:1,y:1}})`
requested `/api/tiles//1/1` and 404'd. Reproduced live in the harness: the dev
server logged `GET /api/tiles/1`, `GET /api/tiles/1/1`, … (the `0` segment
gone) and the world level rendered no tiles.

**Fix:** `services/tiles.ts` issues the request directly and validates the
payload with the contract's `TileSchema`, so the frozen shape stays the source
of truth. This is the only place that bypasses ts-rest, and only because the
scheme has legitimate zero coordinates. (Affects any future `z=0`/`x=0` path
route; noted for the lead.)

## 4. Commands run (R4)

```
# Client build (Windows Node, per BASELINE.md)
$ cmd.exe /c "cd /d C:\done\fs-pro\.claude\worktrees\b3c\apps\fs-pro-client && npm run build"
  dist/assets/world-tiles-map-B79WT3nf.js   15.95 kB │ gzip:  6.46 kB
  dist/assets/world-map-DXf8_2mK.js         19.04 kB │ gzip:  7.11 kB
  dist/assets/found-club-D3JmJJzh.js        18.37 kB │ gzip:  6.48 kB
  ✓ built in 9.74s                                              # BUILD_EXIT=0

# Client typecheck (vue-tsc@2.0.29 + typescript@5.4.5, scratch /tmp/opencode/tscheck)
$ node /tmp/opencode/tscheck/node_modules/vue-tsc/bin/vue-tsc.js --noEmit -p tsconfig.json
  errors: 31      # == docs/perfect/vue-tsc-baseline.log (31)
  diff(baseline, now) -> IDENTICAL error sets
  errors in world-map/found-club/world-tiles/services/tiles -> (none)

# Contract build + server typecheck (Windows Node)
$ npm run build --workspace @repo/api-contract        # tsc  -> CONTRACT_EXIT=0
$ npx tsc --noEmit                                     # in apps/fs-pro-server -> SERVER_TSC_EXIT=0
```

Screenshots (real `world-tiles-map.vue` + `world-tiles` store, mocked tile/
chrome/search HTTP via Playwright routes; `@playwright/test@1.63`, Windows
Chromium):
`docs/perfect/assets/b3c/{desktop-1440x900,mobile-390x844}/z0..z5.png`.
Each level loaded its places/clubs (harness log: z0 4 places/64 clubs → z5 0/2)
and rendered the cozy map with no page errors.

## 5. SVG vs three.js

**SVG**, for four reasons: (a) the owner's established look is flat cozy art in
DOM/SVG (campus, matchzone, the retired atlas) and keeps the coastal-spot swaps
(e.g. the club-level land patch) trivial; (b) the LOD means the marker count is
**bounded per view** — the clamp keeps ~3–6 tiles across and the server caps
clubs per place, so the DOM never approaches the 5,000-marker target of the
brief; (c) it adds no dependency (three.js would add ~600 KB and a render
pipeline for what is currently hundreds of nodes); (d) `preserveAspectRatio`
viewBox maths already existed and is reused. I could **not** run an fps trace on
the 100k world (no full stack — §6), so this is a reasoned decision, not a
measurement; the store's per-view tiles + cache are the guardrail: the renderer
only ever sees the visible LOD, so frame cost is independent of world size.

## 6. Acceptance vs. the brief

| Item | Evidence | Result |
| --- | --- | --- |
| Replace single-SVG atlas with an LOD renderer, world→club | `world-tiles-map.vue`; screenshots z0–z5 | PASS |
| Prominence-tiered markers (top-K per place) | server cap per zoom; store renders `tile.clubs` in order | PASS |
| Smooth zoom | store view interpolates; `flyTo` animates; wheel/pinch; `setAspect` | PASS |
| Search to a club/place | `/atlas/search` + header box + `focusResult` | PASS (endpoint not run against a DB; see §7) |
| "My club" jump | `goToMyClub()` + `chrome.me.home` button | PASS |
| Both views use it, founding preview kept | `world-map.vue`, `found-club.vue`; `getPlacement` unchanged | PASS |
| Retire every `getAtlas` client caller | grep → no matches | PASS |
| Cozy art preserved | screenshots; land tinted by nation colour; flags/houses/crests | PASS |
| fps ≥55 desktop / ≥30 mobile at 5,000 markers | **not measured** — no full stack (§7) | NOT VERIFIED |
| Playwright: zoom world→club in a 100k world | harness screenshots produced; full-stack flow not run (§7) | PARTIAL |

## 7. Known gaps / what I could not verify

1. **No full-stack browser run.** The real app needs the Go world-service, a
   migrated Postgres and the Node API running together; only the client build
   and the mocked-HTTP harness were run here. So: the tile proxy end-to-end,
   `/atlas/chrome` and `/atlas/search` against a real DB, and any fps trace are
   **unverified**. The screenshots render the real component and store but with
   synthetic tile payloads.
2. **fps.** Not measured; the SVG decision is reasoned (§5).
3. **`/atlas/search` query cost** is an `ILIKE '%q%'` over `Places`/`Clubs`
   (limit 10/10). Fine at current scale; a `pg_trgm` index is the next step
   before 100k.
4. **`dir` (`useClubDirectory`) still loads every club** for the selected-club
   panel stats/form (pre-existing behaviour); ideally the panel would fetch one
   club. Left as-is to avoid widening scope.
5. **Server additions** (`/atlas/chrome`, `/atlas/search`) are new public
   surface beyond the 3A tiles; if the lead prefers, `search` can be dropped and
   the box limited to loaded cells, but then "search the world" is not met.
6. `?placeId=` focused zoom (3A's D4) is still absent; the client does not need
   it (it frames a result by coordinates instead).
