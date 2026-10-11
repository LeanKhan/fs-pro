package grid

// CompiledShape is the canonical, deterministic compile output of a grid: the
// 11 sim-core formation slots, the ordered starting XI, and the advisory
// preview (auras, passing links, connectivity -> directness, synergies).
//
// It is exactly what the sim-service request consumes (slots + XI) plus what the
// editor renders (preview), frozen so a golden pins it byte-for-byte. There is
// no second, divergent tactics model here: the compiler's only output is
// existing engine inputs (docs/coc-mapping/03 §1.9, 07 §0).
type CompiledShape struct {
	Slots      []SimSlot `json:"slots"`
	StartingXI []string  `json:"startingXI"`
	Preview    Preview   `json:"preview"`
}

// CompileShape compiles g once and bundles its engine payload with its spatial
// read. Pure and deterministic: the same grid always yields a byte-identical
// CompiledShape.
func CompileShape(g Grid) CompiledShape {
	return CompiledShape{
		Slots:      SimSlots(g),
		StartingXI: StartingXI(g),
		Preview:    BuildPreview(g),
	}
}
