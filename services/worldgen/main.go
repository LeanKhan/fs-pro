// Command worldgen serves fs-pro's non-football generation utilities over
// HTTP - character names and faces today, news and similar content
// generators later. The game server calls it when it fills a roster, founds
// a club or draws an avatar; keeping generation behind a service (like
// sim-service) means the game server never depends on the generators' Go
// code directly.
package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"fs-pro-worldgen/server"
)

func main() {
	port := envOr("WORLDGEN_SERVICE_PORT", envOr("PORT", "3004"))
	// Loopback by default: the game server is the only intended caller.
	// Set WORLDGEN_SERVICE_HOST=0.0.0.0 to expose it (e.g. in a container).
	host := envOr("WORLDGEN_SERVICE_HOST", "127.0.0.1")

	httpServer := &http.Server{
		Addr:         host + ":" + port,
		Handler:      server.NewServer(),
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 60 * time.Second,
		IdleTimeout:  120 * time.Second,
	}

	go func() {
		log.Printf("[INFO] fs-pro worldgen listening on http://%s:%s", host, port)
		if err := httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("[FATAL] HTTP server failed: %v", err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("[INFO] Shutting down fs-pro worldgen...")
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := httpServer.Shutdown(ctx); err != nil {
		log.Printf("[ERROR] Server forced to shutdown: %v", err)
	}
	log.Println("[INFO] fs-pro worldgen exited cleanly.")
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
