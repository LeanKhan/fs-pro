package play

import (
	"math"
	"sort"
	"strconv"

	"fs-pro-server/internal/db"
)

func floatOf(v any) float64 {
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
	default:
		return 0
	}
}

func intOf(v any) int {
	switch n := v.(type) {
	case int:
		return n
	case int32:
		return int(n)
	case int64:
		return int(n)
	case float64:
		return int(n)
	case float32:
		return int(n)
	default:
		return 0
	}
}

func str(m map[string]any, key string) string { return db.StringField(m, key) }

func itoa(n int) string { return strconv.Itoa(n) }

func boolOf(v any) bool { b, _ := v.(bool); return b }

// power mirrors play.service.ts's matchmaking power (rating x 2.5).
func power(rating float64) int { return int(math.Round(rating * 2.5)) }

// levelInfo mirrors levelForXp/xpForLevel over the world thresholds (ascending).
func levelInfo(thresholds []float64, xp float64) (level int, into float64, next float64) {
	ts := append([]float64{}, thresholds...)
	sort.Float64s(ts)
	level = 1
	for _, t := range ts {
		if xp >= t {
			level++
		}
	}
	base := xpForLevel(ts, level)
	upper := xpForLevel(ts, level+1)
	return level, xp - base, upper - base
}

func xpForLevel(ts []float64, level int) float64 {
	if level <= 1 || level-2 >= len(ts) || level-2 < 0 {
		return 0
	}
	return ts[level-2]
}
