package player

import (
	"context"
	"math/rand"
	"os"
	"strconv"
	"strings"

	"fs-pro-server/internal/db"
)

// generateEnabled gates the local player generator (dev/admin only).
func generateEnabled() bool {
	return strings.EqualFold(strings.TrimSpace(os.Getenv("ENABLE_PLAYER_GENERATION")), "true")
}

// This is the Go equivalent of utils/players.ts's generatePlayer. The Node
// generatePlayers route shells out to a child process and youth intake calls
// the same generator; the Go port generates locally (documented in NOTES.md)
// because the exact child process isn't part of the HTTP contract.

var generatorAttributes = []string{
	"Speed", "Shooting", "LongPass", "ShortPass", "Mental", "Control",
	"Tackling", "Dribbling", "Setpiece", "Strength", "Stamina", "Vision",
	"ShotPower", "Aggression", "Interception", "Keeping", "Marking",
	"Agility", "Positioning", "Crossing", "LongShot",
}

var positions = []string{"ATT", "MID", "DEF", "GK"}

var youthFirstNames = []string{"Alex", "Sam", "Jordan", "Noah", "Liam", "Ethan", "Leo", "Mason", "Kai", "Owen", "Rui", "Nico"}
var youthLastNames = []string{"Academy", "Prospect", "Rookie", "Junior", "Grad"}

// GenerateYouth builds one youth prospect: age 16-18, low attributes (10-35)
// with position-specific attributes 30-45, isYouth=true. Mirrors
// player-lifecycle.service.ts's generateYouthPlayers ranges (worldgen names and
// nationality are not ported; documented in NOTES.md).
func GenerateYouth(position string, rng *rand.Rand) map[string]any {
	if position == "" {
		position = positions[rng.Intn(len(positions))]
	}
	roles := RolesForPosition(position)
	role := ""
	if len(roles) > 0 {
		role = roles[rng.Intn(len(roles))]
	}
	attrs := map[string]any{}
	for _, key := range generatorAttributes {
		attrs[key] = 10 + rng.Intn(26) // 10..35
	}
	attrs["PreferredFoot"] = []string{"left", "right"}[rng.Intn(2)]
	attrs["AttackingMindset"] = rng.Intn(2) == 0
	attrs["DefensiveMindset"] = rng.Intn(2) == 0
	for _, key := range positionAttributes[position] {
		attrs[key] = 30 + rng.Intn(16) // 30..45
	}
	age := 16 + rng.Intn(3) // 16..18
	rating := CalculatePlayerRating(attrs, position, role)
	value := CalculatePlayerValue(position, rating, age)
	return map[string]any{
		"FirstName":        youthFirstNames[rng.Intn(len(youthFirstNames))],
		"LastName":         youthLastNames[rng.Intn(len(youthLastNames))],
		"Age":              age,
		"Position":         position,
		"Role":             role,
		"Attributes":       attrs,
		"Rating":           rating,
		"Value":            value,
		"Wage":             CalculatePlayerWage(value),
		"isSigned":         false,
		"isReserve":        false,
		"isTransferListed": false,
		"isYouth":          true,
	}
}

// GeneratePlayer builds one random player for a position (empty = random) and
// culture. The returned map is ready to insert (Rating/Value/Wage computed).
func GeneratePlayer(position, culture string, rng *rand.Rand) map[string]any {
	if position == "" {
		position = positions[rng.Intn(len(positions))]
	}
	roles := RolesForPosition(position)
	role := ""
	if len(roles) > 0 {
		role = roles[rng.Intn(len(roles))]
	}
	attrs := map[string]any{}
	for _, key := range generatorAttributes {
		attrs[key] = 20 + rng.Intn(41) // 20..60
	}
	attrs["PreferredFoot"] = []string{"left", "right"}[rng.Intn(2)]
	attrs["AttackingMindset"] = rng.Intn(2) == 0
	attrs["DefensiveMindset"] = rng.Intn(2) == 0
	// Position-specific attributes are elevated to 64, like the Node generator.
	for _, key := range positionAttributes[position] {
		attrs[key] = 64
	}
	age := 18 + rng.Intn(13) // 18..30
	rating := CalculatePlayerRating(attrs, position, role)
	value := CalculatePlayerValue(position, rating, age)
	return map[string]any{
		"FirstName":        culture,
		"LastName":         "Youth",
		"Age":              age,
		"Position":         position,
		"Role":             role,
		"Attributes":       attrs,
		"Rating":           rating,
		"Value":            value,
		"Wage":             CalculatePlayerWage(value),
		"isSigned":         false,
		"isReserve":        false,
		"isTransferListed": false,
	}
}

var positionAttributes = map[string][]string{
	"ATT": {"Speed", "Shooting", "LongPass", "ShortPass", "Mental", "Control",
		"Setpiece", "Dribbling", "LongShot", "Positioning", "Agility",
		"Aggression", "Vision", "Crossing"},
	"GK": {"LongPass", "ShortPass", "Control", "Keeping", "Positioning", "Agility"},
	"MID": {"Speed", "Shooting", "Mental", "LongPass", "ShortPass", "Control",
		"Tackling", "Strength", "Stamina", "Dribbling", "LongShot", "Marking",
		"Crossing", "Agility", "Vision"},
	"DEF": {"Speed", "Shooting", "Mental", "LongPass", "ShortPass", "Control",
		"Tackling", "Strength", "Stamina", "Marking", "Crossing", "LongShot",
		"Interception", "Aggression"},
}

// counterPrefixes / counterIDFields mirror utils/counter.ts.
var counterPrefixes = map[string]string{"season": "S-", "player": "P", "manager": "MG-", "competition": "C"}
var counterIDFields = map[string]string{"player": "PlayerID", "competition": "CompetitionID", "season": "SeasonID", "manager": "Key"}

// NextCounterID reserves the next id for a model off its Postgres sequence,
// mirroring getNextCounterId.
func NextCounterID(ctx context.Context, q db.Querier, model string) (field, id string, err error) {
	var value int64
	if err := q.QueryRow(ctx, `SELECT nextval($1::regclass)`, model+"_counter_seq").Scan(&value); err != nil {
		return "", "", err
	}
	prefix := counterPrefixes[model]
	if prefix == "" {
		prefix = counterPrefixes["player"]
	}
	field = counterIDFields[model]
	if field == "" {
		field = "PlayerID"
	}
	number := strconv.FormatInt(1000000+value, 10)
	return field, prefix + number[1:], nil
}
