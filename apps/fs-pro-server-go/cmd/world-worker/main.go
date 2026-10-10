// Command world-worker is the game's background daemon (docs/coc-mapping/05 §4):
// it owns every real-time ticker - builders first - and uses Postgres advisory
// locks so any number of instances can run side by side. Run it with
// `--dry-run` to list the registered tickers without touching the database.
package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"log/slog"
	nethttp "net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"fs-pro-server/internal/association"
	"fs-pro-server/internal/config"
	"fs-pro-server/internal/db"
	"fs-pro-server/internal/metrics"
	"fs-pro-server/internal/worldworker"
)

func main() {
	dryRun := flag.Bool("dry-run", false, "list the registered tickers and exit without touching the database")
	metricsAddr := flag.String("metrics-addr", "127.0.0.1:9091",
		"address for the Prometheus /metrics endpoint serving the worker's ticker metrics (\"off\" disables it)")
	flag.Parse()

	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))
	slog.SetDefault(logger)

	if *dryRun {
		reg := worldworker.NewRegistry(nil, logger)
		if err := registerTickers(reg); err != nil {
			logger.Error("invalid ticker registration", "err", err)
			os.Exit(2)
		}
		fmt.Println("world-worker dry run - registered tickers:")
		for _, t := range reg.Tickers() {
			fmt.Printf("  %-12s every %s (lock %#x)\n", t.ID, t.Interval, t.LockKey)
		}
		return
	}

	cfg, err := config.Load()
	if err != nil {
		logger.Error("invalid configuration", "err", err)
		os.Exit(2)
	}
	if cfg.DatabaseURL == "" {
		logger.Error("DATABASE_URL is required to run the world worker (use --dry-run to list tickers)")
		os.Exit(2)
	}

	rootCtx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	pool, err := db.New(rootCtx, cfg.DatabaseURL, cfg.DBTimeout, logger)
	if err != nil {
		logger.Error("failed to create database pool", "err", err)
		os.Exit(1)
	}
	defer pool.Close()

	reg := worldworker.NewRegistry(pool, logger)
	if err := registerTickers(reg); err != nil {
		logger.Error("invalid ticker registration", "err", err)
		os.Exit(2)
	}

	logger.Info("world-worker started", "tickers", len(reg.Tickers()))
	if addr := *metricsAddr; addr != "" && addr != "off" {
		go serveMetrics(rootCtx, addr, logger)
	}
	if err := reg.Run(rootCtx); err != nil && !errors.Is(err, context.Canceled) {
		logger.Error("world-worker stopped with error", "err", err)
		os.Exit(1)
	}
	logger.Info("world-worker stopped")
}

// serveMetrics exposes the process-wide metrics registry in Prometheus text
// format (docs/coc-mapping/05 §9) so the worker's ticker counters and latencies
// can be scraped. It is best-effort: a bind failure is logged and the worker
// keeps running.
func serveMetrics(ctx context.Context, addr string, logger *slog.Logger) {
	mux := nethttp.NewServeMux()
	mux.HandleFunc("/metrics", func(w nethttp.ResponseWriter, _ *nethttp.Request) {
		metrics.Default().WritePrometheus(w)
	})
	srv := &nethttp.Server{Addr: addr, Handler: mux, ReadHeaderTimeout: 5 * time.Second}
	go func() {
		<-ctx.Done()
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		defer cancel()
		_ = srv.Shutdown(shutdownCtx)
	}()
	logger.Info("world-worker metrics listening", "addr", addr, "path", "/metrics")
	if err := srv.ListenAndServe(); err != nil && !errors.Is(err, nethttp.ErrServerClosed) {
		logger.Warn("world-worker metrics endpoint stopped", "addr", addr, "err", err)
	}
}

// registerTickers adds every ticker this process owns. It is shared by the real
// run and the dry-run listing, so the listing can never drift from reality.
func registerTickers(reg *worldworker.Registry) error {
	if err := reg.Register(worldworker.BuildersTicker(nil)); err != nil {
		return err
	}
	if err := reg.Register(worldworker.DefenseResolutionTicker(nil, nil)); err != nil {
		return err
	}
	if err := reg.Register(worldworker.ShieldsTicker(nil)); err != nil {
		return err
	}
	if err := reg.Register(worldworker.LeagueRolloverTicker(nil)); err != nil {
		return err
	}
	// Derby prep->matchday->complete transitions (02 §G) run every minute.
	if err := reg.Register(worldworker.Ticker{
		ID:       "associations",
		Interval: time.Minute,
		LockKey:  worldworker.LockAssociation,
		Job:      association.AssociationTick(time.Now),
	}); err != nil {
		return err
	}
	return nil
}
