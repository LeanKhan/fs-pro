package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"time"
)

// simservice.go starts the real Rust simulation service (services/sim-service)
// for the DoD run, so the raid steps go through the genuine sim-core engine
// rather than a fake. It is the only external process the command needs.
//
// Resolution order:
//  1. an already-running SIM_SERVICE_URL (reused, never killed);
//  2. the checked-in services/sim-service/sim-service.exe, pointed at the
//     freshly-built crates/sim-core/target/release/sim_core.dll;
//  3. `go build` of services/sim-service into a temp binary if the exe is absent.
//
// The command still works if the engine cannot be started: the raid steps then
// report the exact missing capability and the other steps still run. No fake
// simulator is ever substituted.

const simServiceDLLRel = "crates/sim-core/target/release/sim_core.dll"

// simService is a running (or reused) sim-service.
type simService struct {
	url     string
	stop    func()
	reused  bool
	logPath string
}

// ensureSimService returns a reachable sim-service URL, starting the local
// binary when one is not already configured.
func ensureSimService(ctx context.Context) (*simService, error) {
	if url := os.Getenv("SIM_SERVICE_URL"); url != "" {
		if healthOK(ctx, url) {
			return &simService{url: url, stop: func() {}, reused: true}, nil
		}
	}

	root, err := findRepoRoot()
	if err != nil {
		return nil, err
	}
	dll, err := findSimDLL(root)
	if err != nil {
		return nil, err
	}
	exe, err := ensureSimExe(root)
	if err != nil {
		return nil, err
	}

	port, err := freePort()
	if err != nil {
		return nil, fmt.Errorf("sim-service: no free port: %w", err)
	}
	url := fmt.Sprintf("http://127.0.0.1:%d", port)

	cmd := exec.Command(exe)
	cmd.Dir = filepath.Join(root, "services", "sim-service")
	cmd.Env = append(os.Environ(),
		"SIM_SERVICE_PORT="+fmt.Sprintf("%d", port),
		"SIM_SERVICE_HOST=127.0.0.1",
		"SIM_CORE_DLL_PATH="+dll,
	)
	// Keep the service's own logging out of the DoD transcript; keep it in a
	// temp file so a failed start is diagnosable.
	logPath := filepath.Join(os.TempDir(), "fspro-dod-sim-service.log")
	logFile, _ := os.Create(logPath)
	if logFile != nil {
		cmd.Stdout = logFile
		cmd.Stderr = logFile
	}
	if err := cmd.Start(); err != nil {
		if logFile != nil {
			logFile.Close()
		}
		return nil, fmt.Errorf("sim-service: start %s: %w", exe, err)
	}

	stop := func() {
		if cmd.Process != nil {
			_ = cmd.Process.Kill()
			_, _ = cmd.Process.Wait()
		}
		if logFile != nil {
			logFile.Close()
		}
	}
	if err := waitHealth(ctx, url, 20*time.Second); err != nil {
		stop()
		return nil, fmt.Errorf("%w (see %s)", err, logPath)
	}
	os.Setenv("SIM_SERVICE_URL", url)
	return &simService{url: url, stop: stop, logPath: logPath}, nil
}

// findRepoRoot walks up from the working directory to the monorepo root.
func findRepoRoot() (string, error) {
	dir, err := os.Getwd()
	if err != nil {
		return "", err
	}
	for i := 0; i < 8; i++ {
		if dirExists(filepath.Join(dir, "crates", "sim-core")) &&
			dirExists(filepath.Join(dir, "services", "sim-service")) {
			return dir, nil
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			break
		}
		dir = parent
	}
	return "", errors.New("sim-service: could not locate the monorepo root (needs crates/sim-core and services/sim-service)")
}

// findSimDLL prefers the freshly-built release library, falling back to the
// copy that ships next to the service binary.
func findSimDLL(root string) (string, error) {
	candidates := []string{
		filepath.Join(root, simServiceDLLRel),
		filepath.Join(root, "services", "sim-service", "sim_core.dll"),
	}
	for _, c := range candidates {
		if fileExists(c) {
			return c, nil
		}
	}
	return "", fmt.Errorf("sim-service: no sim_core.dll found (build crates/sim-core with `cargo build --release`); looked in %v", candidates)
}

// ensureSimExe returns the service binary, building it if it is not checked in.
func ensureSimExe(root string) (string, error) {
	exe := filepath.Join(root, "services", "sim-service", "sim-service.exe")
	if fileExists(exe) {
		return exe, nil
	}
	exe = filepath.Join(root, "services", "sim-service", "sim-service")
	if fileExists(exe) {
		return exe, nil
	}
	out := filepath.Join(os.TempDir(), "fspro-sim-service-dod.exe")
	build := exec.Command("go", "build", "-o", out, ".")
	build.Dir = filepath.Join(root, "services", "sim-service")
	if b, err := build.CombinedOutput(); err != nil {
		return "", fmt.Errorf("sim-service: build failed: %v: %s", err, string(b))
	}
	return out, nil
}

// healthOK reports whether a sim-service answers /health.
func healthOK(ctx context.Context, url string) bool {
	ctx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url+"/health", nil)
	if err != nil {
		return false
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return false
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return false
	}
	var body map[string]any
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		return false
	}
	return body["status"] == "ok"
}

// waitHealth polls /health until the service is up or the deadline passes.
func waitHealth(ctx context.Context, url string, timeout time.Duration) error {
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		if healthOK(ctx, url) {
			return nil
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(150 * time.Millisecond):
		}
	}
	return fmt.Errorf("sim-service at %s did not become healthy within %s", url, timeout)
}

func freePort() (int, error) {
	l, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return 0, err
	}
	defer l.Close()
	return l.Addr().(*net.TCPAddr).Port, nil
}

func fileExists(p string) bool {
	st, err := os.Stat(p)
	return err == nil && !st.IsDir()
}

func dirExists(p string) bool {
	st, err := os.Stat(p)
	return err == nil && st.IsDir()
}
