package config

import (
	"testing"
	"time"
)

// envGet builds a getter over a map so tests never touch the real process
// environment.
func envGet(env map[string]string) func(string) string {
	return func(key string) string { return env[key] }
}

func TestLoad(t *testing.T) {
	base := map[string]string{"DATABASE_URL": "postgres://u:p@db:5432/fspro"}

	with := func(extra map[string]string) map[string]string {
		env := make(map[string]string, len(base)+len(extra))
		for k, v := range base {
			env[k] = v
		}
		for k, v := range extra {
			env[k] = v
		}
		return env
	}

	tests := []struct {
		name    string
		env     map[string]string
		want    Config
		wantErr bool
	}{
		{
			name: "defaults with required database url",
			env:  base,
			want: Config{
				Host:            DefaultHost,
				Port:            DefaultPort,
				DatabaseURL:     "postgres://u:p@db:5432/fspro",
				LogLevel:        DefaultLogLevel,
				DBTimeout:       DefaultDBTimeout,
				ShutdownTimeout: DefaultShutdownTimeout,
			},
		},
		{
			name: "service port overrides generic port",
			env:  with(map[string]string{"WORLD_SERVICE_PORT": "4000", "PORT": "9999"}),
			want: Config{
				Host:            DefaultHost,
				Port:            "4000",
				DatabaseURL:     base["DATABASE_URL"],
				LogLevel:        DefaultLogLevel,
				DBTimeout:       DefaultDBTimeout,
				ShutdownTimeout: DefaultShutdownTimeout,
			},
		},
		{
			name: "generic port used as fallback",
			env:  with(map[string]string{"PORT": "9999"}),
			want: Config{
				Host:            DefaultHost,
				Port:            "9999",
				DatabaseURL:     base["DATABASE_URL"],
				LogLevel:        DefaultLogLevel,
				DBTimeout:       DefaultDBTimeout,
				ShutdownTimeout: DefaultShutdownTimeout,
			},
		},
		{
			name: "host, log level and timeouts override",
			env: with(map[string]string{
				"WORLD_SERVICE_HOST":             "0.0.0.0",
				"LOG_LEVEL":                      "debug",
				"WORLD_SERVICE_DB_TIMEOUT":       "250ms",
				"WORLD_SERVICE_SHUTDOWN_TIMEOUT": "1m",
			}),
			want: Config{
				Host:            "0.0.0.0",
				Port:            DefaultPort,
				DatabaseURL:     base["DATABASE_URL"],
				LogLevel:        "debug",
				DBTimeout:       250 * time.Millisecond,
				ShutdownTimeout: time.Minute,
			},
		},
		{name: "missing database url", env: map[string]string{}, wantErr: true},
		{name: "non-numeric port", env: with(map[string]string{"WORLD_SERVICE_PORT": "abc"}), wantErr: true},
		{name: "port out of range", env: with(map[string]string{"WORLD_SERVICE_PORT": "70000"}), wantErr: true},
		{name: "port zero", env: with(map[string]string{"WORLD_SERVICE_PORT": "0"}), wantErr: true},
		{name: "bad db timeout", env: with(map[string]string{"WORLD_SERVICE_DB_TIMEOUT": "soon"}), wantErr: true},
		{name: "bad shutdown timeout", env: with(map[string]string{"WORLD_SERVICE_SHUTDOWN_TIMEOUT": "-1s"}), wantErr: true},
		{name: "bad log level", env: with(map[string]string{"LOG_LEVEL": "loud"}), wantErr: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := load(envGet(tt.env))
			if tt.wantErr {
				if err == nil {
					t.Fatalf("load() = %+v, want error", got)
				}
				return
			}
			if err != nil {
				t.Fatalf("load() unexpected error: %v", err)
			}
			if got != tt.want {
				t.Fatalf("load() = %+v, want %+v", got, tt.want)
			}
		})
	}
}

func TestAddr(t *testing.T) {
	cfg := Config{Host: "0.0.0.0", Port: "3006"}
	if got, want := cfg.Addr(), "0.0.0.0:3006"; got != want {
		t.Fatalf("Addr() = %q, want %q", got, want)
	}
}
