package main

import (
	"context"
	"log/slog"
	"testing"
)

func TestNewLoggerLevels(t *testing.T) {
	tests := []struct {
		name  string
		level string
		want  slog.Level
	}{
		{name: "debug", level: "debug", want: slog.LevelDebug},
		{name: "info", level: "info", want: slog.LevelInfo},
		{name: "warn", level: "warn", want: slog.LevelWarn},
		{name: "error", level: "error", want: slog.LevelError},
		{name: "unknown falls back to info", level: "verbose", want: slog.LevelInfo},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			logger := newLogger(tt.level)
			ctx := context.Background()
			if !logger.Enabled(ctx, tt.want) {
				t.Fatalf("level %s: %s should be enabled", tt.level, tt.want)
			}
			if lower := tt.want - 1; logger.Enabled(ctx, lower) {
				t.Fatalf("level %s: %s (more verbose) should be disabled", tt.level, lower)
			}
		})
	}
}
