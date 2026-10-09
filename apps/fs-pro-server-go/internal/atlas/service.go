package atlas

import (
	"context"
	"math"

	"fs-pro-server/internal/db"
)

// Atlas reads, ported from services/world/atlas.service.ts.

func mstr(m map[string]any, key string) string { return db.StringField(m, key) }

func mfloat(m map[string]any, key string) float64 {
	switch n := m[key].(type) {
	case float64:
		return n
	case float32:
		return float64(n)
	case int:
		return float64(n)
	case int32:
		return float64(n)
	case int64:
		return float64(n)
	default:
		return 0
	}
}

func mint(m map[string]any, key string) int {
	if m[key] == nil {
		return 0
	}
	return int(mfloat(m, key))
}

func placePoint(p map[string]any) point { return point{mfloat(p, "MapX"), mfloat(p, "MapY")} }

type foundersMap map[string]string

func (r *Repository) loadFounders(ctx context.Context, ids []string) (foundersMap, error) {
	out := foundersMap{}
	if len(ids) == 0 {
		return out, nil
	}
	rows, err := r.q.Query(ctx, `SELECT "_id","FullName" FROM "Users" WHERE "_id" = ANY($1)`, ids)
	if err != nil {
		return nil, err
	}
	list, err := db.ScanAll(rows)
	if err != nil {
		return nil, err
	}
	for _, u := range list {
		out[mstr(u, "_id")] = mstr(u, "FullName")
	}
	return out, nil
}

func founderOf(p map[string]any, founders foundersMap) any {
	by := mstr(p, "FoundedBy")
	if by == "" {
		return nil
	}
	name := founders[by]
	if name == "" {
		name = "A manager"
	}
	return map[string]any{"userId": by, "name": name}
}

func foundedAtOf(p map[string]any) any {
	if mstr(p, "FoundedBy") == "" {
		return nil
	}
	if v := p["createdAt"]; v != nil {
		return v
	}
	return nil
}

func toCountry(p map[string]any, founders foundersMap) map[string]any {
	colors := p["Colors"]
	if colors == nil {
		colors = []any{"#8a5a3b", "#f2f2ee"}
	}
	return map[string]any{
		"id": mstr(p, "_id"), "name": mstr(p, "Name"), "code": mstr(p, "Code"),
		"region": mstr(p, "Region"), "colors": colors, "motto": p["Motto"],
		"x": mint(p, "MapX"), "y": mint(p, "MapY"),
		"founder": founderOf(p, founders), "foundedAt": foundedAtOf(p),
	}
}

func toRegion(p map[string]any, founders foundersMap) map[string]any {
	return map[string]any{
		"id": mstr(p, "_id"), "countryId": mstr(p, "ParentId"), "name": mstr(p, "Name"),
		"x": mint(p, "MapX"), "y": mint(p, "MapY"),
		"founder": founderOf(p, founders), "foundedAt": foundedAtOf(p),
	}
}

func toTown(p map[string]any, founders foundersMap, clubList []any, clubCount int) map[string]any {
	return map[string]any{
		"id": mstr(p, "_id"), "countryId": mstr(p, "ParentId"), "regionId": nullable(mstr(p, "RegionId")),
		"name": mstr(p, "Name"), "terrain": terrainOf(mstr(p, "Terrain")),
		"x": mint(p, "MapX"), "y": mint(p, "MapY"),
		"founder": founderOf(p, founders), "foundedAt": foundedAtOf(p),
		"clubCount": clubCount, "clubs": clubList,
	}
}

func nullable(s string) any {
	if s == "" {
		return nil
	}
	return s
}

func (r *Repository) loadPlaces(ctx context.Context) (countries, regions, towns []map[string]any, err error) {
	rows, err := r.q.Query(ctx, `SELECT * FROM "Places" WHERE "MapX" IS NOT NULL`)
	if err != nil {
		return nil, nil, nil, err
	}
	list, err := db.ScanAll(rows)
	if err != nil {
		return nil, nil, nil, err
	}
	for _, p := range list {
		switch mstr(p, "Type") {
		case "country":
			countries = append(countries, p)
		case "region":
			if mstr(p, "ParentId") != "" {
				regions = append(regions, p)
			}
		case "city":
			if mstr(p, "ParentId") != "" {
				towns = append(towns, p)
			}
		}
	}
	return countries, regions, towns, nil
}

func (r *Repository) foundedCounts(ctx context.Context, userID string) (map[string]any, error) {
	row, ok, err := r.one(ctx, `SELECT
		count(*) FILTER (WHERE "Type" = 'country')::int AS countries,
		count(*) FILTER (WHERE "Type" = 'city')::int AS towns
		FROM "Places" WHERE "FoundedBy" = $1`, userID)
	if err != nil {
		return nil, err
	}
	owned, _, err := r.one(ctx, `SELECT count(*)::int AS n FROM "Clubs" WHERE "UserId" = $1`, userID)
	if err != nil {
		return nil, err
	}
	countries, towns, clubs := 0, 0, 0
	if ok && row != nil {
		countries = mint(row, "countries")
		towns = mint(row, "towns")
	}
	if owned != nil {
		clubs = mint(owned, "n")
	}
	return map[string]any{"countries": countries, "towns": towns, "clubs": clubs}, nil
}

func (r *Repository) homeOf(ctx context.Context, userID string) (any, error) {
	row, ok, err := r.one(ctx, `SELECT c."_id" AS "clubId", p."_id" AS "districtId", p."ParentId" AS "cityId", p."MapX" AS x, p."MapY" AS y
		FROM "Clubs" c JOIN "Places" p ON p."_id" = c."DistrictId"
		WHERE c."UserId" = $1 AND c."ReleasedAt" IS NULL AND p."MapX" IS NOT NULL
		ORDER BY c."createdAt" LIMIT 1`, userID)
	if err != nil || row == nil {
		return nil, err
	}
	if !ok || mstr(row, "cityId") == "" || row["x"] == nil || row["y"] == nil {
		return nil, nil
	}
	city, _, err := r.one(ctx, `SELECT "ParentId" FROM "Places" WHERE "_id" = $1`, mstr(row, "cityId"))
	if err != nil {
		return nil, err
	}
	if city == nil || mstr(city, "ParentId") == "" {
		return nil, nil
	}
	return map[string]any{
		"clubId": mstr(row, "clubId"), "districtId": mstr(row, "districtId"), "cityId": mstr(row, "cityId"),
		"countryId": mstr(city, "ParentId"), "x": mint(row, "x"), "y": mint(row, "y"),
	}, nil
}

func (r *Repository) meBlock(ctx context.Context, userID string) (any, error) {
	mine, err := r.q.Query(ctx, `SELECT "_id" FROM "Clubs" WHERE "UserId" = $1 AND "ReleasedAt" IS NULL`, userID)
	if err != nil {
		return nil, err
	}
	rows, err := db.ScanAll(mine)
	if err != nil {
		return nil, err
	}
	ids := make([]any, 0, len(rows))
	for _, c := range rows {
		ids = append(ids, mstr(c, "_id"))
	}
	founded, err := r.foundedCounts(ctx, userID)
	if err != nil {
		return nil, err
	}
	home, err := r.homeOf(ctx, userID)
	if err != nil {
		return nil, err
	}
	return map[string]any{
		"userId": userID, "founded": founded,
		"limits":  map[string]any{"countries": foundingLimitsCountries, "towns": foundingLimitsTowns, "clubs": foundingLimitsClubs},
		"clubIds": ids, "home": home,
	}, nil
}

func (r *Repository) one(ctx context.Context, sql string, args ...any) (map[string]any, bool, error) {
	rows, err := r.q.Query(ctx, sql, args...)
	if err != nil {
		return nil, false, err
	}
	return db.ScanOne(rows)
}

// GetChrome is GET /api/atlas/chrome.
func (r *Repository) GetChrome(ctx context.Context, userID string) (map[string]any, error) {
	countries, _, _, err := r.loadPlaces(ctx)
	if err != nil {
		return nil, err
	}
	ids := founderIDs(countries)
	founders, err := r.loadFounders(ctx, ids)
	if err != nil {
		return nil, err
	}
	outCountries := make([]any, 0, len(countries))
	for _, p := range countries {
		outCountries = append(outCountries, toCountry(p, founders))
	}
	var me any
	if userID != "" {
		me, err = r.meBlock(ctx, userID)
		if err != nil {
			return nil, err
		}
	}
	return map[string]any{"countries": outCountries, "me": me}, nil
}

// Search is GET /api/atlas/search.
func (r *Repository) Search(ctx context.Context, q string) ([]any, error) {
	term := "%" + trimSpace(q) + "%"
	if len([]rune(trimSpace(q))) < 2 {
		return []any{}, nil
	}
	// Node's ELSE subquery correlates on the inner row (ci."_id" = ci."ParentId"),
	// so districts always resolve to a null countryId; mirror that.
	placeRows, err := r.q.Query(ctx, `SELECT p."_id" AS id, p."Name" AS name, p."Code" AS code, p."Type" AS type,
		CASE
		  WHEN p."Type" = 'country' THEN p."_id"::text
		  WHEN p."Type" IN ('region','city') THEN p."ParentId"::text
		  ELSE NULL
		END AS "countryId",
		p."MapX" AS x, p."MapY" AS y
		FROM "Places" p
		WHERE p."MapX" IS NOT NULL AND (p."Name" ILIKE $1 OR p."Code" ILIKE $1)
		ORDER BY length(p."Name") LIMIT 10`, term)
	if err != nil {
		return nil, err
	}
	places, err := db.ScanAll(placeRows)
	if err != nil {
		return nil, err
	}
	clubRows, err := r.q.Query(ctx, `SELECT c."_id" AS id, c."Name" AS name, c."ClubCode" AS code,
		(SELECT ci."ParentId"::text FROM "Places" d JOIN "Places" ci ON ci."_id" = d."ParentId" WHERE d."_id" = c."DistrictId") AS "countryId",
		p."MapX" AS x, p."MapY" AS y
		FROM "Clubs" c JOIN "Places" p ON p."_id" = c."DistrictId"
		WHERE c."ReleasedAt" IS NULL AND p."MapX" IS NOT NULL AND (c."Name" ILIKE $1 OR c."ClubCode" ILIKE $1)
		ORDER BY length(c."Name") LIMIT 10`, term)
	if err != nil {
		return nil, err
	}
	clubs, err := db.ScanAll(clubRows)
	if err != nil {
		return nil, err
	}
	out := []any{}
	for _, p := range places {
		typ := mstr(p, "type")
		if typ != "country" && typ != "region" && typ != "city" && typ != "district" {
			continue
		}
		if p["x"] == nil || p["y"] == nil {
			continue
		}
		out = append(out, map[string]any{
			"kind": typ, "id": mstr(p, "id"), "name": mstr(p, "name"), "code": mstr(p, "code"),
			"countryId": nullableAny(p["countryId"]), "x": mint(p, "x"), "y": mint(p, "y"),
		})
	}
	for _, c := range clubs {
		if c["x"] == nil || c["y"] == nil {
			continue
		}
		out = append(out, map[string]any{
			"kind": "club", "id": mstr(c, "id"), "name": mstr(c, "name"), "code": mstr(c, "code"),
			"countryId": nullableAny(c["countryId"]), "x": mint(c, "x"), "y": mint(c, "y"),
		})
	}
	return out, nil
}

func nullableAny(v any) any {
	if v == nil {
		return nil
	}
	if s, ok := v.(string); ok && s == "" {
		return nil
	}
	return v
}

func founderIDs(places []map[string]any) []string {
	seen := map[string]bool{}
	out := []string{}
	for _, p := range places {
		if by := mstr(p, "FoundedBy"); by != "" && !seen[by] {
			seen[by] = true
			out = append(out, by)
		}
	}
	return out
}

// GetAtlas is GET /api/atlas.
func (r *Repository) GetAtlas(ctx context.Context, userID, countryID string) (map[string]any, error) {
	countries, regions, towns, err := r.loadPlaces(ctx)
	if err != nil {
		return nil, err
	}
	countRows, err := r.q.Query(ctx, `SELECT p."ParentId" AS "cityId", count(*)::int AS n
		FROM "Clubs" c JOIN "Places" p ON p."_id" = c."DistrictId"
		WHERE c."DistrictId" IS NOT NULL AND c."ReleasedAt" IS NULL
		GROUP BY p."ParentId"`)
	if err != nil {
		return nil, err
	}
	countList, err := db.ScanAll(countRows)
	if err != nil {
		return nil, err
	}
	countOf := map[string]int{}
	total := 0
	for _, c := range countList {
		countOf[mstr(c, "cityId")] = mint(c, "n")
		total += mint(c, "n")
	}
	all := total <= fullAtlasClubs

	wanted := countryID
	if !all && wanted == "" && userID != "" {
		own, _, err := r.one(ctx, `SELECT "AddressCountryId" AS country FROM "Clubs" WHERE "UserId" = $1 AND "ReleasedAt" IS NULL LIMIT 1`, userID)
		if err != nil {
			return nil, err
		}
		if own != nil {
			wanted = mstr(own, "country")
		}
	}
	countryMatch := false
	for _, c := range countries {
		if mstr(c, "_id") == wanted {
			countryMatch = true
		}
	}
	listCountry := ""
	if !all && wanted != "" && countryMatch {
		listCountry = wanted
	}
	var listCityIDs []string
	if !all {
		if listCountry != "" {
			for _, t := range towns {
				if mstr(t, "ParentId") == listCountry {
					listCityIDs = append(listCityIDs, mstr(t, "_id"))
				}
			}
		} else {
			listCityIDs = []string{}
		}
	}

	var clubRows []map[string]any
	if all || len(listCityIDs) > 0 {
		sql := `SELECT c."_id" AS id, c."Name" AS name, c."ClubCode" AS code, c."Crest" AS crest,
			c."XP" AS xp, c."Elo" AS elo, c."Rating" AS rating, c."Fans" AS fans, c."UserId" AS "userId",
			p."ParentId" AS "cityId", u."FullName" AS "ownerName"
			FROM "Clubs" c
			LEFT JOIN "Users" u ON u."_id" = c."UserId"
			LEFT JOIN "Places" p ON p."_id" = c."DistrictId"
			WHERE c."ReleasedAt" IS NULL`
		var args []any
		if !all {
			args = append(args, listCityIDs)
			sql += ` AND p."ParentId" = ANY($1)`
		}
		rows, err := r.q.Query(ctx, sql, args...)
		if err != nil {
			return nil, err
		}
		clubRows, err = db.ScanAll(rows)
		if err != nil {
			return nil, err
		}
	}

	allPlaces := append(append([]map[string]any{}, countries...), regions...)
	allPlaces = append(allPlaces, towns...)
	founders, err := r.loadFounders(ctx, founderIDs(allPlaces))
	if err != nil {
		return nil, err
	}

	byTown := map[string][]any{}
	unplaced := []any{}
	cityIDs := map[string]bool{}
	for _, t := range towns {
		cityIDs[mstr(t, "_id")] = true
	}
	for _, c := range clubRows {
		club := map[string]any{
			"id": mstr(c, "id"), "name": mstr(c, "name"), "code": mstr(c, "code"),
			"crest": crestValue(c["crest"]), "xp": mint(c, "xp"),
			"elo": int(math.Round(mfloat(c, "elo"))), "rating": math.Round(mfloat(c, "rating")*10) / 10,
			"fans": mint(c, "fans"), "human": mstr(c, "userId") != "",
			"ownerName": ownerName(c), "founded": isCrestDesign(c["crest"]),
		}
		cityID := mstr(c, "cityId")
		if cityID != "" && cityIDs[cityID] {
			byTown[cityID] = append(byTown[cityID], club)
		} else {
			unplaced = append(unplaced, club)
		}
	}

	var me any
	if userID != "" {
		me, err = r.meBlock(ctx, userID)
		if err != nil {
			return nil, err
		}
	}

	points := make([]point, 0, len(allPlaces))
	for _, p := range allPlaces {
		points = append(points, placePoint(p))
	}
	w, h := atlasSize(points)
	if half := int(math.Round(float64(w) * 0.5625)); h < half {
		h = half
	}

	outCountries := make([]any, 0, len(countries))
	for _, p := range countries {
		outCountries = append(outCountries, toCountry(p, founders))
	}
	outRegions := make([]any, 0, len(regions))
	for _, p := range regions {
		outRegions = append(outRegions, toRegion(p, founders))
	}
	outTowns := make([]any, 0, len(towns))
	for _, p := range towns {
		clubs := byTown[mstr(p, "_id")]
		if clubs == nil {
			clubs = []any{}
		}
		outTowns = append(outTowns, toTown(p, founders, clubs, countOf[mstr(p, "_id")]))
	}
	var clubsLoaded any
	if all {
		clubsLoaded = "all"
	} else if listCountry != "" {
		clubsLoaded = map[string]any{"countryId": listCountry}
	}
	var unplacedOut []any
	if all {
		unplacedOut = unplaced
	} else {
		unplacedOut = []any{}
	}

	return map[string]any{
		"width": w, "height": h,
		"countries": outCountries, "regions": outRegions, "towns": outTowns,
		"clubsLoaded": clubsLoaded, "unplaced": unplacedOut, "me": me,
	}, nil
}

func crestValue(crest any) any {
	if isCrestDesign(crest) {
		return crest
	}
	return nil
}

func ownerName(c map[string]any) any {
	if mstr(c, "userId") == "" {
		return nil
	}
	if c["ownerName"] == nil {
		return nil
	}
	return c["ownerName"]
}

func trimSpace(s string) string {
	start, end := 0, len(s)
	for start < end && (s[start] == ' ' || s[start] == '\t' || s[start] == '\n' || s[start] == '\r') {
		start++
	}
	for end > start && (s[end-1] == ' ' || s[end-1] == '\t' || s[end-1] == '\n' || s[end-1] == '\r') {
		end--
	}
	return s[start:end]
}
