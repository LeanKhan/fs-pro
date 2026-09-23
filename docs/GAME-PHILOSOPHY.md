# Direction update (2026-09-23): single-player first, in a shared world

The rest of this document still describes the core loop. This section settles the multiplayer question it left open.

**Spro is a single-player game in a world that can hold other humans.** You play in a world full of AI clubs that stands on its own with no other humans in it. Anyone who joins later just becomes another club in that same world. Adding multiplayer later won't require a rewrite.

Why this works:
- **Clash of Clans multiplayer is asynchronous.** The defender is never online; you play against a snapshot of their base. PLAY already works this way: matchmaking picks among the closest-power clubs and needs nobody on the other side.
- **The existing clubs *are* the world.** The old league clubs are the AI opponent pool, not something multiplayer forces us to delete. A human club is just a club with an owner in that pool. When someone plays against it, its own squad and tactics play the match, the same as for an AI club.
- **A "world" is one deployment.** One database is one world. If a second world is ever needed, it's a second instance, not sharding code.

Rules that follow from this:
1. **The zero-humans test.** Every feature must be fun if no other human ever shows up. If it only works with other players (leaderboards, alliances, live PvP), park it.
2. **The world must move without you.** AI clubs change over time on their own through transfers, upgrades, youth, retirements and form. A world where only your club changes feels dead in either mode. See [WORLD-THAT-REACTS.md](./WORLD-THAT-REACTS.md).
3. **Never assume one human club.** Keep ownership per club (`controllers/auth/club-access.ts`). Nothing global like "the user's club". This one rule keeps multiplayer possible later.
4. **Timers serve fun, not retention.** Clash of Clans uses long timers, cooldowns and energy to drive retention and monetization across a large player base. Here the main player is the developer. Put every timer on one tunable time scale and set it for good play, not for engagement metrics.

Deferred until there are other players: real-time head-to-head, alliances/social, anti-cheat, leaderboards, monetization.

---

Yes. I think this is a **much more coherent direction** for Spro.

The important shift is:

> **The match is no longer an activity inside the game. The match _is the primary interaction loop_.**

Clash of Clans has:

> build base → attack → earn resources → upgrade base → attack stronger opponents

Spro could have:

> **build club → play match → earn money/reputation → upgrade club → play stronger opponents**

### I would think about it as a **club RPG**

Not literally an RPG, but the progression philosophy is similar.

You don't ask:

> "Which league am I in?"

You ask:

> **"What level is my club, and what am I capable of?"**

A new player might begin with:

```text
SEGUN FC
Club Level: 0

Stadium        ★☆☆☆☆
Training       ★☆☆☆☆
Academy        ★☆☆☆☆
Medical        ★☆☆☆☆
Scouting       ★☆☆☆☆
Coaching       ★☆☆☆☆

Squad value    $80,000
Fans           120
Reputation     3
Cash           $10,000
```

Then their first objective isn't "get promoted."

It's something like:

> **WIN 3 MATCHES WITHIN 7 DAYS**
> Reward: $25,000 + 150 fans + Training Ground unlock

That is much more immediately understandable.

---

# The match becomes your "attack"

This is the part I think you should lean into heavily.

In Clash of Clans, you don't spend most of your time watching villagers walk around.

The **attack is the exciting thing**.

For Spro:

### Your club screen

```text
             SEGUN FC
       Level 4   ⭐ 182

       🏟 Stadium
       ⚽ Squad
       🧑‍🏫 Staff
       🏋 Training
       🔬 Academy
       🏥 Medical

             [ PLAY ]
```

You press **PLAY**.

Then:

```text
          MATCHMAKING

        Segun FC
           VS
       Abuja Lions

       ⚔ POWER 184
       ⚔ POWER 177

          [BATTLE]
```

Then the entire interface transforms into your **epic football battle**.

The stadium becomes the arena.

Players become your units.

Tactics become abilities.

Momentum becomes your battle state.

Goals become the equivalent of destroying a major defensive structure.

---

# But there's an important difference from Clash of Clans

I wouldn't make it:

> **Win = money, lose = nothing**

because then people will simply grind matches endlessly.

Instead, give matches **stakes**.

For example:

### Daily challenge

> Win 3 of your next 5 matches
> Reward: $40,000

### Tournament

> Enter: $5,000
> 8 clubs
> Winner: $50,000

### Rival battle

> Segun FC vs Garki United
> Winner gains rivalry reputation

### Promotion-style milestone

> Reach 1,000 Club XP
> Unlock Division 2 facilities

So the player always has **something they're trying to accomplish**.

---

# And this solves your "thousands of players" problem

This is probably the biggest advantage.

You don't actually need traditional leagues at all.

You can have:

```text
              SPRO WORLD
                  │
           MATCHMAKING POOL
                  │
       ┌──────────┼──────────┐
       ↓          ↓          ↓
    Battle      Battle      Battle
       │          │          │
   Human/AI    Human/AI    Human/AI
```

When you press **PLAY**, the system finds an appropriate opponent.

You could fight:

- another human who is online
- another human's club asynchronously
- an AI-controlled club
- a special event club
- a rival
- a tournament opponent

The opponent doesn't need to belong to your "league."

---

# This also makes the world simulation more powerful

Because **the club itself persists**.

Imagine I don't play for three days.

My club still exists.

My:

- stadium
- staff
- players
- finances
- academy
- reputation
- injuries
- rivalries
- transfer targets

continue existing.

But I don't need to simulate thousands of matches minute-by-minute.

When I come back:

> **3 things happened while you were away**

```text
⚽ Academy player promoted

💰 Stadium generated $4,200
   from events

🔥 Garki United challenged your club
   to a rivalry match
```

That's the Sims/Clash-of-Clans part.

---

# I also really like your "X wins in X time" idea

Because it creates **pressure**.

Instead of:

> "Upgrade your training ground for $20,000."

You get:

> ### CLUB CHALLENGE
>
> **Prove you're ready**
>
> Win **4 matches**
> within **72 hours**
>
> Reward:
> **$35,000**
>
> - Training Ground Lv. 1

Then:

```text
MATCH 1    ✅
MATCH 2    ❌
MATCH 3    ✅
MATCH 4    ⏳
MATCH 5    ⏳

              31:42:18
```

Suddenly the next match matters.

That's much closer to the **game-feel** you're describing.

---

# And I'd make upgrades change how you play

This is important.

Don't make facilities merely:

> Training Ground Lv 2 = +5% player stats.

That's boring.

Instead:

### Training Ground

Unlocks new training programs.

### Academy

Produces actual players.

### Scouting Department

Finds better opponents / transfer targets.

### Medical Centre

Reduces injury downtime.

### Stadium

Increases match revenue and unlocks bigger events.

### Coaching Staff

Unlocks tactical abilities.

For example:

**Level 0 coach**

```text
Pass
Shoot
Defend
```

**Level 3 coach**

```text
Pass
Through Ball
Press
Counter
Cross
Long Shot
```

**Level 8 coach**

```text
Overload Left
High Press
Offside Trap
False Nine
Quick Counter
Tactical Foul
...
```

Now **upgrading your club expands the match itself**.

That's a very strong loop.

---

# And this gives you a beautiful progression fantasy

A new player sees:

```text
         🏚️
      SEGUN FC

     80k squad
     120 fans
     0 reputation
```

After weeks:

```text
         🏟️
      SEGUN FC

     4.2m squad
     18k fans
     42 reputation

     Academy Lv 4
     Training Lv 5
     Stadium Lv 3
     Scouting Lv 4
```

Eventually:

```text
        🏟️🏟️🏟️
        SEGUN FC

      84m squad
      2.4m fans
      91 reputation

      WORLD CLUB
```

And the **same interaction remains**:

> **PLAY MATCH**

That's the piece I really like.

You don't need to bolt a traditional football-management game onto a Clash of Clans game.

You can make **football the battle system**, and everything else exists to make that battle deeper, more meaningful and more spectacular.

The next thing I'd explore is **exactly what happens during one of these battles** — from pressing `PLAY` → matchmaking → pre-match → tactical decisions → goal → victory/defeat → rewards → upgrade — because that will probably define the entire Spro experience.
