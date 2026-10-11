package metrics

import (
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
)

func TestCounter(t *testing.T) {
	r := NewRegistry()
	c := r.Counter("fspro_test_total", "test counter")
	if c.Value() != 0 {
		t.Fatalf("initial = %v, want 0", c.Value())
	}
	c.Inc()
	c.Add(4)
	if c.Value() != 5 {
		t.Fatalf("value = %v, want 5", c.Value())
	}
	if got := r.Counter("fspro_test_total", "test counter"); got != c {
		t.Fatal("Counter must return the same handle for the same name")
	}
}

func TestGauge(t *testing.T) {
	r := NewRegistry()
	g := r.Gauge("fspro_test_gauge", "test gauge")
	g.Set(3.5)
	g.Add(1.5)
	g.Add(-2)
	if g.Value() != 3 {
		t.Fatalf("value = %v, want 3", g.Value())
	}
}

func TestHistogram(t *testing.T) {
	r := NewRegistry()
	h := r.HistogramWithBuckets("fspro_test_seconds", "test latency", []float64{0.005, 0.05})
	for i := 0; i < 10; i++ {
		h.Observe(0.001)
	}
	for i := 0; i < 10; i++ {
		h.Observe(0.01)
	}
	if h.Count() != 20 {
		t.Fatalf("count = %d, want 20", h.Count())
	}
	// 10*0.001 + 10*0.01 = 0.11
	if sum := h.Sum(); sum < 0.1099 || sum > 0.1101 {
		t.Fatalf("sum = %v, want ~0.11", sum)
	}
	if p50 := h.Percentile(0.5); p50 < 0.001 || p50 > 0.005 {
		t.Fatalf("p50 = %v, want inside [0.001,0.005]", p50)
	}
	if p90 := h.Percentile(0.9); p90 <= 0.005 || p90 > 0.05 {
		t.Fatalf("p90 = %v, want inside (0.005,0.05]", p90)
	}
}

func TestHistogramEmptyPercentileIsZero(t *testing.T) {
	h := newHistogram(nil)
	if got := h.Percentile(0.99); got != 0 {
		t.Fatalf("empty percentile = %v, want 0", got)
	}
	// A value above every bound lands in the +Inf bucket.
	h.Observe(1e9)
	if h.Count() != 1 {
		t.Fatalf("count = %d, want 1", h.Count())
	}
}

func TestExpositionFormat(t *testing.T) {
	r := NewRegistry()
	r.Counter("fspro_a_total", "an a").Inc()
	r.Gauge("fspro_b_active", "a b").Set(2)
	r.HistogramLabel("fspro_c_requests_total", "c requests", "path", "attack").Observe(0.02)
	r.CounterLabel("fspro_d_by_facility_total", "d per facility", "facility", "clubhouse").Add(3)

	body := r.Exposition()
	wants := []string{
		"# HELP fspro_a_total an a\n# TYPE fspro_a_total counter\nfspro_a_total 1\n",
		"# HELP fspro_b_active a b\n# TYPE fspro_b_active gauge\nfspro_b_active 2\n",
		"fspro_c_requests_total_bucket{path=\"attack\",le=\"+Inf\"} 1\n",
		"fspro_c_requests_total_count{path=\"attack\"} 1\n",
		"fspro_c_requests_total_sum{path=\"attack\"} 0.02\n",
		"fspro_d_by_facility_total{facility=\"clubhouse\"} 3\n",
	}
	for _, want := range wants {
		if !strings.Contains(body, want) {
			t.Fatalf("exposition missing %q\n---\n%s", want, body)
		}
	}
	// Families are emitted in sorted name order.
	if strings.Index(body, "fspro_a_total") > strings.Index(body, "fspro_b_active") {
		t.Fatalf("families not sorted:\n%s", body)
	}
}

func TestLabelEscaping(t *testing.T) {
	r := NewRegistry()
	r.CounterLabel("fspro_esc_total", "escape", "k", "a\"b\\c\nd").Inc()
	body := r.Exposition()
	if !strings.Contains(body, `fspro_esc_total{k="a\"b\\c\nd"} 1`) {
		t.Fatalf("label not escaped:\n%s", body)
	}
}

func TestNameReusedWithDifferentKindPanics(t *testing.T) {
	r := NewRegistry()
	r.Counter("fspro_dup", "x").Inc()
	defer func() {
		if recover() == nil {
			t.Fatal("reusing a name with a different kind must panic")
		}
	}()
	r.Gauge("fspro_dup", "x")
}

func TestWritePrometheusSetsContentTypeAndBody(t *testing.T) {
	r := NewRegistry()
	r.Counter("fspro_http_total", "http").Add(7)
	rec := httptest.NewRecorder()
	r.WritePrometheus(rec)
	if got := rec.Header().Get("Content-Type"); !strings.HasPrefix(got, "text/plain") {
		t.Fatalf("Content-Type = %q", got)
	}
	if !strings.Contains(rec.Body.String(), "fspro_http_total 7") {
		t.Fatalf("body = %s", rec.Body.String())
	}
}

// TestConcurrentUpdates proves the primitives are safe under contention: 100
// goroutines each do 100 increments, so the final count is exact. It is written
// to fail loudly under the race detector too.
func TestConcurrentUpdates(t *testing.T) {
	r := NewRegistry()
	c := r.Counter("fspro_conc_total", "concurrent")
	g := r.Gauge("fspro_conc_gauge", "concurrent")
	h := r.Histogram("fspro_conc_seconds", "concurrent")

	const workers, perWorker = 100, 100
	var wg sync.WaitGroup
	wg.Add(workers)
	for i := 0; i < workers; i++ {
		go func() {
			defer wg.Done()
			for j := 0; j < perWorker; j++ {
				c.Inc()
				g.Add(1)
				h.Observe(0.01)
			}
		}()
	}
	wg.Wait()

	if got, want := c.Value(), float64(workers*perWorker); got != want {
		t.Fatalf("counter = %v, want %v", got, want)
	}
	if got, want := g.Value(), float64(workers*perWorker); got != want {
		t.Fatalf("gauge = %v, want %v", got, want)
	}
	if got, want := h.Count(), uint64(workers*perWorker); got != want {
		t.Fatalf("histogram count = %v, want %v", got, want)
	}
}

// TestConcurrentRegistration proves get-or-create is safe when many goroutines
// race to register the same family/handle.
func TestConcurrentRegistration(t *testing.T) {
	r := NewRegistry()
	var wg sync.WaitGroup
	for i := 0; i < 50; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			r.Counter("fspro_race_total", "race").Inc()
		}()
	}
	wg.Wait()
	if got := r.Counter("fspro_race_total", "race").Value(); got != 50 {
		t.Fatalf("counter = %v, want 50", got)
	}
}
