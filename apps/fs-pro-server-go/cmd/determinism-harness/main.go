// Command determinism-harness runs the pure game-layer pipeline N times for a
// fixed seed and reports whether every run is byte-identical. It needs no
// database and exits non-zero on any mismatch, so it can be a CI gate.
package main

import (
	"flag"
	"fmt"
	"os"

	"fs-pro-server/internal/determinism"
)

func main() {
	seed := flag.Int64("seed", 20261010, "deterministic seed")
	runs := flag.Int("runs", 100, "number of runs to compare")
	flag.Parse()

	digest, body, err := determinism.Digest(*seed)
	if err != nil {
		fmt.Fprintf(os.Stderr, "digest failed: %v\n", err)
		os.Exit(2)
	}
	if err := determinism.Verify(*seed, *runs); err != nil {
		fmt.Fprintf(os.Stderr, "FAIL: %v\n", err)
		os.Exit(1)
	}
	fmt.Printf("DETERMINISM OK: seed=%d runs=%d digest=%s bytes=%d\n", *seed, *runs, digest, len(body))
}
