package httpapi

import (
	"encoding/json"
	"net/http"
	"time"
)

// ISO8601msUTC formats a timestamp like JSON.stringify(new Date()).
func ISO8601msUTC(t time.Time) string { return t.UTC().Format("2006-01-02T15:04:05.000Z") }

// writeJSON encodes v with HTML escaping disabled. Node's JSON.stringify does
// not escape <, > or &, whereas Go's default json encoder does; every JSON
// response in this package goes through here.
func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	enc := json.NewEncoder(w)
	enc.SetEscapeHTML(false)
	_ = enc.Encode(v)
}

// WriteJSON is the exported encoder for raw (non-envelope) JSON responses.
func WriteJSON(w http.ResponseWriter, status int, v any) { writeJSON(w, status, v) }

// Respond writes a handler's Response.
func Respond(w http.ResponseWriter, resp Response) {
	writeJSON(w, resp.Status, resp.Body)
}

// WriteText writes a plain text/HTML body (the welcome page).
func WriteText(w http.ResponseWriter, status int, contentType, body string) {
	w.Header().Set("Content-Type", contentType)
	w.WriteHeader(status)
	_, _ = w.Write([]byte(body))
}
