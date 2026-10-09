package player

import (
	"encoding/json"
	"math"
)

// Rating/value/wage math ported from utils/players.ts. The multiplier and
// factor tables are embedded verbatim (see rating_data.go).

type ratingData struct {
	AllMultipliers  map[string]map[string]float64 `json:"AllMultipliers"`
	Roles           map[string][]string           `json:"Roles"`
	RatingFactors   []float64                     `json:"ratingFactors"`
	PositionFactors []float64                     `json:"postitionFactors"`
	AgeFactors      []float64                     `json:"ageFactors"`
}

var factors ratingData

func init() {
	_ = json.Unmarshal([]byte(ratingDataJSON), &factors)
}

// CalculatePlayerRating mirrors calculatePlayerRating: a weighted sum of the
// role's attributes, capped at 99; an unrecognised position returns -10000.
func CalculatePlayerRating(attributes map[string]any, position, role string) float64 {
	switch position {
	case "ATT", "MID", "DEF", "GK":
		return calculateTotal(factors.AllMultipliers[role], attributes)
	default:
		return -10000
	}
}

func calculateTotal(multiplier map[string]float64, attributes map[string]any) float64 {
	if multiplier == nil {
		return 0
	}
	total := 0.0
	for key, raw := range attributes {
		weight, ok := multiplier[key]
		if !ok {
			continue
		}
		total += num(raw) * weight
	}
	if total > 99 {
		return 99
	}
	return total
}

// CalculatePlayerValue mirrors calculatePlayerValue. The Node version uses
// Math.random for outfield position multipliers, so its value is
// non-deterministic; this port uses the range midpoints (documented in
// NOTES.md) to stay deterministic.
func CalculatePlayerValue(position string, rating float64, age int) float64 {
	base := baseValue(int(math.Round(rating)))
	positionMultiplier := base * positionFactor(position) / 100
	ageMultiplier := base * ageFactor(position, age) / 100
	return math.Round(base + positionMultiplier + ageMultiplier)
}

// CalculatePlayerWage mirrors calculatePlayerWage (WAGE_RATIO = 0.15).
func CalculatePlayerWage(value float64) float64 { return math.Round(value * 0.15) }

func baseValue(rating int) float64 {
	if rating < 0 {
		rating = 0
	}
	if rating >= len(factors.RatingFactors) {
		rating = len(factors.RatingFactors) - 1
	}
	if rating < 0 {
		return 0
	}
	return factors.RatingFactors[rating]
}

func positionFactor(position string) float64 {
	index := -1
	switch position {
	case "GK":
		index = 0
	case "DEF":
		index = 6
	case "MID":
		index = 16
	case "ATT":
		index = 23
	}
	if index < 0 || index >= len(factors.PositionFactors) {
		return 0
	}
	return factors.PositionFactors[index]
}

func ageFactor(position string, age int) float64 {
	if position == "GK" {
		return -2
	}
	index := age + 1
	if index < 0 || index >= len(factors.AgeFactors) {
		return 0
	}
	return factors.AgeFactors[index]
}

// RolesForPosition returns the roles Node's Roles table lists for a position.
func RolesForPosition(position string) []string { return factors.Roles[position] }

func num(v any) float64 {
	switch n := v.(type) {
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
	case json.Number:
		f, _ := n.Float64()
		return f
	default:
		return 0
	}
}
