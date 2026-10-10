// Command fs-pro-server is the Go port of the fs-pro-server HTTP backend. B0
// serves health/welcome/meta plus a dev-only route manifest; B1 adds the full
// users/auth surface, express-session-compatible sessions and the route-policy
// guard. It runs beside the Node server on PORT (default 3000).
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

	"fs-pro-server/internal/abilities"
	"fs-pro-server/internal/atlas"
	"fs-pro-server/internal/auth"
	"fs-pro-server/internal/award"
	"fs-pro-server/internal/calendar"
	"fs-pro-server/internal/campus"
	"fs-pro-server/internal/clients"
	"fs-pro-server/internal/club"
	"fs-pro-server/internal/config"
	"fs-pro-server/internal/db"
	"fs-pro-server/internal/facilities"
	"fs-pro-server/internal/fixture"
	"fs-pro-server/internal/game"
	"fs-pro-server/internal/grid"
	"fs-pro-server/internal/httpapi"
	"fs-pro-server/internal/mail"
	"fs-pro-server/internal/manager"
	"fs-pro-server/internal/meta"
	"fs-pro-server/internal/openplay"
	"fs-pro-server/internal/place"
	"fs-pro-server/internal/play"
	"fs-pro-server/internal/player"
	"fs-pro-server/internal/policy"
	"fs-pro-server/internal/program"
	"fs-pro-server/internal/season"
	"fs-pro-server/internal/session"
	"fs-pro-server/internal/tile"
	"fs-pro-server/internal/transfer"
	"fs-pro-server/internal/user"
	"fs-pro-server/internal/world"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		slog.Error("invalid configuration", "err", err)
		os.Exit(2)
	}

	logger := newLogger(cfg.LogLevel)
	slog.SetDefault(logger)
	for _, warning := range cfg.Warnings {
		logger.Warn(warning)
	}

	rootCtx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	// The server starts without DATABASE_URL; health then reports the database
	// as down and database-backed routes fail cleanly.
	var (
		pinger func(context.Context) error
		pool   *db.Pool
	)
	if cfg.DatabaseURL != "" {
		pool, err = db.New(rootCtx, cfg.DatabaseURL, cfg.DBTimeout, logger)
		if err != nil {
			logger.Error("failed to create database pool", "err", err)
			os.Exit(1)
		}
		defer pool.Close()
		pinger = pool.Ping
	} else {
		logger.Warn("DATABASE_URL is not set - database-backed routes will fail")
	}

	// querier is the pool, or an always-erroring stand-in so the B2
	// repositories can still be built and their routes registered.
	var querier db.Querier = offlineQuerier{}
	if pool != nil {
		querier = pool
	}

	var sessionStore session.Store
	if pool != nil {
		sessionStore = session.NewPgStore(querier)
	}
	sessionManager := session.NewManager(sessionStore, cfg.SessionSecret, cfg.CookieSecure, cfg.SessionMaxAge)

	var (
		users  auth.UserStore  = offlineUsers{}
		clubs  auth.ClubStore  = offlineClubs{}
		tokens auth.TokenStore = offlineTokens{}
		access policy.Access
	)
	if pool != nil {
		users = auth.NewPgUserStore(querier)
		clubs = auth.NewPgClubStore(querier)
		tokens = auth.NewPgTokenStore(querier)
		access = auth.NewPgAccess(querier)
	}

	clubRepo := club.NewRepository(querier)
	playerRepo := player.NewRepository(querier)
	managerRepo := manager.NewRepository(querier)
	fixtureRepo := fixture.NewRepository(querier)
	seasonRepo := season.NewRepository(querier)
	awardRepo := award.NewRepository(querier)
	placeRepo := place.NewRepository(querier)
	calendarRepo := calendar.NewRepository(querier)
	facilitiesRepo := facilities.NewRepository(querier)
	playRepo := play.NewRepository(querier)
	worldService := place.NewWorldService(placeRepo, clients.NewWorldClient(os.Getenv("IMAGINATION_API_URL")))

	srv := httpapi.New(httpapi.Deps{
		Config:  cfg,
		Logger:  logger,
		Session: sessionManager,
		Access:  access,
		Pinger:  pinger,
	})
	meta.Register(srv)
	user.Register(srv, user.New(user.Deps{
		Users:    users,
		Clubs:    clubs,
		Tokens:   tokens,
		Sessions: sessionManager,
		Mail:     mail.New(logger),
		Logger:   logger,
	}))
	club.Register(srv, club.New(clubRepo, playerRepo, managerRepo, logger))
	player.Register(srv, player.New(playerRepo, logger))
	manager.Register(srv, manager.New(managerRepo, clubRepo))
	fixture.Register(srv, fixture.New(fixtureRepo))
	season.Register(srv, season.New(seasonRepo, fixtureRepo))
	award.Register(srv, award.New(awardRepo, playerRepo, managerRepo, clubRepo, seasonRepo))
	place.Register(srv, place.New(placeRepo, worldService))
	calendar.Register(srv, calendar.New(calendarRepo))
	facilities.Register(srv, facilities.New(facilitiesRepo))
	campus.Register(srv, campus.New(campus.NewRepository(querier)))
	abilities.Register(srv, abilities.New(abilities.NewRepository(querier)))
	grid.Register(srv, grid.New(
		grid.NewService(grid.NewPgRepository(querier)),
		grid.NewPgClubReader(querier),
		grid.NewPgOwnership(querier),
	))
	play.Register(srv, play.New(playRepo))
	game.Register(srv, game.New(fixtureRepo))
	program.Register(srv, program.New(program.NewRepository(querier)))
	transfer.Register(srv, transfer.New(transfer.NewRepository(querier)))
	openplay.Register(srv, openplay.New(openplay.NewRepository(querier)))
	world.Register(srv, world.New(world.NewRepository(querier)))
	atlas.Register(srv, atlas.New(atlas.NewRepository(querier)))
	tile.Register(srv, tile.New(os.Getenv("WORLD_SERVICE_URL")))

	httpServer := &nethttp.Server{
		Addr:         cfg.Addr(),
		Handler:      srv.Handler(),
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 60 * time.Second,
		IdleTimeout:  120 * time.Second,
	}

	serverErr := make(chan error, 1)
	go func() {
		logger.Info("listening", "service", "fs-pro-server", "addr", cfg.Addr())
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

// newLogger returns the JSON logger the rest of the game stack uses.
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
