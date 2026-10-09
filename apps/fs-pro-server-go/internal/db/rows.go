package db

import (
	"encoding/hex"
	"math"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
)

// ISO8601msUTC formats a timestamp the way JSON.stringify(new Date()) does:
// millisecond precision, UTC, always three fractional digits.
func ISO8601msUTC(t time.Time) string { return t.UTC().Format("2006-01-02T15:04:05.000Z") }

// Columns returns the names of the current result set.
func Columns(rows pgx.Rows) []string {
	fds := rows.FieldDescriptions()
	out := make([]string, len(fds))
	for i, fd := range fds {
		out[i] = fd.Name
	}
	return out
}

// rowMap builds a column-keyed map, dropping `mongoId` (the migration-only
// column every Node repository drops) and normalizing values for JSON.
func rowMap(cols []string, values []any) map[string]any {
	out := make(map[string]any, len(cols))
	for i, col := range cols {
		if col == "mongoId" {
			continue
		}
		out[col] = normalizeValue(values[i])
	}
	return out
}

// ScanOne reads the single row in rows into a column-keyed map, dropping the
// migration-only `mongoId` column (the same drop every Node repository does).
// ok is false when there is no row.
func ScanOne(rows pgx.Rows) (m map[string]any, ok bool, err error) {
	defer rows.Close()
	if !rows.Next() {
		return nil, false, rows.Err()
	}
	values, err := rows.Values()
	if err != nil {
		return nil, false, err
	}
	return rowMap(Columns(rows), values), true, rows.Err()
}

// ScanAll reads every row in rows into column-keyed maps.
func ScanAll(rows pgx.Rows) ([]map[string]any, error) {
	defer rows.Close()
	cols := Columns(rows)
	out := make([]map[string]any, 0)
	for rows.Next() {
		values, err := rows.Values()
		if err != nil {
			return nil, err
		}
		out = append(out, rowMap(cols, values))
	}
	return out, rows.Err()
}

// normalizeValue converts pgx's decoded Go types into JSON-friendly values:
// every integer width becomes int64, timestamps become ISO-8601 strings, UUIDs
// become canonical strings, float32 keeps its short form, and NaN/Infinity
// become null (matching JSON.stringify). jsonb already decodes to
// map/slice/float64 and is normalised recursively.
func normalizeValue(v any) any {
	switch t := v.(type) {
	case nil:
		return nil
	case bool:
		return t
	case string:
		return t
	case time.Time:
		return ISO8601msUTC(t)
	case *time.Time:
		if t == nil {
			return nil
		}
		return ISO8601msUTC(*t)
	case [16]byte:
		return formatUUID(t)
	case *[16]byte:
		if t == nil {
			return nil
		}
		return formatUUID(*t)
	case int:
		return int64(t)
	case int8:
		return int64(t)
	case int16:
		return int64(t)
	case int32:
		return int64(t)
	case int64:
		return t
	case uint:
		return int64(t)
	case uint8:
		return int64(t)
	case uint16:
		return int64(t)
	case uint32:
		return int64(t)
	case uint64:
		return int64(t)
	case float32:
		return shortFloat32(t)
	case float64:
		if math.IsNaN(t) || math.IsInf(t, 0) {
			return nil
		}
		return t
	case []any:
		out := make([]any, len(t))
		for i, item := range t {
			out[i] = normalizeValue(item)
		}
		return out
	case []string:
		out := make([]any, len(t))
		for i, item := range t {
			out[i] = item
		}
		return out
	case map[string]any:
		out := make(map[string]any, len(t))
		for k, item := range t {
			out[k] = normalizeValue(item)
		}
		return out
	case pgtype.Numeric:
		return numericToFloat(t)
	case *pgtype.Numeric:
		if t == nil {
			return nil
		}
		return numericToFloat(*t)
	case pgtype.Int2:
		if !t.Valid {
			return nil
		}
		return int64(t.Int16)
	case pgtype.Int4:
		if !t.Valid {
			return nil
		}
		return int64(t.Int32)
	case pgtype.Int8:
		if !t.Valid {
			return nil
		}
		return t.Int64
	case pgtype.Float4:
		if !t.Valid {
			return nil
		}
		return shortFloat32(t.Float32)
	case pgtype.Float8:
		if !t.Valid {
			return nil
		}
		return normalizeValue(t.Float64)
	case pgtype.Bool:
		if !t.Valid {
			return nil
		}
		return t.Bool
	case pgtype.Timestamptz:
		if !t.Valid {
			return nil
		}
		return ISO8601msUTC(t.Time)
	case pgtype.Timestamp:
		if !t.Valid {
			return nil
		}
		return ISO8601msUTC(t.Time)
	case pgtype.Text:
		if !t.Valid {
			return nil
		}
		return t.String
	default:
		return v
	}
}

// shortFloat32 formats a float32 with the shortest string that round-trips at
// 32-bit precision, then parses it back to float64 - so encoding/json emits
// `36.77`, not `36.77000045776367` (Node's JSON.stringify behaviour).
func shortFloat32(f float32) any {
	fd := float64(f)
	if math.IsNaN(fd) || math.IsInf(fd, 0) {
		return nil
	}
	s := strconv.FormatFloat(fd, 'g', -1, 32)
	if parsed, err := strconv.ParseFloat(s, 64); err == nil {
		return parsed
	}
	return fd
}

func numericToFloat(n pgtype.Numeric) any {
	if !n.Valid {
		return nil
	}
	f, err := n.Float64Value()
	if err != nil || !f.Valid {
		return nil
	}
	return f.Float64
}

func formatUUID(b [16]byte) string {
	var buf [36]byte
	hex.Encode(buf[0:8], b[0:4])
	buf[8] = '-'
	hex.Encode(buf[9:13], b[4:6])
	buf[13] = '-'
	hex.Encode(buf[14:18], b[6:8])
	buf[18] = '-'
	hex.Encode(buf[19:23], b[8:10])
	buf[23] = '-'
	hex.Encode(buf[24:36], b[10:16])
	return string(buf[:])
}

// quoteIdent double-quotes a SQL identifier. Keys used here are authored in
// the server, never taken raw from a request outside a fixed allowlist.
func quoteIdent(name string) string {
	return `"` + strings.ReplaceAll(name, `"`, `""`) + `"`
}
