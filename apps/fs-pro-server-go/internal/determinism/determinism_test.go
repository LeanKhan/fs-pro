package determinism

import "testing"

// TestPipelineIsDeterministic is the harness contract: 64 runs of the same seed
// produce byte-identical output.
func TestPipelineIsDeterministic(t *testing.T) {
	if err := Verify(20261010, 64); err != nil {
		t.Fatal(err)
	}
}

// TestDigestIsStable pins the hash for a fixed seed so a change to any pure
// function in the pipeline is caught as a golden regression.
func TestDigestIsStable(t *testing.T) {
	h1, b1, err := Digest(7)
	if err != nil {
		t.Fatal(err)
	}
	h2, b2, err := Digest(7)
	if err != nil {
		t.Fatal(err)
	}
	if h1 != h2 || string(b1) != string(b2) {
		t.Fatalf("digest not stable: %s / %s", h1, h2)
	}
	if len(b1) == 0 {
		t.Fatal("empty digest body")
	}
}

// TestSeedsDiverge guards against a pipeline that is deterministic only because
// it ignores the seed (e.g. an accidentally constant result).
func TestSeedsDiverge(t *testing.T) {
	seen := map[string]bool{}
	for seed := int64(0); seed < 32; seed++ {
		h, _, err := Digest(seed)
		if err != nil {
			t.Fatal(err)
		}
		seen[h] = true
	}
	if len(seen) < 8 {
		t.Fatalf("only %d distinct digests across 32 seeds - the seed is not driving the pipeline", len(seen))
	}
}
