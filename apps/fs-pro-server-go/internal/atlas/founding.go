package atlas

import (
	"context"
	"fmt"
	"math"
	"math/rand"
	"os"
	"regexp"
	"strings"
	"time"

	"fs-pro-server/internal/clients"
	"fs-pro-server/internal/club"
	"fs-pro-server/internal/clubhouse"
	"fs-pro-server/internal/db"
	"fs-pro-server/internal/grid"
	"fs-pro-server/internal/player"
)

// Club/place founding, ported from club-founding.service.ts. The non-fatal
// side effects Node fires after the transaction (news post + free-agent
// restock) are not ported; they are wrapped in catch() there.

const (
	startingFans       = 40000
	startingReputation = 5
)

// FoundingError mirrors atlas.service FoundingError.
type FoundingError struct {
	Message string
	Status  int
}

func (e FoundingError) Error() string { return e.Message }

func drawStartingBalance() float64 {
	return 1_000_000 + float64(rand.Intn(41))*100_000
}

var clubCodeStrip = regexp.MustCompile(`[^A-Z0-9]+`)

func (r *Repository) uniquePlaceCode(ctx context.Context, base string) (string, error) {
	rows, err := r.q.Query(ctx, `SELECT "Code" FROM "Places" WHERE "Code" LIKE $1`, base+"%")
	if err != nil {
		return "", err
	}
	list, err := db.ScanAll(rows)
	if err != nil {
		return "", err
	}
	taken := map[string]bool{}
	for _, row := range list {
		taken[mstr(row, "Code")] = true
	}
	code := base
	for n := 2; taken[code]; n++ {
		code = base + itoa(n)
	}
	return code, nil
}

var compass = []string{"Central", "North", "East", "South", "West", "Highlands", "Coast", "Valley", "Lowlands", "Uplands"}

func regionNameFor(countryName string, i int) string {
	word := compass[i%len(compass)]
	if i < len(compass) {
		return countryName + " " + word
	}
	return fmt.Sprintf("%s %s %d", countryName, word, i/len(compass)+1)
}

func (r *Repository) requireUser(ctx context.Context, userID string) (map[string]any, error) {
	if userID == "" {
		return nil, FoundingError{"Not logged in", 403}
	}
	user, ok, err := r.one(ctx, `SELECT * FROM "Users" WHERE "_id" = $1 LIMIT 1`, userID)
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, FoundingError{"Not logged in", 403}
	}
	return user, nil
}

func needsSet(spot map[string]any) map[string]bool {
	out := map[string]bool{}
	for _, v := range toAnyList(spot["needsNames"]) {
		if s, ok := v.(string); ok {
			out[s] = true
		}
	}
	return out
}

// MissingNames returns the message when a required new-place name is absent.
func MissingNames(spot, body map[string]any) (string, bool) {
	needs := needsSet(spot)
	if needs["country"] && body["newCountry"] == nil {
		return "Your club opens a new country: name it", true
	}
	if needs["region"] && body["newRegion"] == nil {
		return "Your club opens a new region: name it", true
	}
	if needs["city"] && body["newTown"] == nil {
		return "Your club opens a new city: name it", true
	}
	return "", false
}

func toAnyList(v any) []any {
	list, ok := v.([]any)
	if !ok {
		return nil
	}
	return list
}

func subMap(m map[string]any, key string) map[string]any {
	s, _ := m[key].(map[string]any)
	return s
}

func (r *Repository) placeNameProblem(ctx context.Context, spot, body map[string]any, existing resolvedPlaces) (string, bool) {
	needs := needsSet(spot)
	countryID := ""
	if existing.country != nil {
		countryID = mstr(existing.country, "_id")
	}
	sameNameIn := func(name string) bool {
		if countryID == "" {
			return false
		}
		row, _, _ := r.one(ctx, `SELECT "_id" FROM "Places" WHERE "ParentId" = $1 AND lower("Name") = lower($2) LIMIT 1`, countryID, name)
		return row != nil
	}
	if needs["country"] {
		c := subMap(body, "newCountry")
		name := tidyName(mstr(c, "name"))
		code := strings.ToUpper(strings.TrimSpace(mstr(c, "code")))
		if p := nameProblem(name, "Country name", 3, 30); p != "" {
			return p, true
		}
		if p := codeProblem(code, "Country code"); p != "" {
			return p, true
		}
		row, _, _ := r.one(ctx, `SELECT "_id" FROM "Places" WHERE ("Type" = 'country' AND lower("Name") = lower($1)) OR "Code" = $2 LIMIT 1`, name, code)
		if row != nil {
			return "That country name or code is taken", true
		}
	}
	if needs["region"] {
		name := tidyName(mstr(subMap(body, "newRegion"), "name"))
		if p := nameProblem(name, "Region name", 3, 30); p != "" {
			return p, true
		}
		if sameNameIn(name) {
			return "There is already a place with that name in this country", true
		}
	}
	if needs["city"] {
		name := tidyName(mstr(subMap(body, "newTown"), "name"))
		if p := nameProblem(name, "City name", 3, 30); p != "" {
			return p, true
		}
		if sameNameIn(name) {
			return "There is already a place with that name in this country", true
		}
		if needs["region"] && strings.EqualFold(tidyName(mstr(subMap(body, "newRegion"), "name")), name) {
			return "The city and its region need different names", true
		}
	}
	return "", false
}

type openedPlaces struct {
	district, city, region, country map[string]any
	opened                          []string
}

func (r *Repository) openPlaces(ctx context.Context, spot, body map[string]any, userID string, existing resolvedPlaces) (openedPlaces, error) {
	now := time.Now()
	needs := needsSet(spot)
	out := openedPlaces{}

	out.country = existing.country
	if needs["country"] {
		c := subMap(body, "newCountry")
		name := tidyName(mstr(c, "name"))
		row, err := db.InsertRow(ctx, r.q, "Places", map[string]any{
			"Fullname": "Republic of " + name, "Name": name,
			"Code": strings.ToUpper(strings.TrimSpace(mstr(c, "code"))), "Region": "world", "Type": "country",
			"FoundedBy": userID, "MapX": int(mfloat(spot, "x")), "MapY": int(mfloat(spot, "y")),
			"Colors": c["colors"], "Motto": mottoOrNil(c["motto"]), "updatedAt": now,
		})
		if err != nil {
			return out, err
		}
		out.country = row
		out.opened = append(out.opened, "country")
	}
	if out.country == nil {
		return out, fmt.Errorf("Placement returned no country")
	}
	country := out.country

	out.region = existing.region
	if needs["region"] {
		name := tidyName(mstr(subMap(body, "newRegion"), "name"))
		code, err := r.uniquePlaceCode(ctx, countryCode(country)+"-R-"+strings.ToUpper(clubCodeStrip.ReplaceAllString(name, ""))[:min10(len(strings.ToUpper(clubCodeStrip.ReplaceAllString(name, ""))))])
		if err != nil {
			return out, err
		}
		row, err := db.InsertRow(ctx, r.q, "Places", map[string]any{
			"Fullname": name + ", " + mstr(country, "Name"), "Name": name, "Code": code,
			"Region": mstr(country, "Region"), "Type": "region", "ParentId": mstr(country, "_id"),
			"FoundedBy": userID, "MapX": int(mfloat(spot, "x")), "MapY": int(mfloat(spot, "y")),
			"CultureId": country["CultureId"], "updatedAt": now,
		})
		if err != nil {
			return out, err
		}
		out.region = row
		out.opened = append(out.opened, "region")
	}

	out.city = existing.city
	if needs["city"] {
		c := subMap(body, "newTown")
		name := tidyName(mstr(c, "name"))
		code, err := r.uniquePlaceCode(ctx, countryCode(country)+"-"+clip(strings.ToUpper(clubCodeStrip.ReplaceAllString(name, "")), 10))
		if err != nil {
			return out, err
		}
		var regionID any
		if out.region != nil {
			regionID = mstr(out.region, "_id")
		}
		row, err := db.InsertRow(ctx, r.q, "Places", map[string]any{
			"Fullname": name + ", " + mstr(country, "Name"), "Name": name, "Code": code,
			"Region": mstr(country, "Region"), "Type": "city", "ParentId": mstr(country, "_id"),
			"RegionId": regionID, "FoundedBy": userID, "MapX": int(mfloat(spot, "x")), "MapY": int(mfloat(spot, "y")),
			"Terrain": mstr(c, "terrain"), "CultureId": country["CultureId"], "updatedAt": now,
		})
		if err != nil {
			return out, err
		}
		out.city = row
		out.opened = append(out.opened, "town")
	}
	if out.city == nil {
		return out, fmt.Errorf("Placement returned no city")
	}

	out.district = existing.district
	if out.district == nil {
		row, _, err := r.one(ctx, `SELECT count(*)::int AS n FROM "Places" WHERE "Type" = 'district' AND "ParentId" = $1`, mstr(out.city, "_id"))
		if err != nil {
			return out, err
		}
		n := 0
		if row != nil {
			n = mint(row, "n")
		}
		name := regionNameFor(mstr(out.city, "Name"), n)
		code, err := r.uniquePlaceCode(ctx, mstr(out.city, "Code")+"-"+clip(strings.ToUpper(clubCodeStrip.ReplaceAllString(name, "")), 8))
		if err != nil {
			return out, err
		}
		var regionID any
		if mstr(out.city, "RegionId") != "" {
			regionID = mstr(out.city, "RegionId")
		} else if out.region != nil {
			regionID = mstr(out.region, "_id")
		}
		row2, err := db.InsertRow(ctx, r.q, "Places", map[string]any{
			"Fullname": name + ", " + mstr(out.city, "Name"), "Name": name, "Code": code,
			"Region": mstr(out.city, "Region"), "Type": "district", "ParentId": mstr(out.city, "_id"),
			"RegionId": regionID, "FoundedBy": userID, "MapX": int(mfloat(spot, "x")), "MapY": int(mfloat(spot, "y")),
			"Terrain": out.city["Terrain"], "CultureId": firstNonNil(out.city["CultureId"], country["CultureId"]), "updatedAt": now,
		})
		if err != nil {
			return out, err
		}
		out.district = row2
		if !containsStr(out.opened, "town") {
			out.opened = append(out.opened, "town")
		}
	}
	return out, nil
}

func countryCode(country map[string]any) string { return mstr(country, "Code") }

func clip(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n]
}

func min10(n int) int {
	if n < 10 {
		return n
	}
	return 10
}

func mottoOrNil(v any) any {
	if s, ok := v.(string); ok && strings.TrimSpace(s) != "" {
		return strings.TrimSpace(s)
	}
	return nil
}

func firstNonNil(a, b any) any {
	if a != nil {
		return a
	}
	return b
}

func containsStr(list []string, s string) bool {
	for _, v := range list {
		if v == s {
			return true
		}
	}
	return false
}

// FoundClub is POST /api/atlas/clubs.
func (r *Repository) FoundClub(ctx context.Context, userID string, body map[string]any) (map[string]any, error) {
	user, err := r.requireUser(ctx, userID)
	if err != nil {
		return nil, err
	}
	if os.Getenv("REQUIRE_VERIFIED_EMAIL") == "true" && !boolOf(user["isAdmin"]) && user["accountId"] == nil && user["EmailVerifiedAt"] == nil {
		return nil, FoundingError{"Confirm your email first - check your inbox for the link we sent.", 403}
	}
	owned, _, _ := r.one(ctx, `SELECT count(*)::int AS n FROM "Clubs" WHERE "UserId" = $1 AND "ReleasedAt" IS NULL`, userID)
	if !boolOf(user["isAdmin"]) && owned != nil && mint(owned, "n") >= foundingLimitsClubs {
		return nil, FoundingError{fmt.Sprintf("You can run %d clubs at most", foundingLimitsClubs), 403}
	}

	name := tidyName(mstr(body, "name"))
	code := strings.ToUpper(strings.TrimSpace(mstr(body, "code")))
	if p := nameProblem(name, "Club name", 3, 40); p != "" {
		return nil, FoundingError{p, 400}
	}
	if p := codeProblem(code, "Short code"); p != "" {
		return nil, FoundingError{p, 400}
	}
	if !isCrestDesign(body["crest"]) {
		return nil, FoundingError{"That crest is not valid", 400}
	}
	taken, _, err := r.one(ctx, `SELECT "_id" FROM "Clubs" WHERE lower("Name") = lower($1) OR "ClubCode" = $2 LIMIT 1`, name, code)
	if err != nil {
		return nil, err
	}
	if taken != nil {
		return nil, FoundingError{"That name or code is taken", 409}
	}
	crest := mapOf(body["crest"])
	if mstr(crest, "initials") == "" {
		crest = copyMap(crest)
		crest["initials"] = code
	}
	startingBalance := drawStartingBalance()

	var district, city, region, country map[string]any
	var opened []string
	var clubID string
	var inviteToken = mstr(body, "invite")

	err = db.WithTx(ctx, r.q, func(tx db.Querier) error {
		if _, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock($1)`, placementLockID); err != nil {
			return err
		}
		spot, err := clients.PlacementSpot(ctx, randomUUID(), inviteToken)
		if err != nil {
			return err
		}
		if msg, bad := MissingNames(spot, body); bad {
			return FoundingError{msg, 409}
		}
		sub := *r
		sub.q = tx
		existing, err := sub.resolvePlaces(ctx, spot)
		if err != nil {
			return err
		}
		if msg, bad := sub.placeNameProblem(ctx, spot, body, existing); bad {
			return FoundingError{msg, 409}
		}
		places, err := sub.openPlaces(ctx, spot, body, userID, existing)
		if err != nil {
			return err
		}
		district, city, region, country, opened = places.district, places.city, places.region, places.country, places.opened
		if mstr(spot, "invite") != "" && inviteToken != "" {
			if invite, _, _ := sub.one(ctx, `SELECT "_id" FROM "PlaceInvites" WHERE "Token" = $1 LIMIT 1`, inviteToken); invite != nil {
				if _, err := tx.Exec(ctx, `UPDATE "PlaceInvites" SET "Uses" = "Uses" + 1 WHERE "_id" = $1`, mstr(invite, "_id")); err != nil {
					return err
				}
			}
		}
		cityTerrain := mstr(city, "Terrain")
		row, err := db.InsertRow(ctx, tx, "Clubs", map[string]any{
			"Name": name, "ClubCode": code, "UserId": userID,
			"DistrictId": mstr(district, "_id"), "AddressCountryId": mstr(country, "_id"),
			"Address": map[string]any{"City": mstr(city, "Name"), "Section": ""},
			"Budget":  startingBalance, "CampusLayout": terrainOr(cityTerrain),
			"Crest": crest, "Stadium": map[string]any{"Name": stadiumNameOr(body, district), "Capacity": 1000},
			"Fans": startingFans, "Reputation": startingReputation, "BoardConfidence": 60,
			"LastActiveAt": time.Now(), "updatedAt": time.Now(),
		})
		if err != nil {
			return err
		}
		clubID = mstr(row, "_id")
		if _, err := db.InsertRow(ctx, tx, "OwnerProgram", map[string]any{
			"ClubId": clubID, "Step": "not_started", "StartingBalance": startingBalance, "updatedAt": time.Now(),
		}); err != nil {
			return err
		}
		return nil
	})
	if err != nil {
		var fe FoundingError
		if asFounding(err, &fe) {
			return nil, fe
		}
		if strings.Contains(err.Error(), "23505") {
			return nil, FoundingError{"That name or code is taken", 409}
		}
		return nil, err
	}

	// The starter club: squad, manager and its own map spot. Names come from
	// worldgen (a network call), so this runs after the placement lock is
	// released, in its own transaction.
	culture := mstr(district, "CultureId")
	if culture == "" {
		culture = firstNonEmptyStr(mstr(city, "CultureId"), mstr(country, "CultureId"))
	}
	if err := r.seedStarterClub(ctx, clubID, code, culture, district); err != nil {
		return nil, err
	}

	if len(opened) > 0 {
		_, _ = r.q.Exec(ctx, `WITH newest_country AS (
			SELECT "_id" AS id FROM "Places" WHERE "Type" = 'country' ORDER BY "createdAt" DESC, "_id" DESC LIMIT 1
		), newest_region AS (
			SELECT r."_id" AS id FROM "Places" r, newest_country nc WHERE r."Type"='region' AND r."ParentId"=nc.id ORDER BY r."createdAt" DESC, r."_id" DESC LIMIT 1
		), capital AS (
			SELECT ci."_id" AS id FROM "Places" ci, newest_country nc WHERE ci."Type"='city' AND ci."ParentId"=nc.id ORDER BY ci."createdAt" ASC, ci."_id" ASC LIMIT 1
		)
		UPDATE "Calendars" SET "FrontierCountryId"=(SELECT id FROM newest_country), "FrontierRegionId"=(SELECT id FROM newest_region), "FrontierCityId"=(SELECT id FROM capital)`)
	}

	_, _ = db.InsertRow(ctx, r.q, "ClubMessages", map[string]any{
		"ClubId": clubID, "Kind": "board", "Tone": "good", "Title": "Welcome to " + mstr(district, "Name"),
		"Body":      fmt.Sprintf("%s is official. The board drew you %s, a manager and %d academy players to start with. Collect your takings, build up the grounds, set your grid and go win some stars. Your Youth Academy sends up more players as it grows.", name, formatVilla(startingBalance), len(player.StarterSquadShape)),
		"updatedAt": time.Now(),
	})

	return map[string]any{
		"clubId": clubID, "code": code,
		"town":    map[string]any{"id": mstr(district, "_id"), "name": mstr(district, "Name")},
		"region":  regionObj(region),
		"country": map[string]any{"id": mstr(country, "_id"), "name": mstr(country, "Name")},
		"opened":  strList(opened),
		"pool":    nil,
	}, nil
}

// Starter club tuning: how far from its town's pin a founded club may sit
// (towns are at least townMinGap apart, so this keeps it inside its town).
const (
	clubSpotMinRadius = 5.0
	clubSpotMaxRadius = 14.0
)

// starterEconomy are the building primaries a founded club starts with at
// level 1: the Clubhouse, the Stadium (turnstiles), the Club Shop and the Club
// Vault. Absorbed assets follow via clubhouse.SyncLinked; migrations 0056/0057
// backfill older clubs.
var starterEconomy = []string{"clubhouse", "turnstiles", "club_shop", "cash_vault"}

func firstNonEmptyStr(vals ...string) string {
	for _, v := range vals {
		if v != "" {
			return v
		}
	}
	return ""
}

// seedStarterClub gives a newly founded club everything it needs to play its
// first match: a starter squad (player.StarterSquadShape) and an employed
// manager, all named by worldgen in the town's culture, plus its own map spot
// scattered around its town's pin. More players come from the Youth Academy.
func (r *Repository) seedStarterClub(ctx context.Context, clubID, code, culture string, district map[string]any) error {
	names := clients.PersonNames(ctx, len(player.StarterSquadShape)+1, culture)
	rng := rand.New(rand.NewSource(time.Now().UnixNano()))
	return db.WithTx(ctx, r.q, func(tx db.Querier) error {
		squad := make([]grid.SquadPlayer, 0, len(player.StarterSquadShape))
		for i, pos := range player.StarterSquadShape {
			p := player.GenerateStarter(pos, rng)
			field, counterID, err := freeCounterID(ctx, tx, "player", "Players")
			if err != nil {
				return err
			}
			p[field] = counterID
			p["FirstName"], p["LastName"] = names[i].First, names[i].Last
			p["isSigned"] = true
			p["ClubId"] = clubID
			p["ClubCode"] = code
			p["updatedAt"] = time.Now()
			row, err := db.InsertRow(ctx, tx, "Players", p)
			if err != nil {
				return err
			}
			squad = append(squad, grid.SquadPlayer{ID: mstr(row, "_id"), Position: grid.Position(pos), Rating: mfloat(p, "Rating")})
		}
		// The starter XI on the pitch grid, so the squad screen opens set up
		// and the club defends with a real shape from its first raid.
		if g, ok := grid.DefaultGrid(squad); ok {
			layouts := grid.NewPgRepository(tx)
			for _, slot := range []grid.LayoutSlot{grid.Home, grid.Match} {
				if err := layouts.SetLayout(ctx, clubID, slot, g); err != nil {
					return err
				}
			}
		}

		mgr := starterManager(rng)
		name := names[len(names)-1]
		field, key, err := freeCounterID(ctx, tx, "manager", "Managers")
		if err != nil {
			return err
		}
		mgr[field] = key
		mgr["FirstName"], mgr["LastName"] = name.First, name.Last
		mgr["ClubId"] = clubID
		mgr["updatedAt"] = time.Now()
		row, err := db.InsertRow(ctx, tx, "Managers", mgr)
		if err != nil {
			return err
		}

		var mapX, mapY any
		if district["MapX"] != nil && district["MapY"] != nil {
			a := rng.Float64() * 2 * math.Pi
			d := clubSpotMinRadius + rng.Float64()*(clubSpotMaxRadius-clubSpotMinRadius)
			mapX = mfloat(district, "MapX") + d*math.Cos(a)
			mapY = mfloat(district, "MapY") + d*math.Sin(a)
		}
		if _, err := tx.Exec(ctx, `UPDATE "Clubs" SET "ManagerId" = $2, "MapX" = $3, "MapY" = $4, "updatedAt" = now() WHERE "_id" = $1`,
			clubID, mstr(row, "_id"), mapX, mapY); err != nil {
			return err
		}
		// The starter economy: a working collector for each currency and its
		// vault, like CoC's first gold mine and storage.
		for _, asset := range starterEconomy {
			if _, err := tx.Exec(ctx, `INSERT INTO "ClubAssets" ("ClubId", "AssetType", "Level", "updatedAt")
				VALUES ($1, $2, 1, now())`, clubID, asset); err != nil {
				return err
			}
		}
		// The Stadium's and Vault's absorbed assets follow their primaries.
		if err := clubhouse.SyncLinked(ctx, tx, clubID); err != nil {
			return err
		}
		// Matchmaking pairs clubs by Rating, so a founded club needs one now.
		_, _, err = club.NewRepository(tx).CalculateAndUpdateClubRating(ctx, clubID)
		return err
	})
}

// freeCounterID reserves the next counter id for `model`, skipping ids already
// used in `table` (a sequence can lag rows created by imports or older paths).
func freeCounterID(ctx context.Context, tx db.Querier, model, table string) (string, string, error) {
	for tries := 0; tries < 1000; tries++ {
		field, id, err := player.NextCounterID(ctx, tx, model)
		if err != nil {
			return "", "", err
		}
		var used bool
		if err := tx.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM "`+table+`" WHERE "`+field+`" = $1)`, id).Scan(&used); err != nil {
			return "", "", err
		}
		if !used {
			return field, id, nil
		}
	}
	return "", "", fmt.Errorf("no free %s id", model)
}

// starterManager is a modest, employed manager on a long contract (names are
// set by the caller). Attributes are 45-65; Overall uses the hire weights
// (internal/program ManagerOverall).
func starterManager(rng *rand.Rand) map[string]any {
	attr := func() int { return 45 + rng.Intn(21) }
	tactics, motivation, development, discipline := attr(), attr(), attr(), attr()
	overall := int(math.Round(0.40*float64(tactics) + 0.20*float64(motivation) + 0.25*float64(development) + 0.15*float64(discipline)))
	return map[string]any{
		"Age": 38 + rng.Intn(20), "isEmployed": true, "NationalTeam": false,
		"PreferredFormation": []string{"433", "442", "4231", "352"}[rng.Intn(4)],
		"Tactics":            tactics, "Motivation": motivation, "Development": development, "Discipline": discipline,
		"Overall": overall, "Wage": 0, "SigningFee": 0, "ContractYears": 5, "Records": []any{},
	}
}

func asFounding(err error, out *FoundingError) bool {
	if fe, ok := err.(FoundingError); ok {
		*out = fe
		return true
	}
	return false
}

func terrainOr(t string) string {
	if t == "" {
		return "city"
	}
	return t
}

func stadiumNameOr(body, district map[string]any) string {
	if s := strings.TrimSpace(mstr(body, "stadiumName")); s != "" {
		return s
	}
	return mstr(district, "Name") + " Park"
}

func regionObj(p map[string]any) any {
	if p == nil {
		return nil
	}
	return map[string]any{"id": mstr(p, "_id"), "name": mstr(p, "Name")}
}

func strList(list []string) []any {
	out := make([]any, 0, len(list))
	for _, v := range list {
		out = append(out, v)
	}
	return out
}

func copyMap(m map[string]any) map[string]any {
	out := map[string]any{}
	for k, v := range m {
		out[k] = v
	}
	return out
}

func formatVilla(n float64) string {
	v := int64(n + 0.5)
	if v >= 1_000_000 {
		millions := float64(v) / 1_000_000
		s := fmt.Sprintf("%.1f", millions)
		s = strings.TrimSuffix(s, ".0")
		return "V" + s + "M"
	}
	return "V" + itoa(int(v))
}

func boolOf(v any) bool { b, _ := v.(bool); return b }
