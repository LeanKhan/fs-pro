package config

import "testing"

func env(pairs map[string]string) func(string) string {
	return func(key string) string { return pairs[key] }
}

func TestDefaults(t *testing.T) {
	cfg, err := load(env(map[string]string{"NODE_ENV": "dev"}))
	if err != nil {
		t.Fatalf("load: %v", err)
	}
	if cfg.Port != "3000" {
		t.Fatalf("port = %q, want 3000", cfg.Port)
	}
	if cfg.Host != DefaultHost {
		t.Fatalf("host = %q, want %q", cfg.Host, DefaultHost)
	}
	if cfg.Addr() != "127.0.0.1:3000" {
		t.Fatalf("addr = %q", cfg.Addr())
	}
	if cfg.DatabaseURL != "" {
		t.Fatalf("DATABASE_URL should be optional, got %q", cfg.DatabaseURL)
	}
	if cfg.SessionSecret != DefaultSessionSecret {
		t.Fatalf("session secret = %q", cfg.SessionSecret)
	}
	if cfg.IsDev() != true {
		t.Fatal("NODE_ENV=dev should be detected")
	}
}

func TestHostOverride(t *testing.T) {
	cfg, err := load(env(map[string]string{"HOST": "0.0.0.0", "PORT": "3100"}))
	if err != nil {
		t.Fatalf("load: %v", err)
	}
	if cfg.Host != "0.0.0.0" {
		t.Fatalf("host = %q, want 0.0.0.0", cfg.Host)
	}
	if cfg.Addr() != "0.0.0.0:3100" {
		t.Fatalf("addr = %q", cfg.Addr())
	}
}

func TestInvalidPortRejected(t *testing.T) {
	if _, err := load(env(map[string]string{"PORT": "not-a-port"})); err == nil {
		t.Fatal("invalid port must be rejected")
	}
	if _, err := load(env(map[string]string{"PORT": "70000"})); err == nil {
		t.Fatal("out-of-range port must be rejected")
	}
}

func TestInvalidLogLevelRejected(t *testing.T) {
	if _, err := load(env(map[string]string{"LOG_LEVEL": "verbose"})); err == nil {
		t.Fatal("invalid log level must be rejected")
	}
}

func TestMissingSessionSecretWarnsOutsideDev(t *testing.T) {
	cfg, err := load(env(map[string]string{"NODE_ENV": "production"}))
	if err != nil {
		t.Fatalf("load: %v", err)
	}
	if len(cfg.Warnings) == 0 {
		t.Fatal("expected a warning about the insecure default secret")
	}
	if cfg.SessionSecret != DefaultSessionSecret {
		t.Fatalf("fallback secret not applied: %q", cfg.SessionSecret)
	}
}

func TestCORSOriginsParsed(t *testing.T) {
	cfg, err := load(env(map[string]string{"CORS_ORIGINS": "https://a.example/, https://b.example"}))
	if err != nil {
		t.Fatal(err)
	}
	if len(cfg.CORSOrigins) != 2 || cfg.CORSOrigins[0] != "https://a.example" {
		t.Fatalf("origins = %v", cfg.CORSOrigins)
	}
}
