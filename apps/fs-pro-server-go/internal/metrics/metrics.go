// Package metrics is a tiny, dependency-free Prometheus-style metrics registry
// (docs/coc-mapping/05 §9 Observability). It provides thread-safe counters,
// gauges and histograms plus a text-exposition writer that can serve a
// Prometheus scrape.
//
// Design rules, in the spirit of AGENTS.md:
//
//   - No external dependencies: the whole registry is the standard library.
//   - Hot-path cheap: a metric handle is fetched once at package init, then
//     every update is a lock-free atomic operation (Counter.Inc / Gauge.Set /
//     Histogram.Observe). Nothing here allocates per observation.
//   - Deterministic exposition: families and series are emitted in sorted order
//     so a scrape is stable and diffable.
//
// It is deliberately small: only the three primitives the operating metrics
// need. A metric is identified by a name and at most one label pair (enough for
// per-facility / per-path / per-league breakdowns without a full label engine).
package metrics

import (
	"io"
	"math"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
)

// DefaultBuckets are the histogram bucket upper bounds (seconds) for latency
// metrics. They span sub-millisecond request handlers through multi-minute
// worker sweeps. Bounds exclude the implicit +Inf bucket.
var DefaultBuckets = []float64{
	0.001, 0.0025, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60,
}

// Metric kinds, used for the `# TYPE` exposition line and registry validation.
const (
	kindCounter   = "counter"
	kindGauge     = "gauge"
	kindHistogram = "histogram"
)

// Counter is a monotonically increasing value (a Prometheus counter). It is
// safe for concurrent use by multiple goroutines.
type Counter struct {
	bits atomic.Uint64 // float64 bits
}

// Inc adds one.
func (c *Counter) Inc() { c.Add(1) }

// Add adds delta (which may be fractional; callers should only add >= 0).
func (c *Counter) Add(delta float64) {
	for {
		old := c.bits.Load()
		next := math.Float64bits(math.Float64frombits(old) + delta)
		if c.bits.CompareAndSwap(old, next) {
			return
		}
	}
}

// Value returns the current count.
func (c *Counter) Value() float64 { return math.Float64frombits(c.bits.Load()) }

// Gauge is a value that can go up or down (a Prometheus gauge). It is safe for
// concurrent use.
type Gauge struct {
	bits atomic.Uint64 // float64 bits
}

// Set replaces the gauge value.
func (g *Gauge) Set(v float64) {
	g.bits.Store(math.Float64bits(v))
}

// Add adds delta to the gauge.
func (g *Gauge) Add(delta float64) {
	for {
		old := g.bits.Load()
		next := math.Float64bits(math.Float64frombits(old) + delta)
		if g.bits.CompareAndSwap(old, next) {
			return
		}
	}
}

// Value returns the current gauge value.
func (g *Gauge) Value() float64 { return math.Float64frombits(g.bits.Load()) }

// Histogram is a bucketed latency/value distribution (a Prometheus histogram).
// It records cumulative bucket counts plus a sum and a count, so both
// Prometheus `histogram_quantile` and a local Percentile can read it. It is safe
// for concurrent use.
type Histogram struct {
	bounds []float64       // ascending upper bounds, excluding +Inf
	counts []atomic.Uint64 // one per bound, plus a trailing +Inf bucket
	sum    atomic.Uint64   // float64 bits
	seen   atomic.Uint64
}

// Observe records one value.
func (h *Histogram) Observe(v float64) {
	// SearchFloat64s returns the first index with bounds[i] >= v, so a value
	// above every bound lands in the trailing +Inf bucket.
	i := sort.SearchFloat64s(h.bounds, v)
	h.counts[i].Add(1)
	h.seen.Add(1)
	for {
		old := h.sum.Load()
		next := math.Float64bits(math.Float64frombits(old) + v)
		if h.sum.CompareAndSwap(old, next) {
			break
		}
	}
}

// Count returns how many values have been observed.
func (h *Histogram) Count() uint64 { return h.seen.Load() }

// Sum returns the sum of observed values.
func (h *Histogram) Sum() float64 { return math.Float64frombits(h.sum.Load()) }

// Percentile returns the q-quantile (0 < q <= 1) from the bucket counts, using
// linear interpolation within the containing bucket (the same approximation as
// Prometheus `histogram_quantile`). It returns 0 when nothing has been observed.
// It is an approximation: exact percentiles would require keeping every sample.
func (h *Histogram) Percentile(q float64) float64 {
	total := h.seen.Load()
	if total == 0 {
		return 0
	}
	if q <= 0 {
		q = 0
	}
	if q > 1 {
		q = 1
	}
	target := q * float64(total)
	cumulative := 0.0
	prevBound := 0.0
	for i, bound := range h.bounds {
		cumulative += float64(h.counts[i].Load())
		if cumulative >= target {
			return interpolate(prevBound, bound, cumulative-float64(h.counts[i].Load()), float64(h.counts[i].Load()), target)
		}
		prevBound = bound
	}
	// The +Inf bucket: no finite upper bound, so return the last finite bound.
	return h.bounds[len(h.bounds)-1]
}

// interpolate estimates the value inside [low, high) whose rank is target,
// assuming a uniform spread across the bucket's `n` samples.
func interpolate(low, high, before, n, target float64) float64 {
	if n <= 0 || high <= low {
		return low
	}
	frac := (target - before) / n
	if frac < 0 {
		frac = 0
	}
	if frac > 1 {
		frac = 1
	}
	return low + (high-low)*frac
}

// labelPair is one name="value" label.
type labelPair struct{ key, value string }

func writeCounter(w io.Writer, name string, labels []labelPair, c *Counter) {
	line(w, name, labels, c.Value())
}

func writeGauge(w io.Writer, name string, labels []labelPair, g *Gauge) {
	line(w, name, labels, g.Value())
}

func writeHistogram(w io.Writer, name string, labels []labelPair, h *Histogram) {
	cumulative := uint64(0)
	for i, bound := range h.bounds {
		cumulative += h.counts[i].Load()
		line(w, name+"_bucket", withLabel(labels, "le", formatFloat(bound)), float64(cumulative))
	}
	cumulative += h.counts[len(h.bounds)].Load()
	line(w, name+"_bucket", withLabel(labels, "le", "+Inf"), float64(cumulative))
	line(w, name+"_sum", labels, h.Sum())
	line(w, name+"_count", labels, float64(h.seen.Load()))
}

// Registry owns a set of metric families and renders them.
type Registry struct {
	mu       sync.RWMutex
	families map[string]*family
}

type family struct {
	name   string
	help   string
	kind   string
	series map[string]*series
}

type series struct {
	labels []labelPair
	// exactly one of the following is set, per the family kind.
	counter   *Counter
	gauge     *Gauge
	histogram *Histogram
}

// NewRegistry returns an empty registry.
func NewRegistry() *Registry {
	return &Registry{families: map[string]*family{}}
}

// Default is the process-wide registry every instrumented package writes to. A
// binary exposes it verbatim at GET /metrics.
var defaultRegistry = NewRegistry()

// Default returns the process-wide registry.
func Default() *Registry { return defaultRegistry }

// Counter returns the counter for name (get-or-create).
func (r *Registry) Counter(name, help string) *Counter {
	return r.counter(name, help, nil)
}

// CounterLabel returns the counter for name with a single label pair.
func (r *Registry) CounterLabel(name, help, labelKey, labelValue string) *Counter {
	return r.counter(name, help, []labelPair{{labelKey, labelValue}})
}

func (r *Registry) counter(name, help string, labels []labelPair) *Counter {
	r.mu.Lock()
	defer r.mu.Unlock()
	s := r.seriesLocked(name, help, kindCounter, labels)
	if s.counter == nil {
		s.counter = &Counter{}
	}
	return s.counter
}

// Gauge returns the gauge for name (get-or-create).
func (r *Registry) Gauge(name, help string) *Gauge {
	return r.gauge(name, help, nil)
}

// GaugeLabel returns the gauge for name with a single label pair.
func (r *Registry) GaugeLabel(name, help, labelKey, labelValue string) *Gauge {
	return r.gauge(name, help, []labelPair{{labelKey, labelValue}})
}

func (r *Registry) gauge(name, help string, labels []labelPair) *Gauge {
	r.mu.Lock()
	defer r.mu.Unlock()
	s := r.seriesLocked(name, help, kindGauge, labels)
	if s.gauge == nil {
		s.gauge = &Gauge{}
	}
	return s.gauge
}

// Histogram returns the histogram for name with DefaultBuckets (get-or-create).
func (r *Registry) Histogram(name, help string) *Histogram {
	return r.histogram(name, help, DefaultBuckets, nil)
}

// HistogramLabel returns the histogram for name with a single label pair.
func (r *Registry) HistogramLabel(name, help, labelKey, labelValue string) *Histogram {
	return r.histogram(name, help, DefaultBuckets, []labelPair{{labelKey, labelValue}})
}

// HistogramWithBuckets returns the histogram for name with custom buckets.
func (r *Registry) HistogramWithBuckets(name, help string, buckets []float64) *Histogram {
	return r.histogram(name, help, buckets, nil)
}

func (r *Registry) histogram(name, help string, buckets []float64, labels []labelPair) *Histogram {
	r.mu.Lock()
	defer r.mu.Unlock()
	s := r.seriesLocked(name, help, kindHistogram, labels)
	if s.histogram == nil {
		s.histogram = newHistogram(buckets)
	}
	return s.histogram
}

func newHistogram(buckets []float64) *Histogram {
	if len(buckets) == 0 {
		buckets = DefaultBuckets
	}
	// Copy and sort so a caller cannot mutate the bounds after construction.
	bs := append([]float64(nil), buckets...)
	sort.Float64s(bs)
	return &Histogram{bounds: bs, counts: make([]atomic.Uint64, len(bs)+1)}
}

// seriesLocked get-or-creates the family and series for a metric identity. The
// caller must hold r.mu. It panics on a name reused with a different kind (a
// programming error that should fail fast at package init rather than silently
// mislabel production metrics).
func (r *Registry) seriesLocked(name, help, kind string, labels []labelPair) *series {
	key := labelKey(labels)
	fam, ok := r.families[name]
	if !ok {
		fam = &family{name: name, help: help, kind: kind, series: map[string]*series{}}
		r.families[name] = fam
	} else if fam.kind != kind {
		panic("metrics: " + name + " registered as " + fam.kind + ", requested as " + kind)
	}
	s, ok := fam.series[key]
	if !ok {
		s = &series{labels: append([]labelPair(nil), labels...)}
		fam.series[key] = s
	}
	return s
}

// Names returns the registered metric family names, sorted.
func (r *Registry) Names() []string {
	r.mu.RLock()
	defer r.mu.RUnlock()
	out := make([]string, 0, len(r.families))
	for name := range r.families {
		out = append(out, name)
	}
	sort.Strings(out)
	return out
}

// WritePrometheus writes the Prometheus text exposition format (version
// 0.0.4) and sets the matching Content-Type. It never fails: a scrape is
// best-effort.
func (r *Registry) WritePrometheus(w http.ResponseWriter) {
	w.Header().Set("Content-Type", "text/plain; version=0.0.4; charset=utf-8")
	_ = r.WriteExposition(w)
}

// renderEntry is an immutable snapshot of one series, taken under the registry
// lock so exposition never races a concurrent registration.
type renderEntry struct {
	kind      string
	name      string
	help      string
	labels    []labelPair
	labelsKey string
	counter   *Counter
	gauge     *Gauge
	histogram *Histogram
}

// WriteExposition writes the exposition to any writer (used by tests and tools).
func (r *Registry) WriteExposition(w io.Writer) error {
	entries := r.snapshot()
	sort.Slice(entries, func(i, j int) bool {
		if entries[i].name != entries[j].name {
			return entries[i].name < entries[j].name
		}
		return entries[i].labelsKey < entries[j].labelsKey
	})

	lastName := ""
	for _, e := range entries {
		if e.name != lastName {
			writeString(w, "# HELP "+e.name+" "+e.help+"\n")
			writeString(w, "# TYPE "+e.name+" "+e.kind+"\n")
			lastName = e.name
		}
		switch e.kind {
		case kindCounter:
			writeCounter(w, e.name, e.labels, e.counter)
		case kindGauge:
			writeGauge(w, e.name, e.labels, e.gauge)
		case kindHistogram:
			writeHistogram(w, e.name, e.labels, e.histogram)
		}
	}
	return nil
}

// snapshot copies every series under the read lock.
func (r *Registry) snapshot() []renderEntry {
	r.mu.RLock()
	defer r.mu.RUnlock()
	out := make([]renderEntry, 0, len(r.families))
	for _, f := range r.families {
		for _, s := range f.series {
			out = append(out, renderEntry{
				kind: f.kind, name: f.name, help: f.help,
				labels: s.labels, labelsKey: labelKey(s.labels),
				counter: s.counter, gauge: s.gauge, histogram: s.histogram,
			})
		}
	}
	return out
}

// Exposition returns the exposition as a string (tests, debugging).
func (r *Registry) Exposition() string {
	var b strings.Builder
	_ = r.WriteExposition(&b)
	return b.String()
}

// --- formatting helpers ----------------------------------------------------

// labelKey renders labels into a stable map key.
func labelKey(labels []labelPair) string {
	if len(labels) == 0 {
		return ""
	}
	var b strings.Builder
	for i, p := range labels {
		if i > 0 {
			b.WriteByte(',')
		}
		b.WriteString(p.key)
		b.WriteByte('=')
		b.WriteString(p.value)
	}
	return b.String()
}

// line writes one sample line: name{labels} value.
func line(w io.Writer, name string, labels []labelPair, value float64) {
	writeString(w, name)
	writeString(w, renderLabels(labels))
	writeString(w, " ")
	writeString(w, formatFloat(value))
	writeString(w, "\n")
}

// renderLabels renders "{k=\"v\",...}", or "" when there are no labels.
func renderLabels(labels []labelPair) string {
	if len(labels) == 0 {
		return ""
	}
	var b strings.Builder
	b.WriteByte('{')
	for i, p := range labels {
		if i > 0 {
			b.WriteByte(',')
		}
		b.WriteString(p.key)
		b.WriteString(`="`)
		b.WriteString(escapeLabel(p.value))
		b.WriteByte('"')
	}
	b.WriteByte('}')
	return b.String()
}

// withLabel returns a copy of labels with labelKey appended.
func withLabel(labels []labelPair, key, value string) []labelPair {
	out := make([]labelPair, len(labels), len(labels)+1)
	copy(out, labels)
	return append(out, labelPair{key, value})
}

// escapeLabel escapes a label value per the Prometheus text format.
func escapeLabel(v string) string {
	if !strings.ContainsAny(v, "\\\"\n") {
		return v
	}
	var b strings.Builder
	for _, r := range v {
		switch r {
		case '\\':
			b.WriteString(`\\`)
		case '"':
			b.WriteString(`\"`)
		case '\n':
			b.WriteString(`\n`)
		default:
			b.WriteRune(r)
		}
	}
	return b.String()
}

// formatFloat renders a metric value the way the Prometheus text format reads
// it (including the special +Inf/-Inf/NaN tokens).
func formatFloat(v float64) string {
	switch {
	case math.IsNaN(v):
		return "NaN"
	case math.IsInf(v, 1):
		return "+Inf"
	case math.IsInf(v, -1):
		return "-Inf"
	default:
		return strconv.FormatFloat(v, 'g', -1, 64)
	}
}

// writeString writes s, ignoring the (always nil for our writers) error.
func writeString(w io.Writer, s string) {
	_, _ = io.WriteString(w, s)
}
