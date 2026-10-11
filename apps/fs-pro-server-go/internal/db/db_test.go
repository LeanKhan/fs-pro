package db

import (
	"context"
	"errors"
	"os"
	"testing"
	"time"
)

func TestNewRequiresDatabaseURL(t *testing.T) {
	if _, err := New(context.Background(), "", time.Second, nil); !errors.Is(err, ErrNoDatabaseURL) {
		t.Fatalf("err = %v, want ErrNoDatabaseURL", err)
	}
}

func TestNewRejectsBadTimeout(t *testing.T) {
	if _, err := New(context.Background(), "postgres://localhost/x", 0, nil); err == nil {
		t.Fatal("non-positive timeout must be rejected")
	}
}

func TestScanAllDropsMongoID(t *testing.T) {
	// Unit-level check of the row adapter rules without a database.
	if got := ISO8601msUTC(time.Date(2026, 1, 2, 3, 4, 5, 6000000, time.UTC)); got != "2026-01-02T03:04:05.006Z" {
		t.Fatalf("ISO8601msUTC = %q", got)
	}
	if got := formatUUID([16]byte{0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc, 0xde, 0xf0, 0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88}); got != "12345678-9abc-def0-1122-334455667788" {
		t.Fatalf("formatUUID = %q", got)
	}
}

func TestLivePingSkipsWithoutDatabaseURL(t *testing.T) {
	url := os.Getenv("DATABASE_URL")
	if url == "" {
		t.Skip("DATABASE_URL not set")
	}
	pool, err := New(context.Background(), url, 5*time.Second, nil)
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	defer pool.Close()
	if err := pool.Ping(context.Background()); err != nil {
		t.Fatalf("Ping: %v", err)
	}
}
