package server

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"runtime"

	"fs-pro-sim-service/orchestrator"
)

// Request limits. A match request carries two full squads (~100 KB); the
// caps stop one client from exhausting memory or CPU.
const (
	maxMatchBodyBytes = 8 << 20
	maxBatchBodyBytes = 64 << 20
	maxBatchMatches   = 500
)

type Server struct {
	pool *orchestrator.Pool
	mux  *http.ServeMux
	// Browser origin allowed to call the service directly (SSE stream);
	// empty = no CORS headers. It's normally only called server-to-server.
	corsOrigin string
}

func NewServer(pool *orchestrator.Pool) *Server {
	s := &Server{
		pool:       pool,
		mux:        http.NewServeMux(),
		corsOrigin: os.Getenv("SIM_SERVICE_CORS_ORIGIN"),
	}
	s.registerRoutes()
	return s
}

func (s *Server) registerRoutes() {
	s.mux.HandleFunc("GET /health", s.handleHealth)
	s.mux.HandleFunc("GET /metrics", s.handleMetrics)
	s.mux.HandleFunc("POST /sim/match", s.handleSimulateMatch)
	s.mux.HandleFunc("POST /sim/batch", s.handleSimulateBatch)
	s.mux.HandleFunc("POST /sim/match/stream", s.handleStreamMatch)
}

func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if s.corsOrigin != "" {
		w.Header().Set("Access-Control-Allow-Origin", s.corsOrigin)
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusOK)
			return
		}
	}

	s.mux.ServeHTTP(w, r)
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	resp := map[string]interface{}{
		"status":      "ok",
		"service":     "fs-pro-sim-service",
		"engine":      "rust-sim-core",
		"concurrency": runtime.NumCPU(),
		"arch":        runtime.GOARCH,
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

func (s *Server) handleMetrics(w http.ResponseWriter, r *http.Request) {
	metrics := s.pool.GetMetrics()
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(metrics)
}

func (s *Server) handleSimulateMatch(w http.ResponseWriter, r *http.Request) {
	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, maxMatchBodyBytes))
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to read body: %v", err), http.StatusBadRequest)
		return
	}
	defer r.Body.Close()

	if len(body) == 0 {
		http.Error(w, "Request body is empty", http.StatusBadRequest)
		return
	}

	resBytes, err := s.pool.SimulateSingle(body)
	if err != nil {
		http.Error(w, fmt.Sprintf("Simulation failed: %v", err), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.Write(resBytes)
}

func (s *Server) handleSimulateBatch(w http.ResponseWriter, r *http.Request) {
	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, maxBatchBodyBytes))
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to read body: %v", err), http.StatusBadRequest)
		return
	}
	defer r.Body.Close()

	var reqList []json.RawMessage
	if err := json.Unmarshal(body, &reqList); err != nil {
		http.Error(w, fmt.Sprintf("Invalid batch payload: must be JSON array of match requests: %v", err), http.StatusBadRequest)
		return
	}

	if len(reqList) > maxBatchMatches {
		http.Error(w, fmt.Sprintf("Batch too large: %d matches (max %d)", len(reqList), maxBatchMatches), http.StatusRequestEntityTooLarge)
		return
	}

	payloads := make([][]byte, len(reqList))
	for i, item := range reqList {
		payloads[i] = []byte(item)
	}

	batchRes, err := s.pool.RunBatch(payloads)
	if err != nil {
		http.Error(w, fmt.Sprintf("Batch failed: %v", err), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(batchRes)
}

// handleStreamMatch streams match frames and events as Server-Sent Events (SSE).
func (s *Server) handleStreamMatch(w http.ResponseWriter, r *http.Request) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "Streaming unsupported by client", http.StatusBadRequest)
		return
	}

	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, maxMatchBodyBytes))
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to read body: %v", err), http.StatusBadRequest)
		return
	}
	defer r.Body.Close()

	resBytes, err := s.pool.SimulateSingle(body)
	if err != nil {
		http.Error(w, fmt.Sprintf("Simulation failed: %v", err), http.StatusInternalServerError)
		return
	}

	// Parse match details, frames, and events
	var matchOutput struct {
		OK        bool   `json:"ok"`
		FixtureID string `json:"fixtureId"`
		Match     struct {
			Details json.RawMessage   `json:"Details"`
			Events  []json.RawMessage `json:"Events"`
			// Packed replay frames: one object (crates/sim-core types.rs
			// PackedFrames / the server's realtime/packedFrames.ts).
			Frames json.RawMessage `json:"Frames"`
		} `json:"match"`
		Metrics json.RawMessage `json:"metrics"`
		Error   string          `json:"error"`
	}

	if err := json.Unmarshal(resBytes, &matchOutput); err != nil {
		http.Error(w, fmt.Sprintf("Failed to parse simulation output: %v", err), http.StatusInternalServerError)
		return
	}

	// Set SSE Headers
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")

	// Emit initial match started event
	fmt.Fprintf(w, "event: match_start\ndata: {\"fixtureId\":\"%s\"}\n\n", matchOutput.FixtureID)
	flusher.Flush()

	// The whole replay in its packed form (~160 KB); the client unpacks it.
	fmt.Fprintf(w, "event: frames\ndata: %s\n\n", string(matchOutput.Match.Frames))
	flusher.Flush()

	// Stream match events
	for _, evt := range matchOutput.Match.Events {
		fmt.Fprintf(w, "event: match_event\ndata: %s\n\n", string(evt))
		flusher.Flush()
	}

	// Final match end event
	fmt.Fprintf(w, "event: match_end\ndata: {\"details\":%s,\"metrics\":%s}\n\n",
		string(matchOutput.Match.Details), string(matchOutput.Metrics))
	flusher.Flush()
}
