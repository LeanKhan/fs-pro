// Package server exposes fs-pro's world generator utilities over HTTP.
//
// "Worldgen" owns the non-football generation the game needs - character
// names and faces today, news and similar content generators later. Each
// capability gets its own route group here (POST /names/*, GET /faces/*);
// adding another is a new handler plus a route, not a new service. The game
// server is the only intended caller.
//
// Handlers are plain net/http so the same code is easy to exercise in tests.
package server

import (
	"encoding/json"
	"net/http"
	"os"

	"fs-pro-worldgen/faces"
	"fs-pro-worldgen/names"
)

// Request limit: callers ask for squad-sized batches, never unbounded lists.
const maxCount = 1000

type Server struct {
	mux *http.ServeMux
	// Browser origin allowed to call the service directly; empty = no CORS
	// headers. It is normally only called server-to-server.
	corsOrigin string
}

func NewServer() *Server {
	s := &Server{
		mux:        http.NewServeMux(),
		corsOrigin: os.Getenv("WORLDGEN_SERVICE_CORS_ORIGIN"),
	}
	s.registerRoutes()
	return s
}

func (s *Server) registerRoutes() {
	s.mux.HandleFunc("GET /health", s.handleHealth)
	s.mux.HandleFunc("POST /names/generate", s.handleGenerateNames)
	s.mux.HandleFunc("POST /names/family", s.handleFamilyNames)
	s.mux.HandleFunc("GET /faces/generate", s.handleGenerateFace)
}

func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if s.corsOrigin != "" {
		w.Header().Set("Access-Control-Allow-Origin", s.corsOrigin)
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusOK)
			return
		}
	}
	s.mux.ServeHTTP(w, r)
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"status":       "ok",
		"service":      "fs-pro-worldgen",
		"capabilities": []string{"names", "faces"},
		"cultures":     names.Cultures(),
		"versions":     faces.Versions(),
	})
}

// ---- names -----------------------------------------------------------

type generateNamesRequest struct {
	Count int `json:"count"`
	// ReturnParts is names.ReturnParts ("f_l", "f" or "l"); defaults to "f_l".
	ReturnParts string `json:"returnParts"`
	Culture     string `json:"culture"`
}

type familyNamesRequest struct {
	Count    int    `json:"count"`
	Lastname string `json:"lastname"`
	Culture  string `json:"culture"`
}

type namesResponse struct {
	Names []string `json:"names"`
}

func (s *Server) handleGenerateNames(w http.ResponseWriter, r *http.Request) {
	var req generateNamesRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	if req.ReturnParts == "" {
		req.ReturnParts = string(names.FirstAndLast)
	}
	if !validCount(w, req.Count) {
		return
	}

	result := make([]string, 0, req.Count)
	for i := 0; i < req.Count; i++ {
		name, err := names.GenerateName(names.ReturnParts(req.ReturnParts), req.Culture)
		if err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
		result = append(result, name)
	}
	writeJSON(w, http.StatusOK, namesResponse{Names: result})
}

func (s *Server) handleFamilyNames(w http.ResponseWriter, r *http.Request) {
	var req familyNamesRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	if req.Lastname == "" {
		writeError(w, http.StatusBadRequest, "lastname is required")
		return
	}
	if !validCount(w, req.Count) {
		return
	}

	result := make([]string, 0, req.Count)
	for i := 0; i < req.Count; i++ {
		firstname, err := names.GenerateName(names.FirstOnly, req.Culture)
		if err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
		result = append(result, firstname+"__"+req.Lastname)
	}
	writeJSON(w, http.StatusOK, namesResponse{Names: result})
}

// ---- faces -----------------------------------------------------------

// handleGenerateFace serves GET /faces/generate?identity=...&version=v3 and
// returns the face as an SVG document. It is a pure function of identity and
// version, so it's safe to cache (Cache-Control below) and safe to call
// repeatedly instead of persisting generated faces.
func (s *Server) handleGenerateFace(w http.ResponseWriter, r *http.Request) {
	identity := r.URL.Query().Get("identity")
	if identity == "" {
		writeError(w, http.StatusBadRequest, "identity query parameter is required")
		return
	}

	version := faces.Version(r.URL.Query().Get("version"))
	if version == "" {
		version = faces.DefaultVersion
	}
	if !faces.IsValidVersion(version) {
		writeError(w, http.StatusBadRequest, "unknown version")
		return
	}

	w.Header().Set("Content-Type", "image/svg+xml")
	w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
	w.Write([]byte(faces.GenerateSVG(identity, version)))
}

// ---- shared ----------------------------------------------------------

func validCount(w http.ResponseWriter, count int) bool {
	if count <= 0 || count > maxCount {
		writeError(w, http.StatusBadRequest, "count must be between 1 and 1000")
		return false
	}
	return true
}

func decodeJSON(w http.ResponseWriter, r *http.Request, dst any) bool {
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20)).Decode(dst); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return false
	}
	return true
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(body)
}

func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{"error": message})
}
