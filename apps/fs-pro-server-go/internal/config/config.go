// Package config loads the fs-pro-server HTTP backend configuration from the
// environment. Every value has a default so the process starts with only
// DATABASE_URL unset (health then reports the database as down), mirroring
// apps/fs-pro-server/src/server.ts.
package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"
)

// Defaults mirror the Node server. HOST defaults to loopback so `go run` does
// not trip the Windows firewall; set HOST=0.0.0.0 for container/production
// parity (the Node server binds 0.0.0.0 in production).
const (
	DefaultHost            = "127.0.0.1"
	DefaultPort            = "3000"
	DefaultLogLevel        = "info"
	DefaultSessionSecret   = "thisisasecret:)"
	DefaultDBTimeout       = 5 * time.Second
	DefaultShutdownTimeout = 10 * time.Second
	DefaultSessionMaxAge   = 30 * 24 * time.Hour
)

// Env var names.
const (
	envHost          = "HOST"
	envPort          = "PORT"
	envDatabaseURL   = "DATABASE_URL"
	envSessionSecret = "SESSION_SECRET"
	envLogLevel      = "LOG_LEVEL"
	envNodeEnv       = "NODE_ENV"
	envRemoteHost    = "REMOTE_HOST"
	envTrustProxy    = "TRUST_PROXY"
	envCookieSecure  = "COOKIE_SECURE"
	envCORSOrigins   = "CORS_ORIGINS"
	envRouteManifest = "ENABLE_ROUTE_MANIFEST"
	envRateLimit     = "RATE_LIMIT"
	envDBTimeout     = "DB_TIMEOUT"
	envShutdown      = "SHUTDOWN_TIMEOUT"
)

// Config is the fully-resolved runtime configuration. A Config returned
// without an error is always usable; only PORT and LOG_LEVEL are validated.
type Config struct {
	Host                string
	Port                string
	DatabaseURL         string
	SessionSecret       string
	LogLevel            string
	NodeEnv             string
	RemoteHost          string
	TrustProxy          string
	CookieSecure        bool
	CORSOrigins         []string
	EnableRouteManifest bool
	RateLimitOff        bool
	DBTimeout           time.Duration
	ShutdownTimeout     time.Duration
	SessionMaxAge       time.Duration

	// Warnings carries non-fatal configuration problems (e.g. the insecure
	// default SESSION_SECRET outside dev). The caller logs them.
	Warnings []string
}

// Addr is the net/http listen address (HOST:PORT).
func (c Config) Addr() string { return c.Host + ":" + c.Port }

// IsDev reports NODE_ENV=dev, matching the Node dev-only relaxations.
func (c Config) IsDev() bool { return strings.TrimSpace(c.NodeEnv) == "dev" }

// Load reads the process environment.
func Load() (Config, error) { return load(os.Getenv) }

func load(get func(string) string) (Config, error) {
	cfg := Config{
		Host:                envOr(get, envHost, DefaultHost),
		Port:                envOr(get, envPort, DefaultPort),
		DatabaseURL:         strings.TrimSpace(get(envDatabaseURL)),
		SessionSecret:       strings.TrimSpace(get(envSessionSecret)),
		LogLevel:            envOr(get, envLogLevel, DefaultLogLevel),
		NodeEnv:             strings.TrimSpace(get(envNodeEnv)),
		RemoteHost:          strings.TrimSpace(get(envRemoteHost)),
		TrustProxy:          strings.TrimSpace(get(envTrustProxy)),
		CookieSecure:        strings.TrimSpace(get(envCookieSecure)) == "true",
		CORSOrigins:         splitOrigins(get(envCORSOrigins)),
		EnableRouteManifest: strings.TrimSpace(get(envRouteManifest)) == "true",
		RateLimitOff:        strings.TrimSpace(get(envRateLimit)) == "off",
		DBTimeout:           DefaultDBTimeout,
		ShutdownTimeout:     DefaultShutdownTimeout,
		SessionMaxAge:       DefaultSessionMaxAge,
	}

	if cfg.SessionSecret == "" {
		cfg.SessionSecret = DefaultSessionSecret
		if cfg.NodeEnv != "dev" {
			cfg.Warnings = append(cfg.Warnings, "[server] SESSION_SECRET is not set - using the insecure development secret.")
		}
	}

	if v := get(envDBTimeout); v != "" {
		d, err := time.ParseDuration(v)
		if err != nil {
			return Config{}, fmt.Errorf("%s: %w", envDBTimeout, err)
		}
		cfg.DBTimeout = d
	}
	if v := get(envShutdown); v != "" {
		d, err := time.ParseDuration(v)
		if err != nil {
			return Config{}, fmt.Errorf("%s: %w", envShutdown, err)
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
		return fmt.Errorf("%s must be a number in 1..65535, got %q", envPort, c.Port)
	}
	switch c.LogLevel {
	case "debug", "info", "warn", "error":
	default:
		return fmt.Errorf("%s must be one of debug|info|warn|error, got %q", envLogLevel, c.LogLevel)
	}
	if c.DBTimeout <= 0 {
		return fmt.Errorf("%s must be positive, got %s", envDBTimeout, c.DBTimeout)
	}
	if c.ShutdownTimeout <= 0 {
		return fmt.Errorf("%s must be positive, got %s", envShutdown, c.ShutdownTimeout)
	}
	return nil
}

func envOr(get func(string) string, key, fallback string) string {
	if v := strings.TrimSpace(get(key)); v != "" {
		return v
	}
	return fallback
}

func splitOrigins(raw string) []string {
	if strings.TrimSpace(raw) == "" {
		return nil
	}
	out := make([]string, 0)
	for _, part := range strings.Split(raw, ",") {
		if o := strings.TrimRight(strings.TrimSpace(part), "/"); o != "" {
			out = append(out, o)
		}
	}
	return out
}
