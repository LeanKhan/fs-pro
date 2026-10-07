package engine

import (
	"bytes"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sync"
)

var (
	initMu  sync.Mutex
	cliPath string
)

// releaseDirs are where a fresh `cargo build --release` of crates/sim-core
// puts its artifacts, relative to the likely working directories. They are
// searched BEFORE the current directory, so a stale copy lying next to the
// service binary never shadows the build you just made.
var releaseDirs = []string{
	"../../crates/sim-core/target/release",
	"../crates/sim-core/target/release",
	"crates/sim-core/target/release",
	"../../../crates/sim-core/target/release",
}

// InitEngine finds the Rust engine. `customPath` (or SIM_CORE_DLL_PATH)
// wins when set; otherwise the native library is loaded where the platform
// supports it (Windows), else the `sim-cli` binary is used.
func InitEngine(customPath string) error {
	initMu.Lock()
	defer initMu.Unlock()

	var libCandidates []string
	for _, c := range []string{customPath, os.Getenv("SIM_CORE_DLL_PATH")} {
		if c != "" {
			libCandidates = append(libCandidates, c)
		}
	}
	for _, dir := range releaseDirs {
		libCandidates = append(libCandidates, filepath.Join(dir, libName))
	}
	libCandidates = append(libCandidates, libName)

	for _, cand := range libCandidates {
		if _, err := os.Stat(cand); err == nil {
			if err := loadLibrary(cand); err == nil {
				return nil
			}
		}
	}

	cli := "sim-cli"
	if runtime.GOOS == "windows" {
		cli += ".exe"
	}
	var cliCandidates []string
	if p := os.Getenv("SIM_CORE_CLI_PATH"); p != "" {
		cliCandidates = append(cliCandidates, p)
	}
	for _, dir := range releaseDirs {
		cliCandidates = append(cliCandidates, filepath.Join(dir, cli))
	}
	cliCandidates = append(cliCandidates, cli)

	for _, cand := range cliCandidates {
		if _, err := os.Stat(cand); err == nil {
			cliPath, _ = filepath.Abs(cand)
			return nil
		}
	}

	return errors.New("neither the sim-core library nor sim-cli could be located (build crates/sim-core with `cargo build --release`)")
}

// SimulateMatch runs one match request (JSON) through the Rust engine and
// returns its JSON response. Safe to call from many goroutines: the engine
// keeps no shared state between matches.
func SimulateMatch(reqJSON []byte) ([]byte, error) {
	if libraryLoaded() {
		return simulateViaLibrary(reqJSON)
	}
	if cliPath != "" {
		return simulateViaCLI(reqJSON)
	}
	return nil, errors.New("simulation engine not initialized")
}

func simulateViaCLI(reqJSON []byte) ([]byte, error) {
	cmd := exec.Command(cliPath)
	cmd.Stdin = bytes.NewReader(reqJSON)
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		return nil, fmt.Errorf("sim-cli failed: %v (stderr: %s)", err, stderr.String())
	}
	return stdout.Bytes(), nil
}
