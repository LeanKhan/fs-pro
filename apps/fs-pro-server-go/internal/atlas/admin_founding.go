package atlas

import (
	"context"
	"fmt"
	"math"
	"strings"
	"time"

	"fs-pro-server/internal/db"
)

// Admin country/town founding, ported from atlas.service.ts.

func mapOf(v any) map[string]any {
	m, _ := v.(map[string]any)
	return m
}

func (r *Repository) countryNameTaken(ctx context.Context, name, code string) (bool, error) {
	var row map[string]any
	var err error
	if code != "" {
		row, _, err = r.one(ctx, `SELECT "_id" FROM "Places" WHERE ("Type" = 'country' AND lower("Name") = lower($1)) OR "Code" = $2 LIMIT 1`, name, code)
	} else {
		row, _, err = r.one(ctx, `SELECT "_id" FROM "Places" WHERE "Type" = 'country' AND lower("Name") = lower($1) LIMIT 1`, name)
	}
	return row != nil, err
}

func (r *Repository) townNameTaken(ctx context.Context, countryID, name string) (bool, error) {
	row, _, err := r.one(ctx, `SELECT "_id" FROM "Places" WHERE "ParentId" = $1 AND lower("Name") = lower($2) LIMIT 1`, countryID, name)
	return row != nil, err
}

// FoundCountry is POST /api/atlas/countries (admin exempt from the limit).
func (r *Repository) FoundCountry(ctx context.Context, userID string, body map[string]any) (map[string]any, error) {
	user, err := r.requireUser(ctx, userID)
	if err != nil {
		return nil, err
	}
	counts, err := r.foundedCounts(ctx, userID)
	if err != nil {
		return nil, err
	}
	if !boolOf(user["isAdmin"]) && mint(counts, "countries") >= foundingLimitsCountries {
		return nil, FoundingError{fmt.Sprintf("You can found %d country", foundingLimitsCountries), 403}
	}
	name := tidyName(mstr(body, "name"))
	code := strings.ToUpper(strings.TrimSpace(mstr(body, "code")))
	if p := nameProblem(name, "Country name", 3, 30); p != "" {
		return nil, FoundingError{p, 400}
	}
	if p := codeProblem(code, "Country code"); p != "" {
		return nil, FoundingError{p, 400}
	}
	if taken, err := r.countryNameTaken(ctx, name, code); err != nil {
		return nil, err
	} else if taken {
		return nil, FoundingError{"That name or code is taken", 409}
	}
	countries, _, _, err := r.loadPlaces(ctx)
	if err != nil {
		return nil, err
	}
	spot := point{math.Round(mfloat(body, "x")), math.Round(mfloat(body, "y"))}
	points := make([]point, 0, len(countries))
	for _, c := range countries {
		points = append(points, placePoint(c))
	}
	if where := countrySpotProblem(spot, points); where != "" {
		return nil, FoundingError{where, 409}
	}
	region := "world-east"
	if spot.x < atlasW/2 {
		region = "world-west"
	}
	row, err := db.InsertRow(ctx, r.q, "Places", map[string]any{
		"Fullname": "Republic of " + name, "Name": name, "Code": code, "Region": region, "Type": "country",
		"FoundedBy": userID, "MapX": int(spot.x), "MapY": int(spot.y),
		"Colors": body["colors"], "Motto": mottoOrNil(body["motto"]), "updatedAt": time.Now(),
	})
	if err != nil {
		return nil, err
	}
	return toCountry(row, foundersMap{userID: mstr(user, "FullName")}), nil
}

// FoundTown is POST /api/atlas/towns (admin exempt from the limit).
func (r *Repository) FoundTown(ctx context.Context, userID string, body map[string]any) (map[string]any, error) {
	user, err := r.requireUser(ctx, userID)
	if err != nil {
		return nil, err
	}
	counts, err := r.foundedCounts(ctx, userID)
	if err != nil {
		return nil, err
	}
	if !boolOf(user["isAdmin"]) && mint(counts, "towns") >= foundingLimitsTowns {
		return nil, FoundingError{fmt.Sprintf("You can found %d towns", foundingLimitsTowns), 403}
	}
	countries, regions, towns, err := r.loadPlaces(ctx)
	if err != nil {
		return nil, err
	}
	var country map[string]any
	for _, c := range countries {
		if mstr(c, "_id") == mstr(body, "countryId") {
			country = c
		}
	}
	if country == nil {
		return nil, FoundingError{"Country not found", 404}
	}
	name := tidyName(mstr(body, "name"))
	if p := nameProblem(name, "Town name", 3, 30); p != "" {
		return nil, FoundingError{p, 400}
	}
	if taken, err := r.townNameTaken(ctx, mstr(country, "_id"), name); err != nil {
		return nil, err
	} else if taken {
		return nil, FoundingError{"There is already a town with that name there", 409}
	}
	spot := point{math.Round(mfloat(body, "x")), math.Round(mfloat(body, "y"))}
	townPoints := make([]point, 0, len(towns))
	for _, t := range towns {
		townPoints = append(townPoints, placePoint(t))
	}
	otherCountryPoints := []point{}
	for _, c := range countries {
		if mstr(c, "_id") != mstr(country, "_id") {
			otherCountryPoints = append(otherCountryPoints, placePoint(c))
		}
	}
	if where := townSpotProblem(spot, placePoint(country), townPoints, otherCountryPoints); where != "" {
		return nil, FoundingError{where, 409}
	}
	base := mstr(country, "Code") + "-" + clip(strings.ToUpper(clubCodeStrip.ReplaceAllString(name, "")), 10)
	code, err := r.uniquePlaceCode(ctx, base)
	if err != nil {
		return nil, err
	}
	// Admin towns join the country's nearest region.
	var nearest map[string]any
	bestDistance := math.Inf(1)
	for _, region := range regions {
		if mstr(region, "ParentId") != mstr(country, "_id") {
			continue
		}
		d := dist(placePoint(region), spot)
		if d < bestDistance {
			bestDistance = d
			nearest = region
		}
	}
	var regionID any
	if nearest != nil {
		regionID = mstr(nearest, "_id")
	}
	row, err := db.InsertRow(ctx, r.q, "Places", map[string]any{
		"Fullname": name + ", " + mstr(country, "Name"), "Name": name, "Code": code,
		"Region": mstr(country, "Region"), "Type": "city", "ParentId": mstr(country, "_id"),
		"RegionId": regionID, "FoundedBy": userID, "MapX": int(spot.x), "MapY": int(spot.y),
		"Terrain": mstr(body, "terrain"), "updatedAt": time.Now(),
	})
	if err != nil {
		return nil, err
	}
	if _, err := db.InsertRow(ctx, r.q, "Places", map[string]any{
		"Fullname": name + " Central, " + name, "Name": name + " Central", "Code": code + "-D",
		"Region": mstr(country, "Region"), "Type": "district", "ParentId": mstr(row, "_id"),
		"RegionId": regionID, "FoundedBy": userID, "MapX": int(spot.x), "MapY": int(spot.y),
		"Terrain": mstr(body, "terrain"), "updatedAt": time.Now(),
	}); err != nil {
		return nil, err
	}
	return toTown(row, foundersMap{userID: mstr(user, "FullName")}, []any{}, 0), nil
}
