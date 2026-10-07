package orchestrator

import (
	"encoding/json"
	"fmt"
	"runtime"
	"sync"
	"sync/atomic"
	"time"

	"fs-pro-sim-service/engine"
)

// MatchTask represents a unit of simulation work.
type MatchTask struct {
	Index   int
	Payload []byte
	Result  []byte
	Err     error
}

// Metrics tracks global engine performance metrics.
type Metrics struct {
	TotalSimulated   uint64  `json:"total_simulated"`
	TotalFailed      uint64  `json:"total_failed"`
	ActiveWorkers    int64   `json:"active_workers"`
	TotalSimMs       float64 `json:"total_sim_ms"`
	AvgSimMs         float64 `json:"avg_sim_ms"`
	MatchesPerSecond float64 `json:"matches_per_second"`
}

// Pool coordinates concurrent match simulations.
type Pool struct {
	workerCount int
	// Separate from `metrics`: updated atomically by workers, so it must
	// never be read through a plain struct copy.
	activeWorkers atomic.Int64
	metricsMu     sync.RWMutex
	metrics       Metrics
	startTime     time.Time
}

// NewPool creates a worker pool with the specified concurrency (default runtime.NumCPU()).
func NewPool(workers int) *Pool {
	if workers <= 0 {
		workers = runtime.NumCPU()
	}
	p := &Pool{
		workerCount: workers,
		startTime:   time.Now(),
	}
	return p
}

// SimulateSingle simulates a single match request synchronously.
func (p *Pool) SimulateSingle(reqJSON []byte) ([]byte, error) {
	p.activeWorkers.Add(1)
	defer p.activeWorkers.Add(-1)

	start := time.Now()
	res, err := engine.SimulateMatch(reqJSON)
	elapsedMs := float64(time.Since(start).Microseconds()) / 1000.0

	p.recordMetric(elapsedMs, err == nil)
	return res, err
}

// BatchRunner runs a batch and returns structured responses.
type BatchResult struct {
	Total      int               `json:"total"`
	Successful int               `json:"successful"`
	Failed     int               `json:"failed"`
	DurationMs float64           `json:"duration_ms"`
	Throughput float64           `json:"matches_per_sec"`
	Results    []json.RawMessage `json:"results"`
	Errors     []string          `json:"errors,omitempty"`
}

func (p *Pool) RunBatch(requests [][]byte) (*BatchResult, error) {
	start := time.Now()
	n := len(requests)
	tasks := make([]*MatchTask, n)
	taskChan := make(chan *MatchTask, n)

	for i, req := range requests {
		t := &MatchTask{Index: i, Payload: req}
		tasks[i] = t
		taskChan <- t
	}
	close(taskChan)

	var wg sync.WaitGroup
	workers := p.workerCount
	if workers > n {
		workers = n
	}

	for w := 0; w < workers; w++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			p.activeWorkers.Add(1)
			defer p.activeWorkers.Add(-1)

			for task := range taskChan {
				t0 := time.Now()
				res, err := engine.SimulateMatch(task.Payload)
				elapsedMs := float64(time.Since(t0).Microseconds()) / 1000.0

				task.Result = res
				task.Err = err
				p.recordMetric(elapsedMs, err == nil)
			}
		}()
	}

	wg.Wait()
	durationMs := float64(time.Since(start).Microseconds()) / 1000.0

	resObj := &BatchResult{
		Total:      n,
		DurationMs: durationMs,
		Throughput: (float64(n) / durationMs) * 1000.0,
		Results:    make([]json.RawMessage, n),
		Errors:     make([]string, 0),
	}

	for i, t := range tasks {
		if t.Err != nil {
			resObj.Failed++
			resObj.Errors = append(resObj.Errors, fmt.Sprintf("match %d: %v", i, t.Err))
		} else {
			resObj.Successful++
			resObj.Results[i] = t.Result
		}
	}

	return resObj, nil
}

func (p *Pool) recordMetric(elapsedMs float64, success bool) {
	p.metricsMu.Lock()
	defer p.metricsMu.Unlock()

	if success {
		p.metrics.TotalSimulated++
		p.metrics.TotalSimMs += elapsedMs
		p.metrics.AvgSimMs = p.metrics.TotalSimMs / float64(p.metrics.TotalSimulated)
	} else {
		p.metrics.TotalFailed++
	}

	uptimeSec := time.Since(p.startTime).Seconds()
	if uptimeSec > 0 {
		p.metrics.MatchesPerSecond = float64(p.metrics.TotalSimulated) / uptimeSec
	}
}

// GetMetrics returns a copy of current metrics.
func (p *Pool) GetMetrics() Metrics {
	p.metricsMu.RLock()
	defer p.metricsMu.RUnlock()
	m := p.metrics
	m.ActiveWorkers = p.activeWorkers.Load()
	return m
}
