package tile

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestTileProxyPassThrough(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/tiles/1/2/3" {
			w.WriteHeader(http.StatusNotFound)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"success":true,"message":"tile","payload":{"z":1}}`))
	}))
	defer upstream.Close()

	h := New(upstream.URL)
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/tiles/1/2/3", nil)
	req.SetPathValue("z", "1")
	req.SetPathValue("x", "2")
	req.SetPathValue("y", "3")
	h.getTile(rec, req)

	if rec.Code != 200 || rec.Body.String() != `{"success":true,"message":"tile","payload":{"z":1}}` {
		t.Fatalf("proxy = %d %s", rec.Code, rec.Body.String())
	}
}

func TestTileProxyOffline(t *testing.T) {
	h := New("http://127.0.0.1:1") // nothing listening
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/tiles/1/2/3", nil)
	req.SetPathValue("z", "1")
	req.SetPathValue("x", "2")
	req.SetPathValue("y", "3")
	h.getTile(rec, req)
	if rec.Code != 400 {
		t.Fatalf("offline proxy status = %d, want 400", rec.Code)
	}
}
