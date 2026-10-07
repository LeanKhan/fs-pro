// Command world-service is fs-pro's world service (D4): it owns placement, the
// place hierarchy queries, prominence ranking, pyramid pool assignment and map
// tiles. The Node game server calls it over HTTP; it holds its own pgx/v5 pool
// against the same Postgres.
//
// Batch 2 (placement, hierarchy, ranking, pyramid) and Batch 3 (tiles) fill in
// the internal packages; this command wires configuration, structured logging,
// the database pool, the HTTP server and graceful shutdown.
package main

import (
	"context"
	"errors"
	"log/slog"
	nethttp "net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"fs-pro-world-service/internal/config"
	"fs-pro-world-service/internal/db"
	worldhttp "fs-pro-world-service/internal/http"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		slog.Error("invalid configuration", "err", err)
		os.Exit(2)
	}

	logger := newLogger(cfg.LogLevel)
	slog.SetDefault(logger)

	// Signal-aware root context: SIGINT/SIGTERM cancels it and starts shutdown.
	rootCtx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	pool, err := db.New(rootCtx, cfg.DatabaseURL, cfg.DBTimeout, logger)
	if err != nil {
		logger.Error("failed to create database pool", "err", err)
		os.Exit(1)
	}
	defer pool.Close()

	srv := worldhttp.New(logger, pool)
	httpServer := &nethttp.Server{
		Addr:         cfg.Addr(),
		Handler:      srv,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 60 * time.Second,
		IdleTimeout:  120 * time.Second,
	}

	serverErr := make(chan error, 1)
	go func() {
		logger.Info("listening",
			"service", "fs-pro-world-service",
			"addr", cfg.Addr(),
			"version", worldhttp.Version,
		)
		if err := httpServer.ListenAndServe(); err != nil && !errors.Is(err, nethttp.ErrServerClosed) {
			serverErr <- err
		}
	}()

	select {
	case <-rootCtx.Done():
		logger.Info("shutdown signal received")
	case err := <-serverErr:
		logger.Error("http server failed", "err", err)
		os.Exit(1)
	}

	shutdownCtx, cancel := context.WithTimeout(context.Background(), cfg.ShutdownTimeout)
	defer cancel()
	if err := httpServer.Shutdown(shutdownCtx); err != nil {
		logger.Error("graceful shutdown failed", "err", err)
	}
	logger.Info("stopped")
}

// newLogger returns a structured JSON logger at the configured level. The game
// stack's services log JSON so container logs stay machine-parseable.
func newLogger(level string) *slog.Logger {
	var lvl slog.Level
	switch level {
	case "debug":
		lvl = slog.LevelDebug
	case "warn":
		lvl = slog.LevelWarn
	case "error":
		lvl = slog.LevelError
	default:
		lvl = slog.LevelInfo
	}
	return slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: lvl}))
}
