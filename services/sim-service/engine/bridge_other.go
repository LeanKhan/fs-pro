//go:build !windows

package engine

import "errors"

// Outside Windows the engine runs through the `sim-cli` binary (one
// process per match, a few milliseconds of overhead). Loading the shared
// library in-process would need cgo; the CLI keeps the build a plain
// `go build`.
const libName = "libsim_core.so"

func loadLibrary(string) error {
	return errors.New("in-process library loading is only implemented on Windows; using sim-cli")
}

func libraryLoaded() bool { return false }

func simulateViaLibrary([]byte) ([]byte, error) {
	return nil, errors.New("in-process library loading is only implemented on Windows")
}
