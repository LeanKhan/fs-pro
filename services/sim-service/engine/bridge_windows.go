//go:build windows

package engine

import (
	"fmt"
	"path/filepath"
	"sync"
	"syscall"
	"unsafe"
)

const libName = "sim_core.dll"

var (
	libMu     sync.RWMutex
	procSim   *syscall.LazyProc
	procFree  *syscall.LazyProc
	libLoaded bool
)

// loadLibrary loads sim_core.dll and resolves its two exports.
func loadLibrary(path string) error {
	abs, _ := filepath.Abs(path)
	dll := syscall.NewLazyDLL(abs)
	sim := dll.NewProc("simulate_match_ffi")
	free := dll.NewProc("free_match_string")
	if err := sim.Find(); err != nil {
		return err
	}
	if err := free.Find(); err != nil {
		return err
	}
	libMu.Lock()
	procSim, procFree, libLoaded = sim, free, true
	libMu.Unlock()
	return nil
}

func libraryLoaded() bool {
	libMu.RLock()
	defer libMu.RUnlock()
	return libLoaded
}

func simulateViaLibrary(reqJSON []byte) ([]byte, error) {
	// NUL-terminated copy for the C ABI.
	in := make([]byte, len(reqJSON)+1)
	copy(in, reqJSON)

	resPtr, _, callErr := procSim.Call(uintptr(unsafe.Pointer(&in[0])))
	if resPtr == 0 {
		return nil, fmt.Errorf("simulate_match_ffi returned NULL: %v", callErr)
	}
	defer procFree.Call(resPtr)

	// Copy the C string out before it is freed. `go vet` flags the
	// uintptr->pointer conversions below; they're inherent to syscall DLL
	// calls (the result is a C allocation the GC never moves or frees).
	n := 0
	for *(*byte)(unsafe.Add(unsafe.Pointer(resPtr), n)) != 0 {
		n++
	}
	out := make([]byte, n)
	copy(out, unsafe.Slice((*byte)(unsafe.Pointer(resPtr)), n))
	return out, nil
}
