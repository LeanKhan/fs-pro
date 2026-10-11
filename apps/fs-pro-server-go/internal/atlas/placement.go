package atlas

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"fmt"
	"time"

	"fs-pro-server/internal/clients"
	"fs-pro-server/internal/db"
)

// Placement invites + preview, ported from placement.service.ts.

const (
	inviteDays      = 14
	inviteUses      = 5
	maxLiveInvites  = 5
	placementLockID = 0x46535050
)

// InviteError is a founding/invite error with a status.
type InviteError struct {
	Message string
	Status  int
}

func (e InviteError) Error() string { return e.Message }

func randomUUID() string {
	var b [16]byte
	_, _ = rand.Read(b[:])
	b[6] = (b[6] & 0x0f) | 0x40
	b[8] = (b[8] & 0x3f) | 0x80
	return fmt.Sprintf("%x-%x-%x-%x-%x", b[0:4], b[4:6], b[6:8], b[8:10], b[10:16])
}

func (r *Repository) placeByID(ctx context.Context, id string) (map[string]any, error) {
	if id == "" {
		return nil, nil
	}
	row, _, err := r.one(ctx, `SELECT * FROM "Places" WHERE "_id" = $1 LIMIT 1`, id)
	return row, err
}

type resolvedPlaces struct {
	district, city, region, country map[string]any
}

func (r *Repository) resolvePlaces(ctx context.Context, spot map[string]any) (resolvedPlaces, error) {
	var out resolvedPlaces
	var err error
	if out.district, err = r.placeByID(ctx, mstr(spot, "districtId")); err != nil {
		return out, err
	}
	cityID := mstr(spot, "cityId")
	if cityID == "" && out.district != nil {
		cityID = mstr(out.district, "ParentId")
	}
	if out.city, err = r.placeByID(ctx, cityID); err != nil {
		return out, err
	}
	regionID := mstr(spot, "regionId")
	if regionID == "" && out.city != nil {
		regionID = mstr(out.city, "RegionId")
	}
	if regionID == "" && out.district != nil {
		regionID = mstr(out.district, "RegionId")
	}
	if out.region, err = r.placeByID(ctx, regionID); err != nil {
		return out, err
	}
	countryID := mstr(spot, "countryId")
	if countryID == "" && out.city != nil {
		countryID = mstr(out.city, "ParentId")
	}
	if countryID == "" && out.region != nil {
		countryID = mstr(out.region, "ParentId")
	}
	if out.country, err = r.placeByID(ctx, countryID); err != nil {
		return out, err
	}
	return out, nil
}

func (r *Repository) districtClubCount(ctx context.Context, districtID string) int {
	row, _, err := r.one(ctx, `SELECT "Clubs" AS n FROM "PlaceStats" WHERE "PlaceId" = $1 LIMIT 1`, districtID)
	if err != nil || row == nil {
		return 0
	}
	return mint(row, "n")
}

type inviteCheck struct {
	Valid      bool
	Problem    any
	Invite     map[string]any
	PlaceName  string
	ByClubName string
}

func (r *Repository) checkInvite(ctx context.Context, token string) (inviteCheck, error) {
	row, ok, err := r.one(ctx, `SELECT i.*, p."Name" AS "placeName", c."Name" AS "byClubName"
		FROM "PlaceInvites" i
		JOIN "Places" p ON p."_id" = i."PlaceId"
		JOIN "Clubs" c ON c."_id" = i."ByClubId"
		WHERE i."Token" = $1 LIMIT 1`, token)
	if err != nil {
		return inviteCheck{}, err
	}
	if !ok {
		return inviteCheck{Valid: false, Problem: "That invite link is not valid"}, nil
	}
	check := inviteCheck{Invite: row, PlaceName: mstr(row, "placeName"), ByClubName: mstr(row, "byClubName")}
	expiresAt, _ := time.Parse("2006-01-02T15:04:05.000Z", mstr(row, "ExpiresAt"))
	if expiresAt.Before(time.Now()) {
		check.Problem = "That invite has expired"
		return check, nil
	}
	if mint(row, "Uses") >= mint(row, "MaxUses") {
		check.Problem = "That invite has been used up"
		return check, nil
	}
	check.Valid = true
	return check, nil
}

func colorsOf(p map[string]any) any {
	if p == nil || p["Colors"] == nil {
		return []any{"#8a5a3b", "#f2f2ee"}
	}
	return p["Colors"]
}

func countryOut(p map[string]any) any {
	if p == nil {
		return nil
	}
	return map[string]any{"id": mstr(p, "_id"), "name": mstr(p, "Name"), "code": mstr(p, "Code"), "colors": colorsOf(p)}
}

func regionOut(p map[string]any) any {
	if p == nil {
		return nil
	}
	return map[string]any{"id": mstr(p, "_id"), "name": mstr(p, "Name")}
}

// PreviewPlacement is GET /api/atlas/placement.
func (r *Repository) PreviewPlacement(ctx context.Context, invite string) (map[string]any, error) {
	spot, err := clients.PlacementSpot(ctx, randomUUID(), invite)
	if err != nil {
		return nil, err
	}
	resolved, err := r.resolvePlaces(ctx, spot)
	if err != nil {
		return nil, err
	}
	var inviteOut any
	if invite != "" {
		inv, err := r.checkInvite(ctx, invite)
		if err != nil {
			return nil, err
		}
		inviteOut = map[string]any{"valid": inv.Valid, "problem": inv.Problem, "townName": nullable(inv.PlaceName), "byClubName": nullable(inv.ByClubName)}
	}
	ro := regionOut(resolved.region)
	co := countryOut(resolved.country)
	x, y := mfloat(spot, "x"), mfloat(spot, "y")

	switch mstr(spot, "kind") {
	case "hole":
		d := resolved.district
		return map[string]any{
			"kind":   "town",
			"town":   map[string]any{"id": mstr(d, "_id"), "name": mstr(d, "Name"), "terrain": terrainOf(mstr(d, "Terrain")), "clubCount": r.districtClubCount(ctx, mstr(d, "_id"))},
			"region": ro, "country": co,
			"needs": map[string]any{"town": false, "region": false, "country": false},
			"x":     x, "y": y, "invite": inviteOut,
		}, nil
	case "district":
		name := "New district"
		terrain := "city"
		if resolved.city != nil {
			name = mstr(resolved.city, "Name") + " Central"
			terrain = terrainOf(mstr(resolved.city, "Terrain"))
		}
		return map[string]any{
			"kind":   "town",
			"town":   map[string]any{"id": "", "name": name, "terrain": terrain, "clubCount": 0},
			"region": ro, "country": co,
			"needs": map[string]any{"town": false, "region": false, "country": false},
			"x":     x, "y": y, "invite": inviteOut,
		}, nil
	case "city":
		return map[string]any{
			"kind": "new-town", "town": nil, "region": ro, "country": co,
			"needs": map[string]any{"town": true, "region": false, "country": false},
			"x":     x, "y": y, "invite": inviteOut,
		}, nil
	case "region":
		return map[string]any{
			"kind": "new-region", "town": nil, "region": nil, "country": co,
			"needs": map[string]any{"town": true, "region": true, "country": false},
			"x":     x, "y": y, "invite": inviteOut,
		}, nil
	default:
		return map[string]any{
			"kind": "new-country", "town": nil, "region": nil, "country": nil,
			"needs": map[string]any{"town": true, "region": true, "country": true},
			"x":     x, "y": y, "invite": inviteOut,
		}, nil
	}
}

// --- invites ---------------------------------------------------------------

func toInvite(row map[string]any, placeName string) map[string]any {
	usesLeft := mint(row, "MaxUses") - mint(row, "Uses")
	if usesLeft < 0 {
		usesLeft = 0
	}
	return map[string]any{
		"token": mstr(row, "Token"), "townId": mstr(row, "PlaceId"), "townName": placeName,
		"expiresAt": row["ExpiresAt"], "usesLeft": usesLeft,
	}
}

func (r *Repository) ownedClubPlace(ctx context.Context, userID, clubID string, isAdmin bool) (map[string]any, error) {
	if userID == "" {
		return nil, InviteError{"Not logged in", 403}
	}
	club, ok, err := r.one(ctx, `SELECT c."_id", c."UserId", c."DistrictId", p."Name" AS "placeName"
		FROM "Clubs" c LEFT JOIN "Places" p ON p."_id" = c."DistrictId" WHERE c."_id" = $1 LIMIT 1`, clubID)
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, InviteError{"Club not found", 404}
	}
	if mstr(club, "UserId") != userID && !isAdmin {
		return nil, InviteError{"Not your club", 403}
	}
	if mstr(club, "DistrictId") == "" || mstr(club, "placeName") == "" {
		return nil, InviteError{"That club has no district", 409}
	}
	return club, nil
}

// ListInvites is GET /api/atlas/invites.
func (r *Repository) ListInvites(ctx context.Context, userID, clubID string, isAdmin bool) ([]any, error) {
	club, err := r.ownedClubPlace(ctx, userID, clubID, isAdmin)
	if err != nil {
		return nil, err
	}
	rows, err := r.q.Query(ctx, `SELECT * FROM "PlaceInvites" WHERE "ByClubId" = $1 AND "ExpiresAt" > now() AND "Uses" < "MaxUses" ORDER BY "createdAt" DESC`, clubID)
	if err != nil {
		return nil, err
	}
	list, err := db.ScanAll(rows)
	if err != nil {
		return nil, err
	}
	out := make([]any, 0, len(list))
	for _, row := range list {
		out = append(out, toInvite(row, mstr(club, "placeName")))
	}
	return out, nil
}

// CreateInvite is POST /api/atlas/invites.
func (r *Repository) CreateInvite(ctx context.Context, userID, clubID string, isAdmin bool) (map[string]any, error) {
	club, err := r.ownedClubPlace(ctx, userID, clubID, isAdmin)
	if err != nil {
		return nil, err
	}
	n, _, err := r.one(ctx, `SELECT count(*)::int AS n FROM "PlaceInvites" WHERE "ByClubId" = $1 AND "ExpiresAt" > now() AND "Uses" < "MaxUses"`, clubID)
	if err != nil {
		return nil, err
	}
	if n != nil && mint(n, "n") >= maxLiveInvites {
		return nil, InviteError{fmt.Sprintf("You can have %d live invites at most", maxLiveInvites), 409}
	}
	var tokenBytes [12]byte
	_, _ = rand.Read(tokenBytes[:])
	token := base64.RawURLEncoding.EncodeToString(tokenBytes[:])
	row, err := db.InsertRow(ctx, r.q, "PlaceInvites", map[string]any{
		"Token": token, "PlaceId": mstr(club, "DistrictId"), "Level": "district", "ByClubId": clubID,
		"ExpiresAt": time.Now().Add(inviteDays * 24 * time.Hour), "MaxUses": inviteUses,
	})
	if err != nil {
		return nil, err
	}
	return toInvite(row, mstr(club, "placeName")), nil
}
