package httpapi

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
)

// maxBodyBytes bounds the buffered request body (1 MiB; JSON APIs only).
const maxBodyBytes = 1 << 20

// bodyMiddleware buffers the request body once so the route-policy guard can
// inspect it (bodyField rules, KeepFields) and the handler can re-read it.
// A top-level JSON object is also parsed into a map for KeepFields.
func bodyMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		c := Get(r)
		if c == nil {
			next.ServeHTTP(w, r)
			return
		}
		if r.Body != nil {
			data, err := io.ReadAll(io.LimitReader(r.Body, maxBodyBytes+1))
			if err == nil {
				if len(data) > maxBodyBytes {
					data = data[:maxBodyBytes]
				}
				c.Body = data
				r.Body = io.NopCloser(bytes.NewReader(data))
				var parsed any
				if len(bytes.TrimSpace(data)) > 0 && json.Unmarshal(data, &parsed) == nil {
					if m, ok := parsed.(map[string]any); ok {
						c.bodyMap = m
						c.hasBodyMap = true
					}
				}
			}
		}
		next.ServeHTTP(w, r)
	})
}
