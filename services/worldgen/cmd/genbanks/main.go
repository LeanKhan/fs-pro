// Command genbanks builds the per-culture name banks that services/worldgen
// embeds and serves. It is an offline, deterministic tool: running it again
// reproduces the committed JSON byte for byte.
//
//	go run ./cmd/genbanks
//
// The runtime never calls this; it only reads names/data/cultures/*.json. The
// generator is kept in-repo so banks can be extended or regenerated without
// hand-writing hundreds of names, and so the deny-list filter is applied at
// bank-build time as well as generation time.
package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"math/rand"
	"os"
	"path/filepath"
	"strings"

	"fs-pro-worldgen/internal/namecore"
)

// ---- output schema (must match names/culture.go) ---------------------

type outCulture struct {
	ID          string                `json:"id"`
	DisplayName string                `json:"displayName"`
	Note        string                `json:"note"`
	Phonology   namecore.Phonotactics `json:"phonology"`
	Banks       map[string][]string   `json:"banks"`
	Patterns    map[string][]string   `json:"patterns"`
}

type mixEntry struct {
	Culture string `json:"culture"`
	Weight  int    `json:"weight"`
}

type countryDef struct {
	Culture string     `json:"culture"`
	Mix     []mixEntry `json:"mix"`
	Aliases []string   `json:"aliases"`
}

type countriesFile struct {
	Countries map[string]countryDef `json:"countries"`
}

// ---- per-culture seed definition -------------------------------------

type seed struct {
	ID           string
	DisplayName  string
	Note         string
	Phon         namecore.Phonotactics
	FirstSeeds   []string
	LastSeeds    []string
	PlaceSeeds   []string
	ClubWords    []string
	StadiumWords []string
	FirstSyl     [2]int
	LastSyl      [2]int
	PlaceSyl     [2]int
	TargetFirst  int
	TargetLast   int
	TargetPlace  int
}

const maxNameLen = 10

func main() {
	out := flag.String("out", "names/data", "output data directory")
	flag.Parse()

	seeds := []seed{
		karshSeed(), kevSeed(), legardioSeed(), hunterlaanSeed(),
		ingaSeed(), kiyotoSeed(), preggeSeed(), prolandSeed(),
	}

	for i, s := range seeds {
		rng := rand.New(rand.NewSource(int64(20261007 + i*7919)))
		c := buildCulture(rng, s)
		path := filepath.Join(*out, "cultures", s.ID+".json")
		writeJSON(path, c)
		fmt.Printf("%-11s first=%d last=%d place=%d\n", s.ID, len(c.Banks["firstnames"]), len(c.Banks["surnames"]), len(c.Banks["placewords"]))
	}

	writeJSON(filepath.Join(*out, "misc", "country_cultures.json"), countries())
	fmt.Println("wrote country_cultures.json")
}

func buildCulture(rng *rand.Rand, s seed) outCulture {
	first := genList(rng, s.Phon, s.FirstSyl, s.TargetFirst, s.FirstSeeds, nil)
	used := setOf(first)
	last := genList(rng, s.Phon, s.LastSyl, s.TargetLast, s.LastSeeds, used)
	for k := range setOf(last) {
		used[k] = true
	}
	place := genList(rng, s.Phon, s.PlaceSyl, s.TargetPlace, s.PlaceSeeds, used)

	patterns := map[string][]string{
		"club": {
			"{placewords} {clubwords}",
			"{clubwords} {placewords}",
			"{firstnames} {clubwords}",
			"{placewords}",
		},
		"region": {
			"{placewords}",
			"{placewords} {regionwords}",
			"{regionwords} {placewords}",
		},
		"city": {
			"{placewords}",
			"{placewords} {citywords}",
			"{citywords} {placewords}",
		},
		"district": {
			"{placewords} {districtwords}",
			"{districtwords} {placewords}",
			"{placewords}",
		},
		"stadium": {
			"{placewords} {stadiumwords}",
			"The {placewords} {stadiumwords}",
		},
	}

	return outCulture{
		ID:          s.ID,
		DisplayName: s.DisplayName,
		Note:        s.Note,
		Phonology:   s.Phon,
		Banks: map[string][]string{
			"firstnames":    first,
			"surnames":      last,
			"placewords":    place,
			"clubwords":     s.ClubWords,
			"stadiumwords":  s.StadiumWords,
			"regionwords":   sharedRegionWords(),
			"citywords":     sharedCityWords(),
			"districtwords": sharedDistrictWords(),
		},
		Patterns: patterns,
	}
}

func genList(rng *rand.Rand, p namecore.Phonotactics, syl [2]int, target int, curated []string, avoid map[string]bool) []string {
	seen := map[string]bool{}
	out := make([]string, 0, target)
	add := func(raw string) {
		s := strings.TrimSpace(raw)
		if len(s) < 3 || len(s) > maxNameLen {
			return
		}
		key := strings.ToLower(s)
		if seen[key] || (avoid != nil && avoid[key]) {
			return
		}
		if namecore.Denied(s) {
			return
		}
		seen[key] = true
		out = append(out, s)
	}
	for _, c := range curated {
		add(c)
	}
	attempts := 0
	maxAttempts := target * 400
	for len(out) < target && attempts < maxAttempts {
		attempts++
		add(namecore.Assemble(rng, p, syl[0], syl[1], maxNameLen))
	}
	if len(out) < target {
		log.Fatalf("only generated %d/%d names (pool too small)", len(out), target)
	}
	return out
}

func setOf(xs []string) map[string]bool {
	m := make(map[string]bool, len(xs))
	for _, x := range xs {
		m[strings.ToLower(x)] = true
	}
	return m
}

func writeJSON(path string, v any) {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		log.Fatalf("mkdir %s: %v", filepath.Dir(path), err)
	}
	raw, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		log.Fatalf("marshal %s: %v", path, err)
	}
	raw = append(raw, '\n')
	if err := os.WriteFile(path, raw, 0o644); err != nil {
		log.Fatalf("write %s: %v", path, err)
	}
}

// ---- shared word banks ----------------------------------------------

func sharedRegionWords() []string {
	return []string{"State", "Province", "Region", "Territory", "Zone", "County", "Commonwealth", "Domain", "Shire", "Hinterland"}
}

func sharedCityWords() []string {
	return []string{"City", "Town", "Port", "Cross", "Bridge", "Vale", "Gate", "Haven", "Springs", "Borough", "Reach", "Halt"}
}

func sharedDistrictWords() []string {
	return []string{"Central", "Heights", "Park", "Quarter", "Green", "Fields", "Gate", "Hill", "Meadows", "Rise", "Row", "Wharf", "End", "Side"}
}

// ---- countries -------------------------------------------------------

func countries() countriesFile {
	return countriesFile{Countries: map[string]countryDef{
		"bellean": {
			Culture: "karsh",
			Mix:     []mixEntry{{"karsh", 60}, {"legardio", 15}, {"inga", 15}, {"kiyoto", 10}},
			Aliases: []string{"karsh republic of bellean", "bellean", "bel"},
		},
		"ekhastan": {
			Culture: "karsh",
			Mix:     []mixEntry{{"karsh", 70}, {"pregge", 10}, {"kiyoto", 10}, {"inga", 10}},
			Aliases: []string{"united kinsalates of ekhastan", "ekhastan", "ekastan", "ekh"},
		},
		"ashter": {
			Culture: "karsh",
			Mix:     []mixEntry{{"karsh", 80}, {"legardio", 10}, {"inga", 10}},
			Aliases: []string{"karsh state of ashter", "ashter", "ash"},
		},
		"kev": {
			Culture: "kev",
			Mix:     []mixEntry{{"kev", 90}, {"hunterlaan", 10}},
			Aliases: []string{"free state of kev", "kev"},
		},
		"simeone": {
			Culture: "legardio",
			Mix:     []mixEntry{{"legardio", 95}, {"karsh", 5}},
			Aliases: []string{"royal kindred of simeon", "royal kindred of simeone", "simeon", "simeone", "leg"},
		},
		"hunteerland": {
			Culture: "hunterlaan",
			Mix:     []mixEntry{{"hunterlaan", 95}, {"kev", 5}},
			Aliases: []string{"hunterland", "hunteerland", "hunterlaan", "hun"},
		},
		"upp": {
			Culture: "inga",
			Mix:     []mixEntry{{"inga", 85}, {"kiyoto", 10}, {"karsh", 5}},
			Aliases: []string{"united provinces of palaba", "united provines of palaba", "palaba", "republic of galli", "galli", "upp", "uga"},
		},
		"kiyoto": {
			Culture: "kiyoto",
			Mix:     []mixEntry{{"kiyoto", 95}, {"inga", 5}},
			Aliases: []string{"kiyoto", "kiy"},
		},
		"pregge": {
			Culture: "pregge",
			Mix:     []mixEntry{{"pregge", 100}},
			Aliases: []string{"pregge", "prg"},
		},
		"proland": {
			Culture: "proland",
			Mix:     []mixEntry{{"proland", 95}, {"kev", 5}},
			Aliases: []string{"proland", "pro"},
		},
	}}
}

// ---- culture seeds ---------------------------------------------------

func karshSeed() seed {
	return seed{
		ID: "karsh", DisplayName: "Karsh",
		Note: "Desert/industrial Karsh tongue: kh, sh, j, z with open vowels; -Kin and -oosh place endings.",
		Phon: namecore.Phonotactics{
			Onsets:    []string{"kh", "sh", "j", "z", "d", "m", "n", "r", "s", "t", "b", "l", "g", "h", "k", "v", "f", "y", "br", "dr", "tr", "gh", "zh"},
			Nuclei:    []string{"a", "e", "i", "o", "u", "ai", "ou"},
			Codas:     []string{"", "", "", "", "n", "r", "m", "l", "s", "t", "k", "z"},
			Templates: []string{"OV", "OV", "OV", "OVK"},
		},
		FirstSeeds:   []string{"Daniir", "Danion", "Falmata", "Jeran", "Safon", "Zehon", "Tesa", "Alkhaad", "Ehloon", "Rashar", "Malikat", "Melanin", "Koonu", "Hal", "Umb", "Tay", "Am", "Gid", "Perc", "Kel", "Zul", "Rond", "Bar", "Mav", "Kwan", "Sen", "Dakar", "Dash", "Chak", "Kael", "Nizar", "Tariq", "Zafar", "Kamal", "Farid", "Ibrim", "Safi", "Nizam", "Khadir", "Hamid"},
		LastSeeds:    []string{"Kaphari", "Mansian", "Muhudia", "Opoly", "Kharopo", "Akhta", "Sultat", "Badrari", "Jaheen", "Bindoosh", "Agunboro", "Manso", "Kazim", "Vimash", "Dinar", "Khalen", "Joosh", "Kukinn", "Frydgeland", "Ivania", "Tileland", "Tobakaeem", "Northgate", "Kharpak", "Bedebi", "Sane", "Kasp", "Kinsah", "Sanma", "Doosh", "Kalem", "Saroo", "Nabil", "Hamdan", "Zayed", "Rahim"},
		PlaceSeeds:   []string{"Dha Marm", "Ivania", "Tileland", "Kukinn", "Khalenjoosh", "KhalenJoosh", "Northgate", "Philamentia", "Tobakaeem", "Bedebi-Kin", "Kae Kazim", "Vimash", "Deluge", "Karatoomila", "Port Sayid", "New Kantaloo", "Vamoosh-Kin", "Anglia-Kin", "Kinsah-Kin", "Ashton-Kin", "Guttersburg", "Brinkwall", "Kastle", "Port Dinar", "Toyota", "Upland", "Ingapot", "Fort Kalvin", "Fort Moomood", "Robinstown", "VendoorStien", "East Frydgeland", "Kharpak-view", "Tobakaeem State", "Southport", "Tiland", "Simeonstone"},
		ClubWords:    []string{"United", "City", "Town", "Rovers", "Athletic", "Wanderers", "Sporting", "Kinsalat", "Club", "FC", "SC", "Athletic Club", "Dynamo", "Frontier"},
		StadiumWords: []string{"Park", "Arena", "Stadium", "Ground", "Bowl", "Dome", "Field", "Coliseum", "Oval", "Gardens", "Stands", "Road"},
		FirstSyl:     [2]int{2, 3}, LastSyl: [2]int{2, 3}, PlaceSyl: [2]int{2, 3},
		TargetFirst: 2000, TargetLast: 2000, TargetPlace: 200,
	}
}

func kevSeed() seed {
	return seed{
		ID: "kev", DisplayName: "Kev",
		Note: "Consonant-heavy Kev tongue: Vrom-, Beg-, -veezl, -egge, -winth; 12 named states.",
		Phon: namecore.Phonotactics{
			Onsets:    []string{"b", "bl", "br", "d", "f", "g", "h", "j", "k", "l", "m", "n", "p", "r", "s", "t", "v", "z", "vr", "kv", "gr", "dr", "st", "sk", "fj"},
			Nuclei:    []string{"a", "e", "i", "o", "u", "ee", "oo", "ai"},
			Codas:     []string{"", "", "", "", "n", "r", "m", "s", "t", "k", "l", "v", "z"},
			Templates: []string{"OV", "OV", "OV", "OVK"},
		},
		FirstSeeds:   []string{"Antulev", "Begrov", "Bludveezl", "Borutov", "Cadim", "Dam", "Degro", "Exer", "Fedregor", "Gent", "Haz", "Hagard", "Ive", "Jacwinth", "Kevn", "Kyro", "Lev", "Mirov", "Ondoy", "Karlz", "Dunst", "Ergo", "Garg", "Farg", "Pald", "Ald", "Han", "Vrom", "Besh", "Fin", "Dori", "Cal", "Zan", "Torb", "Malk", "Jor", "Fen", "Hend", "Keld", "Ror", "Vand", "Brev"},
		LastSeeds:    []string{"Voodveezl", "Kevram", "Bearvoly", "Egrocer", "Voodvoly", "Arwvoly", "Vijhin", "Vinth", "Winth", "Minth", "Konvoy", "Onblud", "Trublud", "Trablud", "Forblud", "Vivablud", "Slavak", "Zlavak", "Vutzlik", "Nuegge", "Fermegge", "Nuvoly", "Jansevo", "Heinzlo", "Larr", "Meggevi", "Maxwinth", "Moppe", "Token", "Vek", "Heinzo", "Kev", "Chev", "Blud", "Krev", "Ston", "Vromn"},
		PlaceSeeds:   []string{"Storr", "Stonkev", "Sdev", "Pregge", "Potgregge", "Pooventt", "Midu", "Manitobva", "Jacwinth", "Feedhein", "Damwinth", "Ceviva", "Portgregge", "Kevnport", "Vromhold", "Bludstad", "Ondheim", "Dunstgard", "Gargov", "Fenwick", "Heinzlund", "Maxwinth-Stat", "Nueggeport", "Zlavak"},
		ClubWords:    []string{"United", "City", "Town", "Rovers", "Athletic", "Wanderers", "Sporting", "Club", "FC", "SC", "Kev XI", "Dynamo", "Union", "Athletik"},
		StadiumWords: []string{"Park", "Arena", "Stadium", "Ground", "Bowl", "Dome", "Field", "Hal", "Oval", "Gardens", "Stands", "Weg"},
		FirstSyl:     [2]int{2, 3}, LastSyl: [2]int{2, 3}, PlaceSyl: [2]int{2, 3},
		TargetFirst: 2000, TargetLast: 2000, TargetPlace: 200,
	}
}

func legardioSeed() seed {
	return seed{
		ID: "legardio", DisplayName: "Legardio",
		Note: "Romance-flavoured Legardio tongue: -ino, -etto, -ello, -aro; Royal Kindred of Simeon.",
		Phon: namecore.Phonotactics{
			Onsets:    []string{"b", "c", "d", "f", "g", "j", "l", "m", "n", "p", "r", "s", "t", "v", "z", "gl", "gr", "pr", "tr", "fr", "ch", "gi", "gn"},
			Nuclei:    []string{"a", "e", "i", "o", "u", "ei", "io", "ia"},
			Codas:     []string{"", "", "", "", "n", "r", "l", "s", "t"},
			Templates: []string{"OV", "OV", "OV", "OV"},
		},
		FirstSeeds:   []string{"Jollee", "Jollo", "Markino", "Plastiquee", "Raktanus", "Tomketto", "Fine", "Butul", "Buiss", "Eldoosh", "Prosparo", "Joll", "Mark", "Fin", "Plastiqu", "Tomk", "Raktan", "Io", "Vinc", "Enz", "Pao", "Mat", "Al", "Sim", "Hag", "Eld", "Pro", "Mart", "Kel", "Par", "Ce", "Zep", "Don", "Luc", "Sal", "Mate", "Pietano", "Loreno", "Emilano", "Renzio"},
		LastSeeds:    []string{"Bellaro", "Bellano", "Bello", "Jamezo", "Didon", "Siso", "Cascetti", "Castetti", "Did", "Brun", "LaCaz", "Brinki", "Jamez", "Zpirihen", "Zonzinz", "Spoon", "Sis", "Ross", "Bell", "Tar", "Ash", "Zep", "Lug", "Bar", "Pot", "For", "Mar", "Cast", "Val", "Silv", "Rios", "Camp", "Zeppo", "Ferrino", "Santavo", "Maroto", "Velluzzo"},
		PlaceSeeds:   []string{"Simeon", "Bellaro", "Cascetti", "Didon", "Siso", "Jameza", "Prospa", "Raktan", "Tomket", "Plastique", "Markino", "Buissano", "Eldoria", "Zepanna", "Castella", "Vellino", "Ferrino", "Santavo", "Belloro", "Montoro", "Porto Vello", "Villa Zepo", "Nuova Simeon", "Lorina"},
		ClubWords:    []string{"United", "City", "Town", "Sporting", "Club", "FC", "SC", "Calcio", "Unione", "Atletico", "Real", "Deportivo", "Union", "Athletic"},
		StadiumWords: []string{"Park", "Arena", "Stadio", "Ground", "Bowl", "Dome", "Campo", "Coliseum", "Oval", "Gardens", "Curva", "Strada"},
		FirstSyl:     [2]int{2, 3}, LastSyl: [2]int{2, 3}, PlaceSyl: [2]int{2, 3},
		TargetFirst: 2000, TargetLast: 2000, TargetPlace: 200,
	}
}

func hunterlaanSeed() seed {
	return seed{
		ID: "hunterlaan", DisplayName: "Hunterlaan",
		Note: "Nordic-flavoured Hunterlaan tongue: Frost-, -gard, -qvist, -heim, -berg; Hunterland.",
		Phon: namecore.Phonotactics{
			Onsets:    []string{"b", "bj", "d", "f", "g", "h", "j", "k", "kl", "l", "m", "n", "r", "s", "sk", "sn", "st", "sv", "t", "th", "v"},
			Nuclei:    []string{"a", "e", "i", "o", "u", "aa", "oo", "ei"},
			Codas:     []string{"", "", "", "", "n", "r", "l", "s", "t", "k"},
			Templates: []string{"OV", "OV", "OVK", "OVK"},
		},
		FirstSeeds:   []string{"Dippo", "Huik", "Huiund", "Huke", "Iam", "Ivan", "Kalts", "Svenen", "Chall", "Ash", "Brin", "Mist", "Huk", "Rush", "Vorn", "Kalt", "Thor", "Gunn", "Bjo", "Sven", "Rik", "Dag", "Finn", "Leif", "Rolf", "Ulf", "Stig", "Torbjo", "Halv", "Knut", "Sig", "Tryg", "Odd", "Eirik", "Hald", "Grim", "Vald", "Rurik", "Olav", "Brand"},
		LastSeeds:    []string{"Futt", "Boja", "Bojland", "Donjun", "Heer", "Taar", "Frostgard", "Vinqvist", "Vin", "Boj", "Fut", "Hammein", "Hunt", "Vor", "Barke", "Don", "Frost", "Gron", "Stad", "Lind", "Holm", "Gard", "Qvist", "Heim", "Berg", "Strand", "Fjord", "Skar", "Varg", "Ulv", "Bjorn", "Hald", "Ravn", "Ek", "Ask", "Lund", "Nes", "Vik"},
		PlaceSeeds:   []string{"Hunterland", "Frostgard", "Vinqvist", "Bojland", "Donjun", "Heim", "Bjornstad", "Ulfvik", "Ravnholm", "Eklund", "Asknes", "Strandgard", "Fjordheim", "Skarborg", "Vargdal", "Lindqvist", "Holmgard", "Nordvik", "Sunnfjord", "Ostmark", "Haldstad", "Grimsnes", "Torvald", "Svensheim"},
		ClubWords:    []string{"United", "City", "Town", "Rovers", "Athletic", "Wanderers", "Sporting", "Club", "IF", "BK", "FK", "Dynamo", "Union", "Viking"},
		StadiumWords: []string{"Park", "Arena", "Stadion", "Ground", "Bowl", "Dome", "Field", "Vall", "Oval", "Gardens", "Stands", "Borg"},
		FirstSyl:     [2]int{2, 3}, LastSyl: [2]int{2, 3}, PlaceSyl: [2]int{2, 3},
		TargetFirst: 2000, TargetLast: 2000, TargetPlace: 200,
	}
}

func ingaSeed() seed {
	return seed{
		ID: "inga", DisplayName: "Inga",
		Note: "Island/creole Inga tongue: Palaba, Nushigam, Kishin with English-ish place compounds (Southgate).",
		Phon: namecore.Phonotactics{
			Onsets:    []string{"k", "g", "h", "j", "l", "m", "n", "ng", "p", "r", "s", "sh", "t", "v", "w", "y", "b", "d", "f"},
			Nuclei:    []string{"a", "e", "i", "o", "u", "ai", "au"},
			Codas:     []string{"", "", "", "", "n", "m", "l", "r", "s", "t", "k"},
			Templates: []string{"OV", "OV", "OV", "OVK"},
		},
		FirstSeeds:   []string{"Kosho", "Deskoop", "Cho", "Zul", "Perrip", "Glo", "Hein", "Pull", "Miko", "Bak", "Fen", "Kobo", "Duro", "Bozoki", "Emet", "Petro", "Winn", "Yama", "Kos", "Deskt", "Tano", "Mako", "Rina", "Sela", "Kalo", "Nalu", "Palu", "Roto", "Sami", "Tavi", "Vulu", "Weka", "Yaro", "Zima", "Batu", "Ika", "Kupu", "Lani", "Mana", "Nui"},
		LastSeeds:    []string{"Undatop", "Changehand", "Brickhand", "Limpopo", "Samwend", "Dulop", "Jolog", "Shore", "Kola", "Balog", "Wende", "Ematob", "Joshenkaal", "Bellarea", "Nushigam", "Kishin", "Paking", "Rushma", "Nabum", "Ohlsen", "Fells", "Rita", "Highlander", "Tideman", "Kolapo", "Balaya", "Mandala", "Rusinga", "Tavola", "Wanaka", "Nakuru", "Peleni", "Solano", "Turana", "Vangai", "Yemala"},
		PlaceSeeds:   []string{"Palaba", "Ematob", "Joshenkaal", "Bellarea", "Nushigam", "Kishin", "Paking", "Fridgeland", "Southgate", "Woodinsborrow", "Rushma", "Southend", "Nabum", "Flowerpoht", "Galli", "New Dinan", "Palaba Central", "Nabum Savana", "Fop", "GRS", "Malendere", "Kikuyu Falls", "Tavora", "Wanaka"},
		ClubWords:    []string{"United", "City", "Town", "Rovers", "Athletic", "Wanderers", "Sporting", "Club", "FC", "SC", "United FC", "Dynamo", "Union", "Coasters"},
		StadiumWords: []string{"Park", "Arena", "Stadium", "Ground", "Bowl", "Dome", "Field", "Malae", "Oval", "Gardens", "Stands", "Way"},
		FirstSyl:     [2]int{2, 3}, LastSyl: [2]int{2, 3}, PlaceSyl: [2]int{2, 3},
		TargetFirst: 2000, TargetLast: 2000, TargetPlace: 200,
	}
}

func kiyotoSeed() seed {
	return seed{
		ID: "kiyoto", DisplayName: "Kiyoto",
		Note: "Island Kiyoto tongue: Hiwei, Opanimei, -gawa, -moto, -zaki place/surname endings.",
		Phon: namecore.Phonotactics{
			Onsets:    []string{"h", "k", "m", "n", "r", "s", "sh", "t", "y", "w", "ch", "j", "ts", "d", "g", "b", "p", "z"},
			Nuclei:    []string{"a", "e", "i", "o", "u", "ai", "ei"},
			Codas:     []string{"", "", "", "", "n", "m", "k", "t", "r"},
			Templates: []string{"OV", "OV", "OV", "OVK"},
		},
		FirstSeeds:   []string{"Hiwei", "Jakhee", "Kentor", "Prei", "Rioro", "Sinpei", "Yowei", "Yung", "Hec", "Mak", "Pow", "Hi", "Kash", "Rio", "Kish", "Jak", "Tek", "Ren", "Ken", "Sho", "Dai", "Tai", "Ryu", "Jun", "Kaz", "Hano", "Aikoro", "Yukiro", "Sorae", "Renzo", "Kiyoe", "Tomori", "Narito", "Hirono", "Senai", "Rinko", "Kaedro", "Haruno", "Miyoro", "Tatsuro"},
		LastSeeds:    []string{"Opanimei", "Joie", "Satogawa", "Chanko", "Joimoto", "Vhier", "Kiki", "Chin", "Sand", "Chak", "Opani", "Moul", "Pell", "Chank", "Joi", "Hashira", "Kuroja", "Matsuro", "Tanie", "Nakoro", "Hiragi", "Yamato", "Kobedo", "Tanato", "Suzuro", "Takahito", "Ikaru", "Watano", "Nakami", "Yoshino", "Yamanai", "Sasako", "Kimuro", "Hayato", "Shimuro", "Morito", "Abeno", "Ikedro", "Hashiro", "Sakoro"},
		PlaceSeeds:   []string{"Kiyoto", "Chanko", "Opanimei", "Satogawa", "Joimoto", "Kiki", "Vhier", "Joie", "Prei", "Sinpei", "Rioro", "Yowei", "Hiwei", "Koyo", "Sakura", "Nihama", "Tsurumi", "Kawada", "Morisan", "Kanazawa", "Hirose", "Yamagata", "Kobedo", "Tanato"},
		ClubWords:    []string{"United", "City", "Town", "Rovers", "Athletic", "Wanderers", "Sporting", "Club", "FC", "SC", "Antlers", "Dynamo", "Union", "Frontale"},
		StadiumWords: []string{"Park", "Arena", "Stadium", "Ground", "Bowl", "Dome", "Field", "Dome", "Oval", "Gardens", "Stands", "Yama"},
		FirstSyl:     [2]int{2, 3}, LastSyl: [2]int{2, 3}, PlaceSyl: [2]int{2, 3},
		TargetFirst: 2000, TargetLast: 2000, TargetPlace: 200,
	}
}

func preggeSeed() seed {
	return seed{
		ID: "pregge", DisplayName: "Pregge",
		Note: "Invented extension: plosive-heavy Pregge tongue (Gregge, Stuechi, Thippp, Zamezi).",
		Phon: namecore.Phonotactics{
			Onsets:    []string{"b", "ch", "d", "g", "gr", "k", "kl", "p", "pl", "pr", "s", "sh", "st", "t", "th", "tr", "v", "x", "z", "br", "gl", "dr", "kr"},
			Nuclei:    []string{"a", "e", "i", "o", "u", "ai", "ou"},
			Codas:     []string{"", "", "", "k", "p", "t", "g", "b", "d"},
			Templates: []string{"OV", "OV", "OVK", "OVK"},
		},
		FirstSeeds:   []string{"Duno", "Stuppp", "Tihess", "Gregge", "Pootpp", "Plummpp", "Progg", "Xinv", "Poot", "Tih", "Bon", "Torup", "Dun", "Greg", "Klug", "Zopp", "Plonk", "Greb", "Grob", "Trug", "Vlox", "Krex", "Plip", "Stog", "Brob", "Dripp", "Flogg", "Globb", "Krunk", "Splot", "Throb", "Xogg", "Zunk", "Blott", "Chogg", "Dwikk", "Flomm", "Gnek", "Pruff", "Sklott"},
		LastSeeds:    []string{"Chevegge", "Stuechi", "Zamezi", "Thippp", "Annde", "Baggge", "Plummpp", "Ann", "Vox", "Thip", "Toh", "Phod", "Stuech", "Mein", "Cheveg", "Bagg", "Zamez", "Dunk", "Krogg", "Vlumm", "Xadd", "Zipp", "Plodd", "Skutt", "Thrubb", "Grock", "Blatt", "Chuff", "Drubb", "Flogg", "Gnitt", "Klett", "Pluss", "Stipp", "Trock", "Vrund", "Zaff", "Bruck", "Klodd", "Schnup"},
		PlaceSeeds:   []string{"Pregge", "Stuech", "Chevegge", "Zamezi", "Bagg", "Plumm", "Annde", "Thipp", "Gregge", "Dunk", "Krogg", "Vlox", "Zopp", "Plonk", "Xoggsberg", "Trugstadt", "Klugheim", "Grebvik", "Stogport", "Brobdale", "Krexfjord", "Drippton", "Floggard", "Skuttmark"},
		ClubWords:    []string{"United", "City", "Town", "Rovers", "Athletic", "Wanderers", "Sporting", "Club", "FC", "SC", "Klub", "Dynamo", "Union", "Sturm"},
		StadiumWords: []string{"Park", "Arena", "Stadion", "Ground", "Bowl", "Dome", "Field", "Grube", "Oval", "Gardens", "Stands", "Weg"},
		FirstSyl:     [2]int{2, 3}, LastSyl: [2]int{2, 3}, PlaceSyl: [2]int{2, 3},
		TargetFirst: 2000, TargetLast: 2000, TargetPlace: 200,
	}
}

func prolandSeed() seed {
	return seed{
		ID: "proland", DisplayName: "Proland",
		Note: "Invented extension: Slavic-flavoured Proland tongue (Stanik, Borkov, Fullmein, -vik, -grad).",
		Phon: namecore.Phonotactics{
			Onsets:    []string{"b", "br", "c", "ch", "d", "dr", "g", "h", "j", "k", "l", "m", "n", "p", "pr", "r", "s", "sh", "sl", "sn", "st", "t", "v", "z", "zh", "tr", "kr", "pl"},
			Nuclei:    []string{"a", "e", "i", "o", "u", "oo", "ai"},
			Codas:     []string{"", "", "", "n", "r", "l", "s", "t", "k", "v", "z"},
			Templates: []string{"OV", "OV", "OVK", "OVK"},
		},
		FirstSeeds:   []string{"Danay", "Kevinn", "Palic", "Phoward", "Stanik", "Viktan", "Gorh", "Pal", "Zibr", "Phow", "Pro", "Kev", "Dan", "Vikt", "Stan", "Bog", "Milos", "Jur", "Rad", "Vlan", "Tomas", "Ivan", "Marek", "Ludek", "Zden", "Boris", "Drago", "Goran", "Miro", "Pavel", "Roman", "Sergei", "Vadim", "Yar", "Zhiv", "Bran", "Cedo", "Dusan", "Emil", "Filip"},
		LastSeeds:    []string{"Nole", "Borkov", "Fullmein", "Nolic", "Bukke", "Kov", "Stol", "Rad", "Bork", "Morg", "Vov", "Brad", "Nol", "Stankov", "Vlanov", "Drahov", "Zibrov", "Palov", "Milosov", "Jurik", "Bogdan", "Radek", "Toman", "Ivank", "Marekov", "Ludkov", "Zdenko", "Borisov", "Dragov", "Goranov", "Mirov", "Pavlov", "Romanov", "Sergei", "Vadimov", "Yarik", "Zhivkov", "Branov", "Dusan", "Emilev"},
		PlaceSeeds:   []string{"Proland", "Nole", "Borkov", "Fullmein", "Bukke", "Stanik", "Viktan", "Gorhov", "Zibrograd", "Palov", "Kevik", "Danov", "Vlanik", "Boskov", "Milosgrad", "Jurik", "Radov", "Stolvik", "Morgov", "Vadimov", "Sergeyev", "Drahov", "Yaroslav", "Zhivkov"},
		ClubWords:    []string{"United", "City", "Town", "Rovers", "Athletic", "Wanderers", "Sporting", "Club", "FC", "SC", "Dynamo", "Union", "Spartak", "Zvezda"},
		StadiumWords: []string{"Park", "Arena", "Stadium", "Ground", "Bowl", "Dome", "Field", "Stadion", "Oval", "Gardens", "Stands", "Dom"},
		FirstSyl:     [2]int{2, 3}, LastSyl: [2]int{2, 3}, PlaceSyl: [2]int{2, 3},
		TargetFirst: 2000, TargetLast: 2000, TargetPlace: 200,
	}
}
