package place

import (
	"strconv"
	"strings"
)

func itoa(n int) string { return strconv.Itoa(n) }

func joinAnd(conditions []string) string { return strings.Join(conditions, " AND ") }

// stringOrEmpty dereferences a nullable string.
func stringOrEmpty(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}
