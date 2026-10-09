package db

// This file holds small helpers for the column-keyed map passthrough used by
// every repository read.

// StringField returns m[key] when it is a non-empty string.
func StringField(m map[string]any, key string) string {
	if m == nil {
		return ""
	}
	if s, ok := m[key].(string); ok {
		return s
	}
	return ""
}

// CollectIDs gathers the distinct non-empty string values of key across rows,
// preserving first-seen order.
func CollectIDs(rows []map[string]any, key string) []string {
	seen := map[string]bool{}
	out := make([]string, 0, len(rows))
	for _, m := range rows {
		id := StringField(m, key)
		if id == "" || seen[id] {
			continue
		}
		seen[id] = true
		out = append(out, id)
	}
	return out
}

// CopyMap returns a shallow copy of m.
func CopyMap(m map[string]any) map[string]any {
	out := make(map[string]any, len(m))
	for k, v := range m {
		out[k] = v
	}
	return out
}

// JSONArray coerces v to a []any, returning an empty slice when v is nil or
// not a JSON array.
func JSONArray(v any) []any {
	switch t := v.(type) {
	case []any:
		return t
	default:
		return []any{}
	}
}

// Omit deletes the named keys from a column-keyed row (used to drop columns the
// DB has but Node's Drizzle schema does not model).
func Omit(m map[string]any, keys ...string) {
	for _, k := range keys {
		delete(m, k)
	}
}

// OmitAll applies Omit to every row.
func OmitAll(rows []map[string]any, keys ...string) {
	for _, m := range rows {
		Omit(m, keys...)
	}
}
