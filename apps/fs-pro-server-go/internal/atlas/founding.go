package atlas

import (
	"context"
	"fmt"
	"math/rand"
	"os"
	"regexp"
	"strings"
	"time"

	"fs-pro-server/internal/clients"
	"fs-pro-server/internal/db"
)

// Club/place founding, ported from club-founding.service.ts. The non-fatal
// side effects Node fires after the transaction (news post + free-agent
// restock) are not ported; they are wrapped in catch() there.

const (
	startingFans       = 150
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
		"Body":      fmt.Sprintf("%s is official, and the board drew you %s to build with. No manager, no squad, no league yet - that is your job now. Hire a manager, sign a legal XI, put up a building, then reach Level 1 and the game will find you a league.", name, formatVilla(startingBalance)),
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
