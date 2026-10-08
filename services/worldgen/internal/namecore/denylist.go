package namecore

import (
	"strings"
	"unicode"
)

// Real-world names must never be generated as fiction. The lists below are
// the deny-list the L12 test checks against: notable football people
// (players/managers) and real professional clubs. Matching is done on a
// normalised form (casefold, punctuation to spaces, collapsed whitespace):
//
//   - a candidate equal to any entry is denied;
//   - a multi-word candidate containing a full entry is denied;
//   - a single-token candidate equal to any word (>=5 chars) of a multi-word
//     entry is denied, so a generated "Messi" cannot slip through.
var denyPeople = []string{
	// Players
	"Lionel Messi", "Cristiano Ronaldo", "Diego Maradona", "Pele", "Edson Arantes do Nascimento",
	"Zinedine Zidane", "David Beckham", "Ronaldinho", "Ronaldo Nazario", "Kylian Mbappe",
	"Neymar", "Neymar Jr", "Mohamed Salah", "Kevin De Bruyne", "Robert Lewandowski",
	"Erling Haaland", "Vinicius Junior", "Luka Modric", "Sergio Ramos", "Andres Iniesta",
	"Xavi Hernandez", "Iker Casillas", "Manuel Neuer", "Thierry Henry", "Dennis Bergkamp",
	"Johan Cruyff", "Franz Beckenbauer", "Bobby Charlton", "George Best", "Wayne Rooney",
	"Steven Gerrard", "Frank Lampard", "Paul Scholes", "Ryan Giggs", "Harry Kane",
	"Jude Bellingham", "Marcus Rashford", "Son Heung-min", "Lamine Yamal", "Bukayo Saka",
	"Phil Foden", "Rodri", "Alisson Becker", "Virgil van Dijk", "Karim Benzema",
	"Zlatan Ibrahimovic", "Andriy Shevchenko", "Samuel Eto'o", "Didier Drogba", "Yaya Toure",
	"Michael Owen", "Alan Shearer", "Rivaldo", "Kaka", "Gianluigi Buffon", "Paolo Maldini",
	"Francesco Totti", "Alessandro Del Piero", "Andrea Pirlo", "Raul Gonzalez", "Fernando Torres",
	"Luis Suarez", "Sergio Aguero", "Angel Di Maria", "Antoine Griezmann", "Olivier Giroud",
	"Toni Kroos", "Thomas Muller", "Joshua Kimmich", "Bruno Fernandes", "Bernardo Silva",
	"Ruben Dias", "Alphonso Davies", "Romelu Lukaku", "Victor Osimhen", "Rafael Leao",
	"Declan Rice", "Cole Palmer", "Ollie Watkins", "Alisson", "Ederson",
	// Managers
	"Alex Ferguson", "Pep Guardiola", "Jose Mourinho", "Carlo Ancelotti", "Jurgen Klopp",
	"Arsene Wenger", "Jupp Heynckes", "Louis van Gaal", "Guus Hiddink", "Fabio Capello",
	"Marcello Lippi", "Vicente del Bosque", "Diego Simeone", "Mauricio Pochettino", "Thomas Tuchel",
	"Antonio Conte", "Massimiliano Allegri", "Zinedine Zidane", "Luis Enrique", "Gareth Southgate",
}

var denyClubs = []string{
	// England
	"Manchester United", "Manchester City", "Liverpool", "Arsenal", "Chelsea",
	"Tottenham Hotspur", "Everton", "Newcastle United", "Aston Villa", "Leeds United",
	"West Ham United", "Nottingham Forest", "Wolverhampton Wanderers", "Brighton",
	"Crystal Palace", "Fulham", "Brentford", "Southampton", "Leicester City", "Sunderland",
	// Spain
	"Real Madrid", "Barcelona", "Atletico Madrid", "Sevilla", "Valencia", "Athletic Bilbao",
	"Real Sociedad", "Real Betis", "Villarreal", "Espanyol", "Getafe", "Celta Vigo",
	// Italy
	"Juventus", "AC Milan", "Inter Milan", "Napoli", "Roma", "Lazio", "Fiorentina",
	"Atalanta", "Torino", "Bologna", "Genoa", "Sampdoria", "Parma", "Udinese",
	// Germany
	"Bayern Munich", "Borussia Dortmund", "RB Leipzig", "Bayer Leverkusen", "Eintracht Frankfurt",
	"Borussia Monchengladbach", "VfB Stuttgart", "VfL Wolfsburg", "Werder Bremen", "Schalke 04",
	// France
	"Paris Saint-Germain", "Marseille", "Lyon", "Monaco", "Lille", "Nice", "Rennes",
	"Saint-Etienne", "Bordeaux", "Nantes",
	// Rest of Europe
	"Ajax", "PSV Eindhoven", "Feyenoord", "Benfica", "FC Porto", "Sporting CP",
	"Celtic", "Rangers", "Galatasaray", "Fenerbahce", "Besiktas", "Olympiacos",
	"Red Star Belgrade", "Dinamo Zagreb", "Shakhtar Donetsk", "Club Brugge", "Anderlecht",
	// Americas
	"Flamengo", "Palmeiras", "Corinthians", "Sao Paulo", "Santos", "Boca Juniors",
	"River Plate", "Racing Club", "Independiente", "LA Galaxy", "Inter Miami", "Seattle Sounders",
	// Elsewhere
	"Al Hilal", "Al Nassr", "Al Ahly", "Zamalek", "Mamelodi Sundowns", "Kashima Antlers",
	"Urawa Red Diamonds", "Yokohama F. Marinos", "Melbourne Victory", "Sydney FC",
}

var (
	denySet     map[string]struct{}
	denyTokens  map[string]struct{}
	denyPhrases []string
	denyCount   int
)

func init() {
	denySet = make(map[string]struct{})
	denyTokens = make(map[string]struct{})
	for _, entry := range append(append([]string{}, denyPeople...), denyClubs...) {
		n := Normalize(entry)
		if n == "" {
			continue
		}
		if _, ok := denySet[n]; ok {
			continue
		}
		denySet[n] = struct{}{}
		denyCount++
		if strings.ContainsRune(n, ' ') {
			denyPhrases = append(denyPhrases, n)
			for _, tok := range strings.Fields(n) {
				if len(tok) >= 5 {
					denyTokens[tok] = struct{}{}
				}
			}
		}
	}
}

// Normalize folds a name to its matching form: lower-case, every run of
// non-alphanumeric characters becomes a single space, trimmed.
func Normalize(s string) string {
	var b strings.Builder
	prevSpace := true
	for _, r := range strings.ToLower(s) {
		if unicode.IsLetter(r) || unicode.IsDigit(r) {
			b.WriteRune(r)
			prevSpace = false
		} else if !prevSpace {
			b.WriteByte(' ')
			prevSpace = true
		}
	}
	return strings.TrimSpace(b.String())
}

// Denied reports whether a candidate name collides with the real-world
// deny-list under the matching rules described above.
func Denied(s string) bool {
	n := Normalize(s)
	if n == "" {
		return false
	}
	if _, ok := denySet[n]; ok {
		return true
	}
	if !strings.ContainsRune(n, ' ') {
		_, ok := denyTokens[n]
		return ok
	}
	for _, phrase := range denyPhrases {
		if strings.Contains(n, phrase) {
			return true
		}
	}
	return false
}

// DenylistSize is the number of distinct normalised entries on the list.
func DenylistSize() int { return denyCount }

// DenylistEntries returns the raw (un-normalised) entries, for tests/reports.
func DenylistEntries() []string {
	out := make([]string, 0, len(denyPeople)+len(denyClubs))
	out = append(out, denyPeople...)
	out = append(out, denyClubs...)
	return out
}
