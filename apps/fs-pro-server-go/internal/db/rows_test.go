package db

import (
	"encoding/json"
	"math"
	"testing"
	"time"
)

func TestRowMapDropsMongoIDAndNormalizes(t *testing.T) {
	cols := []string{"_id", "mongoId", "createdAt", "AddressCountryId", "Wage"}
	values := []any{
		[16]byte{0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc, 0xde, 0xf0, 0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88},
		"migration-only",
		time.Date(2026, 1, 2, 3, 4, 5, 6_000_000, time.UTC),
		nil,
		1.5,
	}
	m := rowMap(cols, values)

	if _, ok := m["mongoId"]; ok {
		t.Fatal("mongoId must be dropped")
	}
	if m["_id"] != "12345678-9abc-def0-1122-334455667788" {
		t.Fatalf("uuid not formatted: %v", m["_id"])
	}
	if m["createdAt"] != "2026-01-02T03:04:05.006Z" {
		t.Fatalf("timestamp not formatted: %v", m["createdAt"])
	}
	if v, ok := m["AddressCountryId"]; !ok || v != nil {
		t.Fatalf("explicit null expected, got %v (present=%v)", v, ok)
	}
	if m["Wage"] != 1.5 {
		t.Fatalf("Wage = %v", m["Wage"])
	}
}

func TestRowMapTurnsNaNInfinityIntoNull(t *testing.T) {
	m := rowMap([]string{"A", "B", "C"}, []any{math.NaN(), math.Inf(1), math.Inf(-1)})
	for _, key := range []string{"A", "B", "C"} {
		if v, ok := m[key]; !ok || v != nil {
			t.Fatalf("%s = %v (present=%v), want null", key, v, ok)
		}
	}
}

// D15: Postgres int2/int4 decode to int16/int32; normalizeValue must widen them
// so every int helper sees a real number (not 0).
func TestRowMapNormalizesIntegerWidths(t *testing.T) {
	m := rowMap(
		[]string{"A", "B", "C", "D", "E"},
		[]any{int16(14), int32(496), int8(7), int64(3000000000), uint8(9)},
	)
	for key, want := range map[string]int64{"A": 14, "B": 496, "C": 7, "D": 3000000000, "E": 9} {
		got, ok := m[key].(int64)
		if !ok || got != want {
			t.Fatalf("%s = %v (%T), want int64 %d", key, m[key], m[key], want)
		}
	}
}

// D18: float32 (real) must keep its short representation.
func TestRowMapShortFloat32(t *testing.T) {
	m := rowMap([]string{"Wage"}, []any{float32(36.77)})
	got, ok := m["Wage"].(float64)
	if !ok {
		t.Fatalf("Wage type = %T", m["Wage"])
	}
	if got != 36.77 {
		t.Fatalf("Wage = %v, want 36.77", got)
	}
	raw, _ := json.Marshal(m)
	if string(raw) != `{"Wage":36.77}` {
		t.Fatalf("marshalled = %s", raw)
	}
}
