# WORLD-SERVICE-CONTRACT.md — frozen HTTP contract for Batch 2

Lead-authored, frozen. Batch 2A (Go) and 2B (Node) implement this verbatim; the
`VERIFY-B2` agent checks both sides against it. JSON is camelCase. All
endpoints are on the world-service (Go), proxied by Node where the client needs
them. Errors: non-2xx with `{ "error": string }`.

Shape names below are also the zod schema names required in
`packages/api-contract` (R6); Node and Go must not drift.

## 1. `POST /placement/spot`

Called by Node's founding transaction **while holding `PLACEMENT_LOCK`**; the
Go handler must NOT take that lock. Pure read + recommendation.

Request:
```json
{ "clubId": "uuid", "inviteToken": "string|null" }
```

Response 200 (`PlacementSpot`):
```json
{
  "kind": "hole|district|city|region|country",
  "districtId": "uuid|null",
  "cityId": "uuid|null",
  "regionId": "uuid|null",
  "countryId": "uuid|null",
  "needsNames": ["city", "region", "country"],
  "x": 0.0,
  "y": 0.0,
  "invite": { "placeId": "uuid", "level": "district|city" }
}
```
- `districtId` is the leaf the club goes in (null only in the `preview`/error
  cases the Go service documents).
- `needsNames` lists the levels Node must create and name before inserting the
  club; empty means the spot exists.
- `invite` is null when uninvited.

## 2. `GET /places/{id}/children?type=city|district|region`

Response 200 (`PlaceChildren`):
```json
{ "children": [
  { "id": "uuid", "type": "city|district|region", "name": "string",
    "code": "string", "parentId": "uuid", "regionId": "uuid|null",
    "mapX": 0.0, "mapY": 0.0, "clubs": 0 }
] }
```
`clubs` comes from `PlaceStats`.

## 3. Prominence

- `GET /prominence/{clubId}` → 200 `Prominence`
  ```json
  { "clubId": "uuid", "prominence": 0.0, "updatedAt": "RFC3339|null" }
  ```
- `POST /prominence/recompute` request `{ "clubIds": ["uuid"] }` → 200
  `{ "updated": 0 }`.

## 4. Pyramid

- `POST /pyramid/draw/{competitionId}` → 200 `PyramidDraw`
  ```json
  { "pools": [
    { "division": 1, "regionKey": "string", "cityKey": "string",
      "districtKey": "string", "clubIds": ["uuid"] }
  ] }
  ```
  The Go service computes the ordered pool assignment from stored clubs; Node
  persists entries/pools/fixtures. `division` 1 is a single national pool.
- `POST /pyramid/join` request `{ "competitionId": "uuid", "clubId": "uuid" }`
  → 200
  ```json
  { "division": 1, "poolId": "uuid|null", "slot": 0, "newPool": false }
  ```
  `poolId` null with `newPool: true` means Node must create the pool the
  service describes (the service returns the index it chose).

## 5. Health

`GET /health` unchanged (`{status, service, version, database, uptimeSeconds, time}`).

## 6. Ownership (R11)

| Owner | Files |
| --- | --- |
| **2A** | `services/world-service/**`, `apps/fs-pro-server/src/db/drizzle/migrations/0038_*.sql`, `apps/fs-pro-server/src/db/drizzle/schema.ts` |
| **2B** | `apps/fs-pro-server/src/services/world/placement.service.ts`, `.../world/club-founding.service.ts`, `.../competitions/pyramid.service.ts`, `apps/fs-pro-server/src/services/world/*client*.ts` (new), `packages/api-contract/**`, `apps/fs-pro-server/src/middleware/route-policy.ts` |
| **2C** (staged after 2A) | `apps/fs-pro-server/src/scripts/checkWorldPyramid.ts`, `.../scripts/seedScaleWorld.ts`, `docs/SCALE.md` |

`services/world-service/internal/http/server.go` is owned by **2A**; 2B never
edits Go. API-contract zod schemas are owned by **2B**; 2A mirrors them in Go.
