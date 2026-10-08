# CULTURES-SPEC.md — phase 2 · Batch 1 · Agent 1C

Culture model, the six starting cultures + extras, the per-country demographic
mixes from the country sheets, the `packages/api-contract` zod shapes, the
Node cut-over away from the syllable tables, the `Places.Culture` migration,
and how the atlas/tiles/crests/campus read it.

**Scope.** This is the *spec and wiring plan*. Phase-1 Batch 4 already shipped
the generator (`services/worldgen/names/culture.go`, 8 cultures, 8 kinds,
mix-aware generation, floors, deny-list, collision tests) — see
`docs/perfect/B4-CULTURES-REPORT.md`. **Do not re-implement worldgen.** This
document decides the model, fixes the data targets, and specifies every Node
call site that must be repointed (with `file:line`).

**Path convention.** Docs elsewhere cite server paths without the package
prefix (`services/...`); the real root is `apps/fs-pro-server/src/` (AUDIT.md
§"Method, paths and environment"). Every citation below is the real
repo-relative path. Go citations are already real.

**Binding rules.** L12 (cultures are data; worldgen is the one name source;
Node keeps no naming tables; fallback logged only when worldgen is down),
D3/phase-1 (cultures cover **naming and look only, never gameplay or
economy**), R3′ (all name generation in Go `services/worldgen`).

---

## 0. Evidence base and baseline facts

| Fact | Evidence |
| --- | --- |
| Culture/country schema + loader, kinds, mix-aware generation | `services/worldgen/names/culture.go:36-57` (`Culture`, `MixEntry`, `Country`), `:174-186` (kinds), `:442-496` (`GenerateMixed`), `:498-514` (`pickMix`) |
| Unknown mix entries are dropped; empty mix falls back to primary | `services/worldgen/names/culture.go:153-167` |
| Country→culture map + aliases + mixes (shipping) | `services/worldgen/names/data/misc/country_cultures.json` |
| 8 culture JSON files, 2000/2000/200 banks each | `services/worldgen/names/data/cultures/*.json`; B4 report §Floors |
| HTTP surface | `services/worldgen/server/server.go:44-46`, `:110-117` (`/cultures`), `:119-153` (`/names/generate` + `kind`/`country`/`seed`), `:155-173` (`/names/mixed`) |
| Node worldgen client (person names only today) | `apps/fs-pro-server/src/services/worldgen/client.ts:70-76`, `:79-85`, `:87-94` |
| Node services API proxy | `apps/fs-pro-server/src/controllers/services/services.router.ts:53-76`, `:79-98`, `:101-104` |
| Node syllable tables (to retire) | `apps/fs-pro-server/src/services/transfers/system-country-names.service.ts:12-79`, `:85-104` |
| Culture→country-id lookup (to retire) | `apps/fs-pro-server/src/services/nationality.ts:4-7`, `:14-28` |
| Placeholder name pool (to retire) | `apps/fs-pro-server/src/utils/placeholder-names.ts:14-29`, `:31-36` |
| Places model (no culture column today) | `apps/fs-pro-server/src/db/drizzle/schema.ts:46-83` |
| Country sheets: names + demographics | `docs/cultures/STARTER.md`, `docs/cultures/image*.png`, `docs/cultures/UPP-map.jpeg` |
| Current Places rows per country; sample player names | `docs/perfect/phase-2/AUDIT.md` §8 |
| Floors / collision / deny-list tests | `services/worldgen/names/culture_test.go:32-198`; B4 report §2 |

**AUDIT.md §8 country rows** (the DB's short names; STARTER's spellings in
brackets): Ashter (`ASH`), Bellean (`BELL`), Ekhastan (`EKH`), Hunteerland
[Hunterland] (`HUN`), Kev (`KEV`), Kiyoto (`KIY`), Legardio (`LEG`), Pregge
(`PRG`), Proland (`PRO`), Simeone [Simeon] (`SIM`), UPP [Palaba + Galli]
(`UPP`). Only Bellean and Kev have child places today; the other nine have
none. "Republic of Galli" has no row of its own.

---

## 1. Culture model

Cultures are **data, not code** (L12). One culture row is a self-contained
naming bank; countries reference a culture and may carry a weighted
demographic **mix**. No code path knows any culture's name or phonology.

### 1.1 Culture row

Mirrors `services/worldgen/names/culture.go:36-43` and the shipped JSON:

```jsonc
{
  "id": "karsh",                 // slug, stable, lowercase [a-z0-9-]
  "displayName": "Karsh",
  "note": "one-line human description (docs/review only)",
  "family": "karsh",             // OPTIONAL (added by this spec): parent group id
  "phonology": { "onsets": [], "nuclei": [], "codas": [], "templates": [] },
  "banks": {
    "firstnames":  [], "surnames": [], "placewords": [],
    "clubwords": [], "stadiumwords": [],
    "regionwords": [], "citywords": [], "districtwords": [],
    "sheetnames": []             // OPTIONAL (added by this spec): curated sheet names
  },
  "patterns": {
    "club": [], "region": [], "city": [], "district": [], "stadium": []
  }
}
```

- `banks` and `patterns` are arbitrary token→list maps; pattern templates
  reference any bank by `{token}` (`culture.go:327-344`). Today's required
  tokens are `firstnames`, `surnames`, `placewords` (+ the four
  `*words` and the five kind patterns). Unknown tokens render empty, so an
  extra bank is additive.
- **`family` (new, optional)** is a tooling/UI grouping label only (e.g. the
  Karsh substrata share `family: "karsh"`); generation ignores it. It never
  gates resolution.
- **`sheetnames` (new, optional)** is the curated, unused-first suggestion
  pool (§6). If absent, suggestions fall back to `placewords`.
- **Floors** (L12): a culture used as a country's **primary** culture must
  have ≥400 distinct `firstnames` and ≥400 `surnames`, plus a non-empty
  pattern for every non-person kind. A **mix-only sub-group** (§1.3) must
  have ≥200/≥200. `services/worldgen/names/culture_test.go:34-86` enforces
  the floor today for the eight existing ids; it is extended to the new ids.

### 1.2 Country→culture

A country row maps a stable **key** to a primary culture, a mix, and
resolution **aliases**:

```jsonc
{
  "countries": {
    "bellean": {
      "displayName": "Karsh Republic of Bellean",
      "culture": "karsh",                       // primary (fallback)
      "mix":  [ {"culture":"karsh","weight":40}, … ],
      "aliases": ["karsh republic of bellean","bellean","bel"]
    }
  }
}
```

- Resolution (`culture.go:239-273`): exact culture id → alias → substring.
  Aliases must cover every spelling Node sends today plus DB codes
  (B4 report §Cultures and countries; AUDIT §8).
- The **key** is the contract id. It is *not* a DB id; it is a slug. Both the
  DB country rows and the worldgen map must resolve to it.

### 1.3 Sub-groups are weighted mixes, not code

The country sheets name demographic sub-groups — *Karsh-Barbar, Proman-Karsh,
Barbar, Proman, Nabumian/Nabum, Naburn, Kiyoto*. **Decision (D-CUL-1):**
sub-groups are **ordinary culture rows referenced by weight in a country's
mix**. No hyphenated ids and no per-country `if` branches are allowed.

- The Karsh-subcontinent substrata become three new culture rows —
  **`barbar`**, **`proman`**, **`nabum`** — each `family: "karsh"`, each with
  its own banks and patterns (data files, no code).
- A compound sheet label decomposes into base rows by splitting its weight
  evenly across the stems it names: `"Karsh-Barbar"` → `{karsh, barbar}`
  at half the label's weight each; `"Proman-Karsh"` → `{proman, karsh}`.
  This keeps the mix expressible purely as weights over existing/new rows.
  (Alternative — dedicated `karsh-barbar` banks — rejected: more banks to
  curate for no naming gain, and it makes the sheets' "Karsh-Barbar **and**
  Barbar" distinction into near-duplicate banks.)
- The loader already drops unknown mix entries and falls back to the primary
  (`culture.go:153-167`), so **adding sub-group rows is data-only and safe**
  even before every row exists.

### 1.4 Kinds

`first`, `last`, `full`, `club`, `region`, `city`, `district`, `stadium`
(`culture.go:174-186`). `full` is `first__last` (double underscore is the
split marker, `culture.go:299-308`). Every culture has patterns for the five
non-person kinds; a country without a mix behaves as its primary culture
(`culture.go:441-460`).

### 1.5 Determinism and collision rules

- Generation is `Generate(seed, culture|country) → names`
  (`culture.go:346-496`); the same seed reproduces the same batch. Callers
  that need a stable, auditable name pass an explicit seed; `seed: 0`/omitted
  means a fresh random seed (`server.go:175-180`).
- Uniqueness is enforced per request (`GenerateUnique`/`GenerateMixed`);
  a Roman-numeral suffix is a last resort only when a bank is exhausted
  (`culture.go:411-435`, `:478-494`). Never let the suffix reach the game:
  batches are squad-sized, so the floor is never hit in practice.
- Deny-list (`namecore.Denied`) filters at bank-build time and at runtime
  (`culture_test.go:139-162`). Real people and real clubs are covered; a
  real-**place** list and slurs are a documented gap (B4 report §5) and are
  a required addition for the sub-group banks (§9).

---

## 2. The six starting cultures + extras → B4 culture ids

All eight B4 ids are retained unchanged; the mapping is 1:1 and additive.

| STARTER culture | B4 culture id | Countries (STARTER) | worldgen country key(s) | DB rows (AUDIT §8) |
| --- | --- | --- | --- | --- |
| Karsh | `karsh` | Karsh Republic of Bellean; United Kinsalates of Ekhastan; Karsh State of Ashter | `bellean`, `ekhastan` (+`ekastan`), `ashter` | Bellean, Ekhastan, Ashter |
| Kev | `kev` | Free State of Kev | `kev` | Kev |
| Legardio | `legardio` | Royal Kindred of Simeon | `simeone` (+`simeon`, `royal kindred of simeon`) | Simeone |
| Hunterlaan | `hunterlaan` | Hunterland | `hunteerland` (misspelt), `hunterland` | Hunteerland |
| Inga | `inga` | United Provinces of Palaba; Republic of Galli | `upp` (+`palaba`, `galli`, `united provinces of palaba`) | UPP |
| Kiyoto | `kiyoto` | Kiyoto | `kiyoto` | Kiyoto |
| **extra** | `pregge` | — (Kev state *Pregge*) | `pregge` | Pregge |
| **extra** | `proland` | — (unsourced) | `proland` | Proland |

Notes.

- **Extra cultures.** B4 invented `pregge`/`proland` from the two existing
  DB countries that had Node syllable tables (`system-country-names.service.ts:67-78`)
  but no STARTER culture, so no Node behaviour is lost (B4 report §4.1).
  `Pregge` is one of Kev's twelve states (`docs/cultures/STARTER.md:17`);
  `Proland` has no sheet/STARTER source — flagged as an open question in §9.
- **Republic of Galli** is folded into the `upp` country key as an alias
  today. The sheet names it a *separate* Inga country; §9 records the decision
  to promote it to its own country row later (data-only) rather than now.
- New sub-group rows (`barbar`, `proman`, `nabum`) are **not** countries:
  they only appear as mix entries (§3).

---

## 3. Per-country demographic mixes

The three Karsh sheets carry explicit percentages; the other countries do not
(STARTER gives names/states only). Weights need not sum to 100 — `pickMix`
normalises over the total (`culture.go:498-514`), so write the sheet numbers
as-is.

### 3.1 Sheet-derived target mixes (spec-canonical)

Decoded from `docs/cultures/image-2.png` (Bellean), `image.png` (Ekhastan),
`image-3.png` (Ashter) using the decomposition in §1.3 (`Karsh-Barbar` →
`karsh`/`barbar` at half the label weight; `Nabumian`/`Naburn` → `nabum`):

| Country key | Sheet label → weight | Spec mix (culture:weight) |
| --- | --- | --- |
| `bellean` | Karsh-Barbar 50, Proman-Karsh 30, Nabumian 20 | `karsh:40, barbar:25, proman:15, nabum:20` |
| `ekhastan` | Karsh-Barbar 60, Barbar 20, Kiyoto 5, Nabum 15 | `karsh:30, barbar:50, kiyoto:5, nabum:15` |
| `ashter` | Karsh-Barbar 70, Proman 10, Nabum 10 *(sheet sums to 90)* | `karsh:35, barbar:35, proman:10, nabum:10` |

`ashter`'s sheet omits 10% (70+10+10=90). We keep the raw 90 total; the
loader normalises. **Do not invent the missing 10%.**

### 3.2 Countries with no sheet percentages (inferred)

No percentages exist for Kev, Simeon, Hunterland, Palaba/Galli or Kiyoto.
B4's shipping values are retained and marked **inferred**; they are tuning
knobs, editable as data once the owner has a preference.

| Country key | B4 shipping (retained) | Basis / note |
| --- | --- | --- |
| `kev` | `kev:90, hunterlaan:10` | adjacency; no sheet % |
| `simeone` | `legardio:95, karsh:5` | adjacency to Ashter; no sheet % |
| `hunteerland` | `hunterlaan:95, kev:5` | adjacency; no sheet % |
| `upp` | `inga:85, kiyoto:10, karsh:5` | B4; Palaba's "Nabum Semi-Autonomous Region" suggests a `nabum` presence → propose `inga:80, nabum:10, kiyoto:5, karsh:5` (§9) |
| `kiyoto` | `kiyoto:95, inga:5` | B4; no sheet % |
| `pregge` | `pregge:100` | B4 |
| `proland` | `proland:95, kev:5` | B4 |

### 3.3 Shipping vs target — the delta

`services/worldgen/names/data/misc/country_cultures.json` today holds B4's
approximations, e.g. Bellean `karsh 60 / legardio 15 / inga 15 / kiyoto 10`
(not the sheet's 50/30/20). The spec's §3.1 is authoritative; updating the
JSON to §3.1 + adding the three sub-group culture files is **data-only**
(loader untouched). That change **must also update**
`services/worldgen/names/culture_test.go:248-255` (`TestMixAwareHistogram`),
which asserts the old Bellean mix. Owner of that data commit: Batch 2C (the
world-seed owner) or a dedicated worldgen-data task; **not this agent** (B4
owns worldgen; this is spec + Node wiring). Recorded in §9.

---

## 4. Seed inventory — sheet names → banks

Every place name on the sheets/maps seeds that culture's bank as **curated**
entries (`genbanks` `PlaceSeeds`, `services/worldgen/cmd/genbanks/main.go:59,102,169-171`),
filtered through the deny-list. Existing `Places` rows (AUDIT §8) and the
retired Node syllable tables are additional seeds.

| Culture | Sheet/map seed names to fold into `sheetnames`/`placewords` |
| --- | --- |
| `karsh` | Bellean regions: Dha Marm State, Ivania State, KhalenJoosh State, Kukinn State, Northgate State, Southport State, Tileland State, Tobakaeem State; cities: Ivania Central, Brinkwall, Port Dinar, Kastle, Toyota, Bedebi-Kin, Philamentia, Gutersburg, Ingapot, Khashiru, Upland, New Simeone, Fort Kalvin, Fort Moomood, Robinstown, Kharapak-view Zone, Vendoostien, East Frydgeland. Ashter regions: Western Heights, Lady Anglia, Vamoosh, Shakla-Kin, Hem Ka-Kin, Central Administrative Area; cities: New Kantaloo, DelugeMa-Kin, Anglia-Kin, Vamoosh-Kin, Kae Kazim, Kinsah-Kin, Ashton-Kin, Karatoomila, City of Dinar, Port Sayid, Vimash. Ekhastan: Katar. Existing: Bellean Central/North, Aceepot, Ivania, KhalenJoosh, Kukinn, Northgate, Philamentia, Southport, Tileland, Tobakaeem. |
| `kev` | STARTER states: Storr, Stonkev, Sdev, Pregge, Potgregge, Pooventt, Midu, Manitobva, Jacwinth, Feedhein, Damwinth, Ceviva. Existing: Kev Central/North, Portgregge, Poovent + the above. *(Pregge is shared with the `pregge` culture; keep it in `kev` too — it is a Kev state.)* |
| `legardio` | Simeon: no sheet; existing names (Bellaro, Cascetti, Sisei, Bellano …). |
| `hunterlaan` | Hunterland: no sheet; existing names (Frostgard, Vinqvist, Bojland, Heer …). |
| `inga` | Palaba's 15 provinces: Ematob, Joshenkaal, Bellarea, Palaba Central, New Dinan, Nushigam, Kishin, Paking, Fridgeland, Southgate, Woodinsborrow, Rushma, Southend, Nabum Semi-Autonomous Region, Flowerpoht. UPP map (handwritten): Soohkol, Granads, Bellathn/Bellarea, Great Wotbings, Friggeland/Fridgend, New Dinar, Nushgam, Rushma, GRS, Nabum Savans, Woodinsborrow, Southend, Southgate. Country name `Galli`. |
| `kiyoto` | Kiyoto: no sheet beyond the country name; existing names (Opanimei, Chanko, Joimoto …). |
| `pregge` | Existing Pregge country/state names + the retired Node table (`system-country-names.service.ts:67-72`). |
| `proland` | Existing Proland country + the retired Node table (`system-country-names.service.ts:73-78`). |
| `barbar`/`proman`/`nabum` | **New.** No sheet name lists; seed from the Karsh `-Kin`/`-oosh`/`-winth` morphology and the Node `ekhastan`/`ashter` tables, then curate. |

The curated names live in a `sheetnames` bank (fallback: `placewords`) so
generation never accidentally uses a curated name as a random pattern token
unless a pattern asks for it.

---

## 5. `packages/api-contract` zod shapes

worldgen is server-to-server, so its wire shapes mirror into
`packages/api-contract` the same way the world-service shapes do
(`packages/api-contract/src/schemas/world-service.ts:1-13`). Add **one new
schema module** and extend three existing ones. Nothing here is a ts-rest
route except the read-only catalog proxy (§5.5).

### 5.1 New `packages/api-contract/src/schemas/culture.ts`

```ts
import { z } from 'zod';

/** Every kind worldgen can produce (services/worldgen/names/culture.go:174-186). */
export const NameKindSchema = z.enum([
  'first', 'last', 'full', 'club', 'region', 'city', 'district', 'stadium',
]);
export type NameKind = z.infer<typeof NameKindSchema>;

/** One weighted culture in a country's demographic mix. */
export const MixEntrySchema = z.object({
  culture: z.string().min(1),
  weight: z.number().int().positive(),
});

export const PhonologySchema = z.object({
  onsets: z.array(z.string()),
  nuclei: z.array(z.string()),
  codas: z.array(z.string()),
  templates: z.array(z.string()),
});

/** GET /cultures item (services/worldgen/names/culture.go:198-233). */
export const CultureInfoSchema = z.object({
  id: z.string().min(1),
  displayName: z.string(),
  note: z.string(),
  family: z.string().nullable().optional(),   // added by this spec; null when absent
  firstNames: z.number().int(),
  surnames: z.number().int(),
  placeWords: z.number().int(),
  kinds: z.array(NameKindSchema),
});

/** Full culture row (offline tooling / diagnostics; not on the hot path). */
export const CultureSchema = z.object({
  id: z.string().min(1),
  displayName: z.string(),
  note: z.string(),
  family: z.string().nullable().optional(),
  phonology: PhonologySchema,
  banks: z.record(z.array(z.string())),
  patterns: z.record(z.array(z.string())),
});

/** Country→culture (GET /countries, added by this spec — §8). */
export const CountryCultureSchema = z.object({
  key: z.string().min(1),
  displayName: z.string().optional(),
  culture: z.string().min(1),
  mix: z.array(MixEntrySchema),
  aliases: z.array(z.string()),
});

export const CultureCatalogSchema = z.object({ cultures: z.array(CultureInfoSchema) });
export const CountryCatalogSchema = z.object({ countries: z.record(CountryCultureSchema) });

/** POST /names/generate | /names/mixed request + response. */
export const NameRequestSchema = z.object({
  count: z.number().int().min(1).max(1000),
  culture: z.string().optional(),
  country: z.string().optional(),
  kind: NameKindSchema.optional(),
  returnParts: z.enum(['f_l', 'f', 'l']).optional(), // legacy
  seed: z.number().int().optional(),
}).refine((v) => !!v.culture || !!v.country, { message: 'culture or country is required' });

export const GeneratedNamesSchema = z.object({
  names: z.array(z.string()),
  cultures: z.record(z.number()).optional(),   // mix histogram
});

/** "Suggest a place name" — unused sheet names first, then generated (§6). */
export const SuggestPlaceNameRequestSchema = z.object({
  country: z.string().min(1),
  kind: z.enum(['region', 'city', 'district']),
  count: z.number().int().min(1).max(20).default(5),
  used: z.array(z.string()).default([]),
  seed: z.number().int().optional(),
});
export const SuggestPlaceNameSchema = z.object({
  names: z.array(z.string()),
  fromSheet: z.array(z.boolean()),   // per name: true = unused curated sheet name
});
```

### 5.2 Extend `packages/api-contract/src/schemas/place.ts`

Add to `PlaceSchema` (`:6-20`):

```ts
  /** Culture of this place (slug; a Cultures.id). Null for un-backfilled rows. */
  CultureId: z.string().nullable().optional(),
  /** Resolved culture display name, when the endpoint joins it. */
  Culture: z.string().nullable().optional(),
```

### 5.3 Extend `packages/api-contract/src/schemas/atlas.ts`

- `AtlasCountrySchema` (`:66-77`), `AtlasRegionSchema` (`:56-64`),
  `AtlasTownSchema` (`:39-54`): add `cultureId: z.string().nullable()`.
- `FoundCountrySchema` (`:137-144`), `NewCountrySchema` (`:180-185`),
  `NewTownSchema` (`:178`), `FoundTownSchema` (`:146-152`): accept optional
  `cultureId: z.string().optional()` (founder may pick/override; default is
  the parent country's culture, §7).
- `AtlasSearchResultSchema` (`:126-135`): add optional `cultureId`.

### 5.4 Extend `packages/api-contract/src/schemas/world-service.ts`

`TilePlaceSchema` (`:142-149`): add `cultureId: z.string().nullable()`. The Go
tile service selects it from `Places` (§8).

### 5.5 Catalog proxy route (client reads names, not raw Go)

Add `packages/api-contract/src/routes/cultures.ts`:

```ts
export const culturesContract = c.router({
  getCultures: {
    method: 'GET', path: '/',
    responses: { 200: successEnvelope(CultureCatalogSchema), 502: failEnvelope() },
  },
  getCountries: {
    method: 'GET', path: '/countries',
    responses: { 200: successEnvelope(CountryCatalogSchema), 502: failEnvelope() },
  },
}, { pathPrefix: '/cultures', strictStatusCodes: true });
```

Exported from `packages/api-contract/src/index.ts` alongside the others
(`:5-24`, `:32-53`), and re-export the culture types/schemas (`:55-160`).
Node serves it from a new route that proxies worldgen and caches (mirrors the
services API, `services.router.ts:101-104`); the client resolves
`Places.CultureId` → display name from this, so the atlas stays id-only.

---

## 6. How unused sheet names are offered first on founding

Today a founder types every new country/region/city name by hand and the
district is auto-named (`club-founding.service.ts:234-289`, `:316-383`;
`placement.service.ts:377-383` `<City> <Compass>`; admin cities get
`<City> Central`, `atlas.service.ts:391-401`). Nothing offers sheet names.

**Target flow** (user-editable, uniqueness still validated as today):

1. **worldgen** adds a suggestion source: `POST /names/suggest` (`server.go`
   route group `:44-46`), backed by a `SuggestPlaceNames(country, kind, used,
   count, seed)` that returns curated `sheetnames` (fallback `placewords`)
   entries for the country's culture **not present in `used`** (case- and
   punctuation-insensitive), then fills the remainder with generated names.
   Deterministic per `seed`; `fromSheet` marks which are curated. Curated
   names are served in sheet order, so each sheet's provinces/cities are
   offered in a stable, recognisable sequence.
2. **Node** adds `GET /api/atlas/suggest-name?countryId&kind` (`routes/atlas.ts`,
   implemented in `services/world/atlas.service.ts`): loads `used` = the
   country's existing sibling place names
   (`Places` where `ParentId = countryId` or `RegionId = countryId`), calls
   worldgen, and returns the names. On worldgen failure it logs
   (`[suggest-name] worldgen down …`) and returns `[]` so the UI just shows an
   empty suggestion box (the founder can still type).
3. **Client** (`found-club.vue` place/name entry) calls the route when the
   founder opens a new region/city and shows the offered names as chips;
   `PlacementSchema.needs`/`FoundClubSchema.newTown|newRegion|newCountry`
   (`schemas/atlas.ts:157-198`) are unchanged in shape — only prefilled.

Because `sheetnames` is a `placewords`-style bank, this needs **no generator
code change**, only the new endpoint + the data.

---

## 7. Migration: put Culture on Places

### 7.1 Schema

New migration (next free number, after `0041_clubs_district_index.sql`):

```sql
-- Cultures catalog, mirrored from worldgen's GET /cultures (idempotent upsert).
CREATE TABLE "Cultures" (
  "id"          text PRIMARY KEY,            -- slug, e.g. 'karsh'
  "DisplayName" text NOT NULL,
  "Family"      text,                        -- nullable; sub-group parent
  "FirstNames"  integer NOT NULL DEFAULT 0,
  "Surnames"    integer NOT NULL DEFAULT 0,
  "PlaceWords"  integer NOT NULL DEFAULT 0,
  "Source"      text NOT NULL DEFAULT 'worldgen',
  "SyncedAt"    timestamptz,
  "createdAt"   timestamptz NOT NULL DEFAULT now(),
  "updatedAt"   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE "Places"
  ADD COLUMN "CultureId" text REFERENCES "Cultures"("id");

CREATE INDEX "Places_CultureId_idx" ON "Places" ("CultureId");
```

- The FK is text→text (no uuid work), because culture ids are slugs
  (L12 "cultures are data").
- `Places.CultureId` is nullable: countries get it from the backfill; places
  founded before a culture is known, or by a user with no culture chosen, stay
  NULL and are assigned at founding (§7.3).
- Add the column to `apps/fs-pro-server/src/db/drizzle/schema.ts:46-83`
  (`CultureId: text('CultureId').references(() => cultures.id)`) plus a
  `cultures` table export and relations. The migration is generated from that
  schema change (drizzle-kit), not hand-written, so the two never drift.

**Decision (D-CUL-2): a catalog table, not a bare slug.** Options were
(a) `Places.CultureId` text with no table, (b) a `Cultures` table. Chosen
(b): it gives the client a name/`family` to render without a Go round-trip,
lets tiles/atlas join cheaply, and keeps the FK honest. worldgen stays the
generator source of truth; the table is a cached mirror refreshed from
`GET /cultures` (idempotent, `Source='worldgen'`).

### 7.2 Backfill (idempotent)

A migration/script (batch 2B owns it; per L3/L12):

1. Upsert every `GET /cultures` row into `Cultures`. If worldgen is down,
   insert the eight known ids from a small committed seed table and log;
   re-run on next boot.
2. For every `Places` row with `Type='country'`, resolve its culture against
   the `country_cultures.json` map (key + aliases, case-insensitive on
   `Name`/`Code`/`Fullname` ends-with) and set `CultureId`. Unmatched
   countries (user-founded) stay NULL.
3. For `region`/`city`/`district` rows, set `CultureId` by walking to the
   country (`ParentId` → country for regions/cities; `RegionId`/`ParentId`
   chain for districts) and copying it. Run after step 2.
4. Idempotent: `UPDATE … WHERE "CultureId" IS NULL` (never overwrite a value
   a founder explicitly chose). Re-runs are no-ops.
5. Verify with before/after counts per `Type` and `CultureId` (AUDIT method:
   read-only psql on a dev-schema copy; never the dev DB directly).

Known dev-DB caveat (AUDIT §"Dev DB caveat" and §9.1): the dev `fspro` is
behind the code (no `city`/`district`, migration 0038 unapplied). The culture
backfill must run on a reconciled schema, on a scratch DB.

### 7.3 Assignment at founding

- `FoundClubSchema.newCountry`/`newTown` (`schemas/atlas.ts:178-198`) gain an
  optional `cultureId`. Default: the parent country's `CultureId` for a new
  region/city; for a **new country**, the founder must pick from the catalog
  (client shows `GET /api/cultures`), defaulting to the culture of the
  nearest existing country.
- `openPlaces` (`club-founding.service.ts:316-383`) writes the resolved
  `CultureId` on every place it creates. `placeNameProblem` (`:245-289`) is
  unchanged (names are still validated); only the culture column is new.
- Assignment is inside the existing founding transaction, so a place never
  exists without its culture (once the new-country path is used).

---

## 8. Read-through: atlas, tiles, crests, campus

Culture affects **naming and look only** (D3). Every reader treats an unknown
or NULL `CultureId` as "no culture" and falls back to today's behaviour.

### 8.1 Atlas

- `services/world/atlas.service.ts` `loadPlaces` already does
  `select()` (`:107`), so `CultureId` comes free; add it to `toCountry`/
  `toRegion`/`toTown` (`:59-100`) and the schemas (§5.3).
- Client map tooltips/headers show the culture display name (resolved via
  `GET /api/cultures`, cached once). The founding entry uses it for the
  suggestion chips (§6).
- `AtlasCountry.colors` (`atlas.service.ts:65`) is founder-chosen; culture
  may supply a **default palette hint** when a new country is founded
  (cosmetic, optional).

### 8.2 Tiles (world-service, Go)

- `TilePlaceSchema` gains `cultureId` (§5.4). The tile service
  (`services/world-service/internal/tiles/`) selects `"CultureId"` alongside
  the existing place columns and returns it. Client LOD map may tint/label by
  culture. This is the only cross-module Go change; it is a **new field on an
  existing query** plus a contract field, not a new system. Node's tile route
  (`controllers/world/tiles.router.ts:12-22`) is unchanged (it proxies).

### 8.3 Crests

- `FoundClubSchema.crest` (`schemas/atlas.ts:196`) is already founder-chosen;
  `randomCrest(seed, initials)` (`crest.ts:56-76`) is the first suggestion.
- Add a cosmetic `CULTURE_CREST_HINTS: Record<string, { palette: string[]; emblems: CrestEmblem[] }>`
  to `packages/api-contract` (data). At founding, seed the first suggestion
  with `randomCrest(`${cultureId}:${placeId}`, code)` and bias the palette/
  emblem list toward the hint. **Deterministic** (culture id is part of the
  seed) and purely visual; no economy/gameplay coupling.

### 8.4 Campus

- Today the campus scene is chosen by `Places.Terrain`
  (`schema.ts:79-80` → `atlas.service.ts:56-57` `terrainOf` →
  `campus-grid.ts` buildings). Culture adds an **optional cosmetic skin layer**
  keyed by `CultureId` (pitch surround, crowd colours, prop set), read from
  `Places.CultureId` at campus load. It never changes `CAMPUS_BUILDINGS`,
  placement validation (`campus-grid.ts:55-70`) or any facility effect (D3).
  Missing culture = today's unchanged scene.

---

## 9. Node cut-over plan (retire the syllable tables)

**One new module wraps worldgen and owns the fallback.**
`apps/fs-pro-server/src/services/worldgen/names.service.ts` (new), sitting on
top of `services/worldgen/client.ts`. It exposes thin, typed functions:

```ts
generatePersonNames(country: string, count: number, seed?: number):
  Promise<{ firstName: string; lastName: string }[]>        // /names/mixed (f_l)
generatePersonNamesForCulture(culture: string, count, seed?): Promise<…>
suggestPlaceNames(country, kind, used, count?, seed?): Promise<string[]>  // §6
cultureForCountry(country: string): Promise<string | null>   // cached catalog
countryIdForCulture(culture: string): Promise<string | null> // replaces nationality.ts
catalog(): Promise<{ cultures: CultureInfo[]; countries: CountryCatalog }> // cached
```

**Fallback rule (L12).** Every function `try`s worldgen; on failure it
`log('worldgen down; <fn> falling back (<err>)')` **once per call** and
returns a local fallback. The fallbacks are the *only* place the old data may
survive, and only until a follow-up deletes them:

- person names → a small frozen pool copied from today's
  `placeholder-names.ts` (kept **inside this module**, not as a shared util);
- `cultureForCountry`/`countryIdForCulture` → the last cached catalog, else
  `null` (callers degrade to `NationalityId = null`, which existing code
  already tolerates);
- `suggestPlaceNames` → `[]`.

### 9.1 Retire `system-country-names.service.ts`

- Delete `SYSTEM_COUNTRY_SYLLABLES` (`:12-79`) and
  `generateSystemCountryName` (`:85-104`).
- Call sites to repoint:
  - `apps/fs-pro-server/src/services/transfers/foreign-intake.service.ts:6`
    (import) and `:66` (call) → `generatePersonNames(country.name, 1)`;
    keep `nationality: country.name` and `nationalityId: country.id`
    (`:83-84`), and set the new `CultureId` from `cultureForCountry`.
  - `apps/fs-pro-server/src/scripts/testForeignIntake.ts:5` (import),
    `:11`, `:13` (uses `Object.keys(SYSTEM_COUNTRY_SYLLABLES)`) → fetch the
    country list from the catalog or delete the script (dev-only).

### 9.2 Retire `nationality.ts`

- Delete `nationalityIdForCulture` (`:14-28`) and `LEGACY_COUNTRY_IDS`
  (`:4-7`). The legacy hard-coded uuid map is exactly the kind of hidden
  global state L12 removes.
- Call sites to repoint:
  - `apps/fs-pro-server/src/controllers/players/player.controller.ts:17`
    (import), `:167` (call) → `countryIdForCulture(culture)` from the new
    module (queries `Places` where `Type='country'` by `CultureId`/alias, not
    a uuid constant).
  - `apps/fs-pro-server/src/controllers/players/player-lifecycle.service.ts:9`
    (import), `:209` (call) → same.

### 9.3 Retire `utils/placeholder-names.ts`

- Delete the file (`:14-36`); its pool lives only as the names.service
  fallback (§9).
- Call sites to repoint:
  - `apps/fs-pro-server/src/services/world/club-founding.service.ts:18`
    (import), `:201` (`createSquad`) → `generatePersonNames(countryName, 1)`
    per player. Note L1 removes the founding squad entirely; the real users
    are the L5 restock and youth intake, so this edit is mechanical and the
    code is deleted with the rest of `createSquad`'s amateurs when L1 lands.
  - `apps/fs-pro-server/src/controllers/players/player-lifecycle.service.ts:7`
    (import), `:217` (`runYouthIntakeForYear`) → `generatePersonNames(
    countryName, count)` batched once per club, then split.

### 9.4 Keep the legacy bank files out of the runtime, then delete

`services/worldgen/names/data/name_bank/*.json` and
`data/misc/name_arrangements.json` are already unembedded/unused
(B4 report §1, §5). Delete them in the same data commit that updates the
mixes (§3.3).

### 9.5 New worldgen reads required by the cut-over

Two additive endpoints B4 did not add (wiring, not generation):

- `GET /cultures` already exists (`server.go:110-117`); the client catalog
  proxy (§5.5) and the `Cultures` backfill (§7.2) use it.
- `GET /countries` (**new**, `server.go:44-46` group) — serves the
  `country_cultures.json` map so Node can resolve a country's culture/mix
  without mirroring it. `GET /api/cultures/countries` proxies it.
- `POST /names/suggest` (**new**, §6).

### 9.6 After the cut-over — grep (acceptance)

Node must contain **no naming tables**:

```
grep -rn "SYSTEM_COUNTRY_SYLLABLES\|generateSystemCountryName\|nationalityIdForCulture\|PLACEHOLDER_FIRST_NAMES\|PLACEHOLDER_LAST_NAMES\|pickPlaceholderName" \
  apps/fs-pro-server/src
# expected: (no output)
```

The only allowed naming fallback is `services/worldgen/names.service.ts`,
and it is only reached when worldgen is down (logged).

---

## 10. Tests and acceptance

**worldgen (Go)** — already green on B4 (B4 report §2); re-run after the
§3.3/§4 data commit:

- `go test ./...`, `go vet ./...`, `go test -race ./...` (Docker
  `golang:1.24-bookworm`).
- Floors for the six starting cultures (≥400/≥400) and every primary culture;
  ≥200/≥200 for `barbar`/`proman`/`nabum`.
- `TestCollisionRate100k` full-name rate ≤5% (B4: 1.24%); determinism
  (`TestDeterministicPerSeed`).
- `TestDenylist` over all kinds for the new cultures too.
- **Mix histogram**: updated for §3.1 (Bellean `karsh 40 / barbar 25 /
  proman 15 / nabum 20`); a 20k draw within ±0.03 per culture.
- New: `SuggestPlaceNames` returns `sheetnames` before generated names, and
  excludes `used` (case-insensitive); sheet order preserved.

**Node (vitest)** — added by the wiring batches (2B/2C):

- `names.service` unit tests: worldgen happy path; worldgen-down path logs and
  returns the fallback; catalog cache behaviour.
- `foreign-intake`, `runYouthIntakeForYear` and (pre-L1) `createSquad` call
  worldgen (mock fetch asserts the `/names/mixed` body).
- Migration: upsert catalog is idempotent; backfill sets country `CultureId`
  from aliases, inherits to children, leaves user-founded NULL; before/after
  counts per `Type` equal expected; re-run is a no-op.
- `countryIdForCulture` resolves the old legacy ids to the right DB rows.
- Contract: `CultureCatalogSchema`/`CountryCatalogSchema`/`GeneratedNamesSchema`
  parse real worldgen responses (fixtures); `PlaceSchema`/atlas/tile schemas
  typecheck with the new fields.

**Client** — Batch 3/4: culture name shows in atlas tooltips; suggestion
chips appear on founding; crest/campus skins are cosmetic and
reduced-motion-safe (D3).

---

## 11. Risks, gaps and open questions

1. **Sheet demography is explicit only for Bellean/Ekhastan/Ashter.** Kev,
   Simeon, Hunterland, Palaba/Galli and Kiyoto mixes are inferred (B4) and
   are tuning knobs. (§3.2)
2. **Ashter's sheet sums to 90%.** We keep the raw weights and let `pickMix`
   normalise; do not fabricate the missing 10%. (§3.1)
3. **Updating the mixes breaks `TestMixAwareHistogram`** — the data commit
   must update `culture_test.go:248-255`. (Risk to schedule, not a blocker.)
4. **`Proland` has no sheet/STARTER source.** B4 invented it from a DB
   country. Open question for the lead: keep as an invented culture or merge
   into `kev`/`proland` region. Recommendation: keep (DB country exists).
5. **`Republic of Galli` has no DB row.** It is an alias of `upp` today. The
   sheet names it a separate Inga country; recommend promoting it to its own
   country row later (data-only). Recorded as a decision candidate.
6. **Palaba's `Nabum Semi-Autonomous Region`** implies a `nabum` presence in
   `upp`; proposed mix `inga 80 / nabum 10 / kiyoto 5 / karsh 5` (replaces
   B4's `inga 85 / kiyoto 10 / karsh 5`). (§3.2)
7. **New sub-group banks need curation** — B4 seeded them from Karsh
   morphology + the retired Node tables; they must be reviewed for
   real-world/odd output, and the deny-list must gain a real-**place** list
   and a slur list (both still gaps per B4 report §5).
8. **worldgen availability.** The Node cut-over introduces a runtime
   dependency on localhost:3004; the logged fallback keeps the game playable,
   but any place-name flow that depends on suggestions must degrade to
   "type it yourself".
9. **Dev DB is behind** (AUDIT §9.1): the culture backfill must run on a
   reconciled scratch DB, never the dev `fspro`.
10. **Append-only decisions.** This agent did not touch worldgen data or tests;
    the data commit is owned by the batch that owns `services/worldgen` data
    (§3.3). This spec is the contract that commit implements.

---

## 12. Decision register (append to `DECISIONS.md`)

| # | Question | Options | Choice | Why |
| --- | --- | --- | --- | --- |
| D-CUL-1 | Are demographic sub-groups their own banks or variants? | (a) dedicated `karsh-barbar`/`proman-karsh` rows; (b) decompose into base rows by weight | **(b) base rows `karsh`, `barbar`, `proman`, `nabum` + weights; compound labels split evenly** | L12 "weighted mixes not code"; loader already resolves by id and drops unknowns (`culture.go:153-167`); fewer banks to curate. |
| D-CUL-2 | Store culture on Places as a bare slug or a catalog table? | (a) text slug, no table; (b) `Cultures` mirror table + FK | **(b) catalog + FK** | Client/tiles/atlas render names/family without a Go round-trip; FK keeps it honest; worldgen stays the generator source. |
| D-CUL-3 | Source of the Node country→culture resolution after `nationality.ts` is retired | (a) mirror `country_cultures.json` in api-contract; (b) new worldgen `GET /countries`, cached in Node | **(b) fetch + cache** | One source (L12); no drift; the fallback returns `null` and callers already tolerate it. |
| D-CUL-4 | Where do curated sheet names live? | (a) random `placewords`; (b) dedicated `sheetnames` bank | **(b) `sheetnames`** | Keeps curated, unused-first names separate from pattern vocabulary; suggestions stay in sheet order. |
| D-CUL-5 | Galli and Proland handling | (a) leave as aliases/invented; (b) promote Galli to its own country row | **(a) now, (b) noted as a later data-only change** | Keeps this spec additive and shippable; no behaviour lost today. |
