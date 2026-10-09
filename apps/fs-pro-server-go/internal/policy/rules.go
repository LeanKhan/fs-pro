// Package policy is a literal port of apps/fs-pro-server/src/middleware/
// route-policy.ts: a table of who may call which route id, plus the guard that
// enforces it. Unlisted GETs are public and unlisted non-GETs are admin-only.
package policy

import "strings"

// Kind identifies a rule variant.
type Kind int

// Rule kinds. Public and Handler need no identity; the rest are checked in
// escalating order, with admins always allowed.
const (
	Public Kind = iota
	SignedIn
	Admin
	Handler
	Self
	Club
	Player
	Fixture
)

// Source is where a club ownership id comes from (param, body or query),
// mirroring route-policy.ts's param()/bodyField()/queryField().
type Source int

// Field sources.
const (
	SourceParam Source = iota
	SourceBody
	SourceQuery
)

// Rule is one entry of the policy table. Param names the path/route parameter
// for Self/Player/Fixture rules; Source+Field locate a Club id.
type Rule struct {
	Kind       Kind
	Param      string
	Source     Source
	Field      string
	Fields     []string
	AdminQuery []string
}

func selfRule(param string, fields ...string) Rule {
	return Rule{Kind: Self, Param: param, Fields: fields}
}

func clubParam(param string, fields ...string) Rule {
	return Rule{Kind: Club, Source: SourceParam, Field: param, Fields: fields}
}

func clubBody(field string) Rule {
	return Rule{Kind: Club, Source: SourceBody, Field: field}
}

func clubQuery(field string) Rule {
	return Rule{Kind: Club, Source: SourceQuery, Field: field}
}

func player(param string, fields ...string) Rule {
	return Rule{Kind: Player, Param: param, Fields: fields}
}

func fixture(param string, adminQuery ...string) Rule {
	return Rule{Kind: Fixture, Param: param, AdminQuery: adminQuery}
}

// Table is the ported POLICIES map (route-policy.ts lines 42-165), keyed by
// route id.
var Table = map[string]Rule{
	// Clubs.
	"clubs.updateClub":             clubParam("id", "Lineup", "Tactic"),
	"clubs.suggestLineup":          clubParam("id"),
	"clubs.recruitYouthPlayers":    clubParam("id"),
	"clubs.createClub":             {Kind: Admin},
	"clubs.deleteClub":             {Kind: Admin},
	"clubs.addPlayerToClub":        {Kind: Admin},
	"clubs.addManyPlayersToClub":   {Kind: Admin},
	"clubs.refreshAllClubsRatings": {Kind: Admin},
	"clubs.hireManager":            {Kind: Admin},
	"clubs.fireManager":            {Kind: Admin},
	"clubs.removePlayerFromClub":   {Kind: Admin},

	// Players.
	"players.updatePlayer":    player("id", "TrainingFocus"),
	"players.generatePlayers": {Kind: Admin},

	// Users.
	"users.joinUser":             {Kind: Public},
	"users.loginUser":            {Kind: Public},
	"users.enterSession":         {Kind: Public},
	"users.changePassword":       {Kind: SignedIn},
	"users.requestPasswordReset": {Kind: Public},
	"users.resetPassword":        {Kind: Public},
	"users.verifyEmail":          {Kind: Public},
	"users.resendVerification":   {Kind: SignedIn},
	"users.setEmail":             {Kind: SignedIn},
	"users.logoutUser":           selfRule("id"),
	"users.updateUser":           selfRule("id", "FullName", "Avatar", "Age", "Alerts"),
	"users.addClubsToUser":       {Kind: Admin},
	"users.addClubToUser":        {Kind: Admin},
	"users.removeClubFromUser":   selfRule("id"),

	// Game.
	"game.kickoffNew":     fixture("fixture", "simulate_rest"),
	"game.enqueueMatch":   {Kind: Admin},
	"game.createFriendly": clubBody("homeClubId"),

	// Transfers.
	"transfers.purchasePlayer":        clubBody("buyingClubId"),
	"transfers.placeBid":              clubBody("biddingClubId"),
	"transfers.respondToOffer":        clubBody("clubId"),
	"transfers.listPlayerForSale":     clubBody("clubId"),
	"transfers.scoutPlayerTransfer":   clubBody("clubId"),
	"transfers.requestBudgetIncrease": clubBody("clubId"),
	"transfers.getOffers":             clubQuery("clubId"),
	"transfers.setTransferWindow":     {Kind: Admin},

	// Program (all club-param).
	"program.getProgram":        clubParam("clubId"),
	"program.advanceProgram":    clubParam("clubId"),
	"program.dismissTip":        clubParam("clubId"),
	"program.tip":               clubParam("clubId"),
	"program.browseManagers":    clubParam("clubId"),
	"program.interviewManager":  clubParam("clubId"),
	"program.signManager":       clubParam("clubId"),
	"program.releaseManager":    clubParam("clubId"),
	"program.browsePlayers":     clubParam("clubId"),
	"program.scoutPlayer":       clubParam("clubId"),
	"program.signPlayer":        clubParam("clubId"),
	"program.requestLoan":       clubParam("clubId"),
	"program.getProgramChapter": clubParam("clubId"),

	// Handler-checked routes.
	"facilities.startUpgrade":         {Kind: Handler},
	"facilities.savePlacement":        {Kind: Handler},
	"facilities.squadRecovery":        {Kind: Handler},
	"facilities.treatPlayer":          {Kind: Handler},
	"play.playMatch":                  {Kind: Handler},
	"play.markInboxRead":              {Kind: Handler},
	"play.collectShop":                {Kind: Handler},
	"play.getMatchday":                {Kind: Handler},
	"play.bookMatch":                  {Kind: Handler},
	"play.getMatchPrep":               {Kind: Handler},
	"play.saveMatchPlan":              {Kind: Handler},
	"play.previewMatchPlan":           {Kind: Handler},
	"play.getInbox":                   {Kind: Handler},
	"editions.create":                 {Kind: Handler},
	"editions.action":                 {Kind: Handler},
	"editions.invite":                 {Kind: Handler},
	"editions.register":               {Kind: Handler},
	"editions.withdraw":               {Kind: Handler},
	"editions.setEntryPolicy":         {Kind: Handler},
	"challenges.propose":              {Kind: Handler},
	"challenges.respond":              {Kind: Handler},
	"challenges.setPolicy":            {Kind: Handler},
	"world.updateSettings":            {Kind: Handler},
	"world.endYear":                   {Kind: Handler},
	"world.advanceDay":                {Kind: Handler},
	"competitionDefinitions.validate": {Kind: Handler},
	"competitionDefinitions.create":   {Kind: Handler},
	"competitionDefinitions.update":   {Kind: Handler},
	"competitionDefinitions.archive":  {Kind: Handler},
	"atlas.listInvites":               {Kind: Handler},
	"atlas.createInvite":              {Kind: Handler},

	// Atlas / tiles / fixtures / players / managers / calendar / places.
	"atlas.foundCountry":      {Kind: Admin},
	"atlas.foundTown":         {Kind: Admin},
	"atlas.foundClub":         {Kind: SignedIn},
	"atlas.getPlacement":      {Kind: SignedIn},
	"atlas.getChrome":         {Kind: Public},
	"atlas.search":            {Kind: Public},
	"tiles.getTile":           {Kind: Public},
	"fixtures.deleteFixture":  {Kind: Admin},
	"players.createPlayer":    {Kind: Admin},
	"players.deletePlayer":    {Kind: Admin},
	"managers.createManager":  {Kind: Admin},
	"managers.updateManager":  {Kind: Admin},
	"managers.deleteManager":  {Kind: Admin},
	"calendar.deleteDay":      {Kind: Admin},
	"calendar.setClock":       {Kind: Admin},
	"calendar.tickClock":      {Kind: Admin},
	"calendar.healCalendar":   {Kind: Admin},
	"calendar.simulateToDate": {Kind: Admin},
	"places.importFromWorld":  {Kind: Admin},
	"places.syncFromWorld":    {Kind: Admin},
	"places.resolveAnchor":    {Kind: Admin},
	"places.updatePlace":      {Kind: Admin},
	"seasons.deleteSeason":    {Kind: Admin},
}

// RuleFor returns the rule for a route id, applying the default (GET public,
// otherwise admin) when the id is unlisted.
func RuleFor(routeID, method string) Rule {
	if r, ok := Table[routeID]; ok {
		return r
	}
	if strings.EqualFold(method, "GET") {
		return Rule{Kind: Public}
	}
	return Rule{Kind: Admin}
}
