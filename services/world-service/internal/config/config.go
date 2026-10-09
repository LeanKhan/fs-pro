// Package config loads the world-service runtime configuration from the
// environment. Every value has a default so the service is startable with no
// variables set except DATABASE_URL, which is required because the service's
// whole job (placement, hierarchy, ranking, pyramid, tiles) reads Postgres.
package config

import (
	"fmt"
	"os"
	"strconv"
	"time"
)

// Defaults. Port 3006 is the next free slot after sim (5050 on the host
// network), worldgen (3004) and realtime (3005).
const (
	DefaultHost            = "127.0.0.1"
	DefaultPort            = "3006"
	DefaultLogLevel        = "info"
	DefaultDBTimeout       = 5 * time.Second
	DefaultShutdownTimeout = 10 * time.Second
)

// Env var names. WORLD_SERVICE_* are the service-specific names; PORT is the
// generic container convention and only used when WORLD_SERVICE_PORT is unset.
const (
	envHost            = "WORLD_SERVICE_HOST"
	envPort            = "WORLD_SERVICE_PORT"
	envGenericPort     = "PORT"
	envDatabaseURL     = "DATABASE_URL"
	envDBTimeout       = "WORLD_SERVICE_DB_TIMEOUT"
	envShutdownTimeout = "WORLD_SERVICE_SHUTDOWN_TIMEOUT"
	envLogLevel        = "LOG_LEVEL"
)

// Config is the fully-resolved runtime configuration. Load validates it, so a
// Config that was returned without error is always usable.
type Config struct {
	Host            string
	Port            string
	DatabaseURL     string
	DBTimeout       time.Duration
	ShutdownTimeout time.Duration
	LogLevel        string
}

// Addr is the net/http listen address.
func (c Config) Addr() string { return c.Host + ":" + c.Port }

// Load reads the process environment. It is the production entry point.
func Load() (Config, error) { return load(os.Getenv) }

// load exists so tests can inject an environment. It reads get("NAME") and
// returns "" for an unset name, matching os.Getenv.
func load(get func(string) string) (Config, error) {
	cfg := Config{
		Host:            envOr(get, envHost, DefaultHost),
		Port:            envOr(get, envPort, envOr(get, envGenericPort, DefaultPort)),
		DatabaseURL:     get(envDatabaseURL),
		LogLevel:        envOr(get, envLogLevel, DefaultLogLevel),
		DBTimeout:       DefaultDBTimeout,
		ShutdownTimeout: DefaultShutdownTimeout,
	}

	if v := get(envDBTimeout); v != "" {
		d, err := time.ParseDuration(v)
		if err != nil {
			return Config{}, fmt.Errorf("%s: %w", envDBTimeout, err)
		}
		cfg.DBTimeout = d
	}
	if v := get(envShutdownTimeout); v != "" {
		d, err := time.ParseDuration(v)
		if err != nil {
			return Config{}, fmt.Errorf("%s: %w", envShutdownTimeout, err)
		}
		cfg.ShutdownTimeout = d
	}

	if err := cfg.validate(); err != nil {
		return Config{}, err
	}
	return cfg, nil
}

func (c Config) validate() error {
	port, err := strconv.Atoi(c.Port)
	if err != nil || port < 1 || port > 65535 {
		return fmt.Errorf("%s/PORT must be a number in 1..65535, got %q", envPort, c.Port)
	}
	if c.DatabaseURL == "" {
		return fmt.Errorf("%s is required", envDatabaseURL)
	}
	if c.DBTimeout <= 0 {
		return fmt.Errorf("%s must be positive, got %s", envDBTimeout, c.DBTimeout)
	}
	if c.ShutdownTimeout <= 0 {
		return fmt.Errorf("%s must be positive, got %s", envShutdownTimeout, c.ShutdownTimeout)
	}
	switch c.LogLevel {
	case "debug", "info", "warn", "error":
	default:
		return fmt.Errorf("%s must be one of debug|info|warn|error, got %q", envLogLevel, c.LogLevel)
	}
	return nil
}

func envOr(get func(string) string, key, fallback string) string {
	if v := get(key); v != "" {
		return v
	}
	return fallback
}
