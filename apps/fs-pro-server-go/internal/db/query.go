package db

import (
	"context"
	"fmt"
	"sort"
	"strings"
)

// InsertRow inserts data into table and returns the inserted row as a
// column-keyed map. Keys are SQL identifiers (doubled-quoted); values are passed
// as bind parameters, never interpolated. pgx encodes map values as jsonb where
// the column is jsonb.
func InsertRow(ctx context.Context, q Querier, table string, data map[string]any) (map[string]any, error) {
	if len(data) == 0 {
		return nil, fmt.Errorf("db: insert %s: empty data", table)
	}
	cols := sortedKeys(data)
	placeholders := make([]string, len(cols))
	args := make([]any, len(cols))
	quoted := make([]string, len(cols))
	for i, col := range cols {
		placeholders[i] = fmt.Sprintf("$%d", i+1)
		args[i] = data[col]
		quoted[i] = quoteIdent(col)
	}
	sql := fmt.Sprintf(`INSERT INTO %s (%s) VALUES (%s) RETURNING *`,
		quoteIdent(table), strings.Join(quoted, ", "), strings.Join(placeholders, ", "))
	rows, err := q.Query(ctx, sql, args...)
	if err != nil {
		return nil, err
	}
	m, ok, err := ScanOne(rows)
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, fmt.Errorf("db: insert %s returned no row", table)
	}
	return m, nil
}

// UpdateRow updates the row identified by idColumn=id. When addUpdatedAt is
// true, "updatedAt" is set to now() in the same statement, mirroring the Node
// repositories. Returns the updated row, or nil when no row matched.
func UpdateRow(ctx context.Context, q Querier, table, idColumn, id string, data map[string]any, addUpdatedAt bool) (map[string]any, error) {
	sets := make([]string, 0, len(data)+1)
	args := make([]any, 0, len(data)+2)
	n := 0
	for _, col := range sortedKeys(data) {
		n++
		sets = append(sets, fmt.Sprintf("%s = $%d", quoteIdent(col), n))
		args = append(args, data[col])
	}
	if addUpdatedAt {
		sets = append(sets, `"updatedAt" = now()`)
	}
	if len(sets) == 0 {
		return nil, fmt.Errorf("db: update %s: empty data", table)
	}
	n++
	args = append(args, id)
	sql := fmt.Sprintf(`UPDATE %s SET %s WHERE %s = $%d RETURNING *`,
		quoteIdent(table), strings.Join(sets, ", "), quoteIdent(idColumn), n)
	rows, err := q.Query(ctx, sql, args...)
	if err != nil {
		return nil, err
	}
	m, ok, err := ScanOne(rows)
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, nil
	}
	return m, nil
}

func sortedKeys(m map[string]any) []string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	return keys
}
