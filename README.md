<p align="center" width="100%">
    <img width="33%" src="https://fspro-cdn.sturves.tech/logo-new.png">
</p>

## FSPro Football Simulator

Pre general release version

FSPro is a football simulation game, still in progress but already you can:

- create seasons
- play matches
- argue with your brother about who _actually_ won the league...

─=≡Σ((( つ o3o)つ

This is a monorepo, combining the old [server](https://github.com/LeanKhan/fs-pro-server) and [client](https://github.com/LeanKhan/fs-pro-client) repos.

---

### Project top-level directory structure

```
apps
    ├── fs-pro-client                #  Webapp
    ├── fs-pro-server                #  Server and Game Engine

```

### To get started with FSPro

- You should have Docker installed to start the DB (or not, not necessary)
- Clone/Fork the repository locally
- Create the .env files in server and client root folders following their respective .env.example (include the database connection string here)
- Create the /assets directory in the root of apps/fs-pro-server and extract the contents of this zip file [FSPro Assets April 2024](https://drive.google.com/file/d/11AyWVmjn4uA0ImA1a3L_7KSR8NPHmlFb/view?usp=sharing) into it
- Install all dependencies, by running `npm i` in the root. We use npm >16
- When that's done, you can run `turbo build` then `turbo dev`
- FSPro should be running! Quick go to localhost:8080

### You can find sample data for your DB and information on how to play on our new docs site: https://fspro.sturves.tech/

## What's changed

See our [CHANGELOG.md](CHANGELOG.md).

## What's next?

**Core game loop (current focus)** - deepening Manager mode, then adding Owner mode on top:

- A real transfer market - today there's only a `TransferHistory` log and manual roster add/remove, no buy/sell offers, AI-driven activity, or transfer windows
- Contracts, wages, and player training/development
- Morale and Injury systems - modeling "match dynamic" incidents beyond cards
- A human-facing control for mid-match tactic changes (the engine already supports changing tactics mid-match, there's just no UI trigger for it yet)
- Owner mode: a new layer on top of Manager mode - finances, stadium, hiring/firing a manager, sponsorships, reputation

**Game engine:**

- Keep closing realism gaps - shots, tackles, and fouls per match are still a bit low against real-world reference ranges (see `scripts/simRealismCheck.ts`)
- Reshuffle a team's shape after a red card instead of just leaving the gap
- Handle a sent-off goalkeeper

**Frontend:**

- Revamp the client off Vuetify - it currently looks and feels like a generic enterprise admin panel, not a game. Direction is headless UI (unstyled, accessible primitives) plus custom styling, converted screen-by-screen the same way Matchzone's core view was already redone in plain HTML/CSS

**Other:**

- General refactorings
- Allow any clubs and any leagues. Right now, clubs and leagues are hardcoded. This should change...
- Uploadable/custom tactics
- A parked, longer-term idea: a "world builder" flow (create a country → league → club, all via click-to-drill-down) - shelved until the core loop above is solid

Full detail on all of the above (and other smaller deferred items) lives in [FUTURE-PLANS.md](FUTURE-PLANS.md).

... lots of other things. I'd like to host this in the medium future. But not sure how that would look from an architectural standpoint, let's discuss if you have ideas.

We are open to any kind of contributions whether it's code, tips, suggestions, designs etc. We dey!

## Licensing

### Code

The code in this repository is licensed under the [MIT License](LICENSE).

### Images

Images such as club logos, player kits and any FSPro Brand assets are licensed under the [Creative Commons Attribution 4.0 International License](IMAGES_LICENSE.md). Meaning you can use them however you want, but it'll be nice if you point back to us >.<

### Club Names, Places, People

Not licensed but attribute :)
