Short answer: no, this can't be "just a frontend thing." You need a few new backend concepts because right now your `Place` model has no notion of *where* it sits on a map, *who* created it, or *what world* it belongs to. Drawing pixels is the easy part — the hard part is representing territory as data you can validate, persist, and sync across players.

Here's a plan.

## 1. The core gap in your schema

`Place` currently answers "what countries exist" but not "where are they" or "who owns them." You need to add:

```prisma
model World {
  id        String   @id @default(uuid()) @map("_id") @db.Uuid
  name      String
  width     Int      // grid dimensions
  height    Int
  createdAt DateTime @default(now())

  tiles     Tile[]
  places    Place[]
}

model Tile {
  id        String   @id @default(uuid()) @map("_id") @db.Uuid
  worldId   String   @db.Uuid
  world     World    @relation(fields: [worldId], references: [id])
  x         Int
  y         Int
  placeId   String?  @db.Uuid   // null = unclaimed
  place     Place?   @relation(fields: [placeId], references: [id])
  claimedByUserId String?

  @@unique([worldId, x, y])
}

model Place {
  // ...your existing fields...
  worldId         String?  @db.Uuid
  world           World?   @relation(fields: [worldId], references: [id])
  createdByUserId String?  // owner, for multiplayer permissions
  tiles           Tile[]
}
```

This is the key decision: **model the map as a grid of claimable tiles, not freeform vector shapes.** Freeform polygon drawing (think Figma-style) looks nice but forces you to solve polygon overlap detection, "is this shape contiguous," snapping, and precision issues — all to build something a grid gives you for free. With tiles:

- Two players can't claim the same territory (unique constraint does it).
- "Is this a valid contiguous country" is a flood-fill/BFS check on tile adjacency.
- Area, borders, neighboring countries — all cheap queries.
- Undo/expand/redraw is just adding/removing tile rows.

Square grid is simpler to implement than hex (no offset-coordinate math), and for a football-management game nobody needs hex-grid elegance. Square grid, recommend that.

## 2. The claim flow (this is the actual "worldbuilding mechanism")

1. Frontend renders the `World`'s tiles as a grid (canvas/SVG), colored by `placeId` (or gray if unclaimed).
2. Player selects a set of unclaimed tiles (paint/drag tool) to "found" a country.
3. On submit, backend validates in a transaction:
   - All selected tiles belong to the target world and are unclaimed.
   - Selected tiles form one contiguous region (BFS/flood fill over the selection).
   - Optional rule: must be adjacent to an existing claimed tile or a map edge (prevents floating islands, if you don't want that) — or skip this if you *do* want floating islands.
   - Size within min/max bounds you define.
4. If valid: create the `Place` (or attach to an existing one from your existing data set, since you said you already have Place *data* — so this might be "claim tiles for Place X" rather than creating a brand-new Place), and bulk-update the `Tile` rows with `placeId`.
5. Once a `Place` has tiles, your existing League/Club creation flow just works, since it already keys off `Place`.

That last point matters: since Leagues/Clubs already reference `Place`, you don't need to touch that part of your schema at all. Worldbuilding only needs to answer "does this Place exist and have territory yet," which is exactly what tile-claiming gives you.

## 3. Multiplayer considerations

- **Concurrency**: wrap the claim validation + tile update in a DB transaction with the unique `[worldId, x, y]` constraint acting as your race-condition guard — if two people try to claim the same tile simultaneously, the second transaction fails cleanly.
- **Permissions**: `createdByUserId` on `Place` (and maybe on `Tile` for "who painted this") lets you gate who can later add leagues/clubs to a given country — presumably only its owner, or anyone if you want it fully open.
- **Real-time sync**: for players to see the map fill in live, you'll want a lightweight pub/sub — websockets (Socket.IO) or a managed realtime service (Supabase Realtime, Pusher, Ably) pushing "tiles claimed" events so other clients patch their grid without a full refetch.
- **One world vs many**: decide now whether all multiplayer users share **one** `World` (like a Risk board they're jointly filling in) or each gets their **own** `World` instance. Your description ("others create their own countries" alongside yours) sounds like one shared world — the schema above supports that by default.

## 4. Frontend

Genuinely the simpler half once the above exists:
- A canvas/SVG grid renderer with pan & zoom.
- A "paint mode" for selecting tiles (drag-select, highlight, submit).
- Color/texture per `Place` (you already have `Picture` — could reuse as a texture fill or flag icon).
- Subscribe to realtime events to reflect other players' claims.

## Suggested build order

1. Add `World`/`Tile` models, migrate, seed one `World` with an empty grid.
2. Build single-player claim flow end-to-end (API + basic frontend grid) — no multiplayer yet.
3. Add contiguity/validation rules.
4. Add multiplayer: ownership fields, permission checks, concurrency-safe claiming.
5. Add realtime sync so claims appear live for other players.

One thing worth deciding before you build: do you want country shapes to be **freeform-looking** (e.g., a fine grid, like 100x100+ tiles, so borders look organic) or explicitly blocky (like a 10x10 Risk-style board)? That's purely a tuning knob (grid resolution) on the same architecture, so you don't need to decide it now, but it affects how big you make the grid.