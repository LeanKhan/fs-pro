# B4-CULTURES-REPORT.md — Batch 4 (phase 1 re-run): cultures + worldgen names

Agent: Batch 4 (cultures) · Branch `perfect/b4-cultures` · Worktree
`.claude/worktrees/b4` · Base `perfect/integration`.
Scope: **GO-ONLY, `services/worldgen`**. No Node app server, no client, no
other Go module was touched.

Deliverables (task brief): ≥8 cultures with name banks; a culture
schema/loader keyed by culture plus mix-aware generation that keeps the
existing endpoints working; tests (per culture/kind table, per-seed
determinism, deny-list, 100k collision rate); `go test` + `go vet`; this
report; a commit on the branch.

---

## 1. What changed

### New files

| File | Purpose |
| --- | --- |
| `services/worldgen/names/culture.go` | Culture schema + embedded loader (keyed by **culture id**), country→culture alias/mix resolution, kinds (`first`,`last`,`full`,`club`,`region`,`city`,`district`,`stadium`), seeded `GenerateKind`, `GenerateUnique`, `GenerateMixed`, `GenerateBatch`, `CultureInfos`. |
| `services/worldgen/names/culture_test.go` | Table tests per culture × kind, per-seed determinism, bank floors, deny-list, 100k collision measurement, alias resolution, mix histogram. |
| `services/worldgen/names/bench_test.go` | Generation benchmarks. |
| `services/worldgen/internal/namecore/namecore.go` | Pure phonotactic syllable assembler (no embed/init), shared with the bank generator; guards against consonant pile-ups at syllable boundaries. |
| `services/worldgen/internal/namecore/denylist.go` | Real people/clubs deny-list + normaliser (`Normalize`, `Denied`, `DenylistSize`). |
| `services/worldgen/cmd/genbanks/main.go` | Offline deterministic bank generator (writes the JSON below). |
| `services/worldgen/names/data/cultures/{karsh,kev,legardio,hunterlaan,inga,kiyoto,pregge,proland}.json` | One file per culture: phonology, banks (`firstnames`, `surnames`, `placewords`, `clubwords`, `stadiumwords`, `regionwords`, `citywords`, `districtwords`), patterns for club/region/city/district/stadium. |
| `services/worldgen/names/data/misc/country_cultures.json` | Country key → primary culture, weighted demographic mix, aliases. |

### Modified files

| File | Change |
| --- | --- |
| `services/worldgen/names/generator.go` | Rewritten from the 2-culture arrangement compiler to a thin, backwards-compatible facade: `GenerateName(returnParts, culture)` and `Cultures()` delegate to the new engine. The public signatures are unchanged. |
| `services/worldgen/server/server.go` | Extended `POST /names/generate` with optional `kind`, `country`, `seed` (old `{count,culture,returnParts}` still works); added `GET /cultures`, `POST /names/mixed`; `/names/family` unchanged; `/health` now lists 8 cultures. |
| `services/worldgen/server/server_test.go` | Added endpoint tests for every kind, seeded determinism, `/cultures`, and mixed generation; existing tests kept. |

`services/worldgen/names/data/name_bank/{bellean,kev}.json` and
`data/misc/name_arrangements.json` are **retained as provenance** but are no
longer embedded or loaded; their seed names were folded into the `karsh`/
`kev` banks. (See gaps.)

### Cultures and countries

Six from `docs/cultures/STARTER.md` plus two invented extensions chosen from
the existing world so no Node behaviour is lost
(`services/transfers/system-country-names.service.ts`, the tables phase 2
retires):

| Culture id | Display | Source countries / seeds |
| --- | --- | --- |
| `karsh` | Karsh | Bellean, Ekhastan, Ashter (Dha Marm, Ivania, Tileland, Kae Kazim, -Kin, -oosh) |
| `kev` | Kev | Free State of Kev (Storr, Stonkev, Sdev, Pregge, -veezl, -egge, -winth) |
| `legardio` | Legardio | Royal Kindred of Simeon (Bellaro, Cascetti, -ino, -etto, -ello) |
| `hunterlaan` | Hunterlaan | Hunterland (Frostgard, Vinqvist, -gard, -holm) |
| `inga` | Inga | United Provinces of Palaba, Galli (Ematob, Nushigam, Southgate, Rushma) |
| `kiyoto` | Kiyoto | Kiyoto (Opanimei, Chanko, Joimoto, -gawa, -moto) |
| `pregge` | Pregge | **invented**: existing Pregge country + its Node syllable table |
| `proland` | Proland | **invented**: existing Proland country + its Node syllable table |

Country mixes in `country_cultures.json` (drawn from the country sheets where
present), e.g. Bellean `karsh 60 / legardio 15 / inga 15 / kiyoto 10`,
Ekhastan `karsh 70 / pregge 10 / kiyoto 10 / inga 10`. Aliases cover the
spellings Node sends today (`bellean`, `ekastan`/`ekhastan`, `ashter`,
`simeone`/`simeon`, `hunteerland` (misspelt), `hunterland`, `upp`, `palaba`,
`galli`, `kiyoto`, `pregge`, `proland`, country codes).

### Floors

Each culture's generated JSON holds **2,000 distinct first names, 2,000
distinct surnames and 200 place words** (floor: ≥400/≥400), plus patterns for
all five non-person kinds.

### New/extended HTTP surface (all additive)

```
GET  /cultures                 -> {cultures:[{id,displayName,note,firstNames,surnames,placeWords,kinds}]}
POST /names/generate           -> {names:[...]}                      (existing; + kind/country/seed)
                                 -> {names:[...], cultures:{...}}    (when country is set)
POST /names/mixed              -> {names:[...], cultures:{...}}      (country required)
POST /names/family             -> {names:[...]}                      (unchanged)
```

`POST /names/generate {count, culture}` with no `kind` still defaults to
`full` and still returns `firstname__lastname`; an unknown culture still
returns 400 (preserving `TestGenerateRejectsUnknownCulture`).

---

## 2. Commands and output

All Go commands run on Windows `go.exe` (there is no Linux Go). Per the brief
`GOTOOLCHAIN=local` is set inside a `.bat` because env vars do not cross
WSL→Windows interop.

### `go test ./...` (required)

```bat
@echo off
set GOTOOLCHAIN=local
"C:\Program Files\Go\bin\go.exe" test ./...
```

```
?   	fs-pro-worldgen	[no test files]
?   	fs-pro-worldgen/cmd/genbanks	[no test files]
?   	fs-pro-worldgen/faces	[no test files]
?   	fs-pro-worldgen/internal/namecore	[no test files]
ok  	fs-pro-worldgen/names	0.989s
ok  	fs-pro-worldgen/server	1.007s
```

### `go vet ./...` (required)

```bat
@echo off
set GOTOOLCHAIN=local
"C:\Program Files\Go\bin\go.exe" vet ./...
```

```
(no output)
vet exit code: 0
```

### `go test -race ./...` (R4; Windows `go.exe` has no cgo)

Run in `golang:1.24-bookworm`, per the environment's phase-1 precedent:

```
docker run --rm -v "$PWD":/w -w /w golang:1.24-bookworm go test -race ./...
```

```
?   	fs-pro-worldgen	[no test files]
?   	fs-pro-worldgen/cmd/genbanks	[no test files]
?   	fs-pro-worldgen/faces	[no test files]
?   	fs-pro-worldgen/internal/namecore	[no test files]
ok  	fs-pro-worldgen/names	2.734s
ok  	fs-pro-worldgen/server	1.174s
```

### Collision rate over 100k generated names

`go test ./names -run TestCollisionRate100k -v`

```
culture=karsh       full-collision-rate=0.0127 first-collision-rate=0.9800 (distinct full 98728/100000)
culture=kev         full-collision-rate=0.0116 first-collision-rate=0.9800 (distinct full 98838/100000)
culture=legardio    full-collision-rate=0.0127 first-collision-rate=0.9800 (distinct full 98729/100000)
culture=hunterlaan  full-collision-rate=0.0125 first-collision-rate=0.9800 (distinct full 98753/100000)
culture=inga        full-collision-rate=0.0124 first-collision-rate=0.9800 (distinct full 98763/100000)
culture=kiyoto      full-collision-rate=0.0125 first-collision-rate=0.9800 (distinct full 98748/100000)
culture=pregge      full-collision-rate=0.0124 first-collision-rate=0.9800 (distinct full 98755/100000)
culture=proland     full-collision-rate=0.0125 first-collision-rate=0.9800 (distinct full 98754/100000)
aggregate full-name collision rate over 800000 names = 0.0124
PASS
```

**Reported number: full-name collision rate = 1.24 % (0.0124) over 800,000
names; 1.16–1.27 % per culture over 100,000 names each.** The first-name
collision rate is 0.98 because a 2,000-entry first-name bank is exhausted by
100k draws; within a realistic club batch uniqueness is enforced by rejection
(`GenerateUnique`), so collisions never reach the game.

### Benchmarks

`go test ./names -bench . -benchmem -run '^$'`

```
BenchmarkGenerateFullName-16           	   88801	     14706 ns/op	    5444 B/op	       5 allocs/op
BenchmarkGenerateUniqueClubSquad-16    	   22645	     64015 ns/op	    8441 B/op	     110 allocs/op
BenchmarkGenerateMixedFullName-16      	   20811	     59327 ns/op	    7901 B/op	      74 allocs/op
PASS
```

(25-name unique squad ≈ 64 µs; batch APIs reuse one seeded RNG.)

### Bank generator (reproducible)

`go run ./cmd/genbanks` writes the eight culture files and
`country_cultures.json`; re-running produces byte-identical output.

```
karsh       first=2000 last=2000 place=200
kev         first=2000 last=2000 place=200
legardio    first=2000 last=2000 place=200
hunterlaan  first=2000 last=2000 place=200
inga        first=2000 last=2000 place=200
kiyoto      first=2000 last=2000 place=200
pregge      first=2000 last=2000 place=200
proland     first=2000 last=2000 place=200
wrote country_cultures.json
```

### Sample output (all eight cultures, seed 12345)

```
== karsh
   first    Ruva / Gemu          last Yezbebe / Ligi        full Ruva__Ligi
   club     "Shozho Kinsalat"    region "Nejedre County"    city "Haven Shotrai"
   district "Gate Nejedre"       stadium "The Khainargi Bowl"
== kev
   first    Tudrermai / Kverra   last Kuvro / Bleemeesu      full Tonfebrik__Taibrata
   club     "Bosku Club"         region "Zibinpi County"     city "Haven Jeveepoo"
   district "Gate Zibinpi"       stadium "Zibinpi Weg"
== legardio, hunterlaan, inga, kiyoto, pregge, proland  (same shape)
== mixed Bellean (first, 12)
   [Vaufau Mettou Shogit Juzu Zokhimen Trifia Rugei Wairei Hofozhu Chipime Ghita Voujumri]
   hist=map[inga:1 karsh:6 kiyoto:1 legardio:4]
```

---

## 3. Acceptance criteria

| # | Criterion | Evidence |
| --- | --- | --- |
| 1 | ≥8 cultures incl. the 6 STARTER ones + 2 invented | `TestAllExpectedCulturesLoad` (PASS); `/health` `cultures`; §1 table |
| 2 | ≥400 distinct first names and surnames per culture | `TestCultureBankFloors` (PASS); banks are 2,000/2,000 |
| 3 | Patterns for club, region, city, district, stadium | `TestCultureBankFloors` asserts a non-empty pattern list per kind; `TestGenerateEveryKindEndpoint` (PASS) |
| 4 | Culture schema/loader keyed by culture (not country) | `names/culture.go` (`culturesByID`, `CultureInfo`); country→culture aliases/mix in `country_cultures.json` |
| 5 | Mix-aware generation, existing endpoints unbroken | `TestGenerateMixedEndpoint`, `TestMixedNamesEndpoint` (PASS); original `TestGenerateNamesEndpoint`, `TestFamilyNamesEndpoint`, `TestGenerateRejectsUnknownCulture` still PASS |
| 6 | Table tests per culture/kind | `TestGeneratePerCultureAndKind` (8 × 8, PASS) |
| 7 | Determinism per seed | `TestDeterministicPerSeed`, `TestGenerateSeedIsDeterministic` (PASS) |
| 8 | Deny-list test (real people/clubs) | `TestDenylist` + static-bank check in `TestCultureBankFloors` (PASS) |
| 9 | Collision rate over 100k names, reported | `TestCollisionRate100k` → 1.24 % aggregate (PASS) |
| 10 | `go test ./...` and `go vet` | §2 (PASS, vet clean) |
| 11 | No real people / real club names | Generator and runtime both filter via `namecore.Denied`; deny-list samples `Lionel Messi`, `Real Madrid`, `Manchester United`, `Bayern Munich`, … |
| 12 | No Node app-server / client edits | `git status` shows only `services/worldgen/**` and this doc |

---

## 4. Assumptions and decisions

1. **Two extra cultures = `pregge`, `proland`.** The brief says "2 more
   invented ones". The world already contains the fictional countries Pregge
   and Proland with their own Node syllable tables; reusing them as the two
   additional cultures keeps "no behaviour lost" (L12) and avoids inventing
   countries the world does not have. Their banks are invented data.
2. **Sub-group mixes map onto culture ids.** The sheets name demographic
   sub-groups (Karsh-Barbar, Proman-Karsh, Nabumian, …). Phase 2's L12 left
   open whether those are separate banks or variants of a parent culture; I
   modelled them as weighted references to the eight culture ids in
   `country_cultures.json` (recorded here rather than inventing 3–4 extra
   banks per country). Extending to true sub-banks is data-only.
3. **Uniqueness is enforced per request** by rejection sampling
   (`GenerateUnique`/`GenerateMixed`), with a Roman-numeral suffix only as a
   last resort when a bank is exhausted. Raw sampling (`GenerateBatch`) is
   kept for honest collision measurement.
4. **Deny-list** covers notable football people and real professional clubs
   (normalised equality, whole-phrase substring, and long-token equality).
   Slurs/profanity and a real-place deny-list are a documented gap.
5. **Seed 0 / omitted = fresh random seed**; an explicit `seed` makes any
   request reproducible (deterministic simulation requirement).

---

## 5. Known gaps

- **Node is not wired to the new kinds.** This task is GO-ONLY; the service
  exposes `kind`/`country` additively, but retirement of the Node syllable
  tables and routing place/person generation through the new kinds is Batch
  2C/4B work, not here.
- **Legacy bank files retained** (`data/name_bank/*.json`,
  `data/misc/name_arrangements.json`) but unused; they can be deleted once the
  Node callers are migrated.
- **No real-place deny-list and no slur list.** Real *people* and real *club*
  names are covered; real place names are not (the task only required
  people/clubs).
- **Mix sub-banks** are approximated by culture weights, not separate
  demographic banks (see assumption 2).
- **Race run via Docker**, not Windows `go.exe` (Windows Go needs cgo/gcc for
  `-race`; none is installed).
- Some generated strings are still phonotactically unusual (the invented
  cultures are meant to sound foreign); a human pass could curate the top
  entries if desired.
