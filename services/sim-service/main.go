package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"runtime"
	"syscall"
	"time"

	"fs-pro-sim-service/engine"
	"fs-pro-sim-service/orchestrator"
	"fs-pro-sim-service/server"
)

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = os.Getenv("SIM_SERVICE_PORT")
	}
	if port == "" {
		port = "5050"
	}
	// Loopback by default: the game server is the only intended caller.
	// Set SIM_SERVICE_HOST=0.0.0.0 to expose it (e.g. in a container).
	host := os.Getenv("SIM_SERVICE_HOST")
	if host == "" {
		host = "127.0.0.1"
	}

	dllPath := os.Getenv("SIM_CORE_DLL_PATH")
	if err := engine.InitEngine(dllPath); err != nil {
		log.Fatalf("[FATAL] Failed to initialize Rust sim-core engine: %v", err)
	}

	// Simulation is CPU-bound: one worker per core.
	workers := runtime.NumCPU()
	log.Printf("[INFO] Initialized FSPro Rust Simulation Core (%d worker threads, arch: %s/%s)",
		workers, runtime.GOOS, runtime.GOARCH)

	pool := orchestrator.NewPool(workers)
	srv := server.NewServer(pool)

	httpServer := &http.Server{
		Addr:         host + ":" + port,
		Handler:      srv,
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 60 * time.Second,
		IdleTimeout:  120 * time.Second,
	}

	go func() {
		log.Printf("[INFO] FSPro Go Simulation & Networking Service listening on http://%s:%s", host, port)
		if err := httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("[FATAL] HTTP server failed: %v", err)
		}
	}()

	// Graceful shutdown
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("[INFO] Shutting down FSPro Simulation Service...")
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := httpServer.Shutdown(ctx); err != nil {
		log.Printf("[ERROR] Server forced to shutdown: %v", err)
	}
	log.Println("[INFO] FSPro Simulation Service exited cleanly.")
}
