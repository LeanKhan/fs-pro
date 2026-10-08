package names

import "testing"

// Name generation sits on the player/manager/place creation path, so it must
// stay trivially cheap even when the world seeds thousands of people at once.
func BenchmarkGenerateFullName(b *testing.B) {
	b.ReportAllocs()
	for i := 0; i < b.N; i++ {
		if _, err := GenerateKind("karsh", KindFull, int64(i)); err != nil {
			b.Fatal(err)
		}
	}
}

func BenchmarkGenerateUniqueClubSquad(b *testing.B) {
	b.ReportAllocs()
	for i := 0; i < b.N; i++ {
		if _, err := GenerateUnique("bellean", KindFull, int64(i), 25); err != nil {
			b.Fatal(err)
		}
	}
}

func BenchmarkGenerateMixedFullName(b *testing.B) {
	b.ReportAllocs()
	for i := 0; i < b.N; i++ {
		if _, _, err := GenerateMixed("bellean", KindFull, int64(i), 16); err != nil {
			b.Fatal(err)
		}
	}
}
