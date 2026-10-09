package season

import (
	"strconv"
	"strings"
)

func itoa(n int) string { return strconv.Itoa(n) }

func joinAnd(conditions []string) string { return strings.Join(conditions, " AND ") }
