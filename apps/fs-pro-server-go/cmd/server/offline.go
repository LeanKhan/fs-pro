package main

import (
	"context"

	"fs-pro-server/internal/auth"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

// The offline stores let the server start and serve the non-database routes
// (health, welcome, meta, manifest) when DATABASE_URL is unset. Every
// database-backed handler returns a clean 400 instead of panicking.

// offlineQuerier is a db.Querier whose every call fails with ErrOffline. It is
// handed to the B2 repositories so their routes still register and answer 400.
type offlineQuerier struct{}

func (offlineQuerier) Query(context.Context, string, ...any) (pgx.Rows, error) {
	return nil, auth.ErrOffline
}
func (offlineQuerier) QueryRow(context.Context, string, ...any) pgx.Row {
	return offlineRow{}
}
func (offlineQuerier) Exec(context.Context, string, ...any) (pgconn.CommandTag, error) {
	return pgconn.CommandTag{}, auth.ErrOffline
}

type offlineRow struct{}

func (offlineRow) Scan(...any) error { return auth.ErrOffline }

type offlineUsers struct{}

func (offlineUsers) FindByID(context.Context, string) (map[string]any, error) {
	return nil, auth.ErrOffline
}
func (offlineUsers) FindByUsername(context.Context, string) (map[string]any, error) {
	return nil, auth.ErrOffline
}
func (offlineUsers) FindByEmail(context.Context, string) (map[string]any, error) {
	return nil, auth.ErrOffline
}
func (offlineUsers) Create(context.Context, map[string]any) (map[string]any, error) {
	return nil, auth.ErrOffline
}
func (offlineUsers) Update(context.Context, string, map[string]any) (map[string]any, error) {
	return nil, auth.ErrOffline
}

type offlineTokens struct{}

func (offlineTokens) Issue(context.Context, string, auth.TokenKind) (string, error) {
	return "", auth.ErrOffline
}
func (offlineTokens) Consume(context.Context, string, auth.TokenKind) (string, bool, error) {
	return "", false, auth.ErrOffline
}

type offlineClubs struct{}

func (offlineClubs) FindByUserID(context.Context, string) ([]map[string]any, error) {
	return nil, auth.ErrOffline
}
func (offlineClubs) Update(context.Context, string, map[string]any) (map[string]any, error) {
	return nil, auth.ErrOffline
}
func (offlineClubs) SetOwner(context.Context, string, string) (map[string]any, error) {
	return nil, auth.ErrOffline
}
