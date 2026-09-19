<template>
  <div class="matchzone">
    <header class="mz-header">
      <button class="mz-close" @click="router.push('/u')" title="Close">
        ✕
      </button>

      <div class="mz-title">
        MATCHZONE
        <span v-if="lastMatchOfSeason || fixture.isFinalMatch" class="mz-chip">
          LAST MATCH
        </span>
        <span v-if="simulateRest" class="mz-chip mz-chip-accent">
          simulation
        </span>
      </div>

      <div class="mz-header-actions">
        <label class="mz-checkbox">
          <input type="checkbox" v-model="simulateRest" />
          Simulate Rest
        </label>

        <button
          v-if="matchFinished && !lastMatchOfSeason"
          class="mz-action-btn"
          @click="router.push('/u')"
        >
          FINISH MATCH
        </button>

        <button
          v-else-if="matchFinished && lastMatchOfSeason"
          class="mz-action-btn mz-action-accent"
          @click="finishSeason"
        >
          &lt; FINISH SEASON &gt;
        </button>
      </div>
    </header>

    <div v-if="!fixture.HomeTeam" class="mz-loading-screen">
      Loading match...
    </div>

    <div v-else class="mz-body">
      <main class="mz-main">
        <div class="mz-pitch-wrap">
          <div class="mz-floodlight mz-floodlight-tl"></div>
          <div class="mz-floodlight mz-floodlight-tr"></div>
          <div class="mz-floodlight mz-floodlight-bl"></div>
          <div class="mz-floodlight mz-floodlight-br"></div>

          <div v-if="liveWatching || liveFrame" class="mz-playback-controls">
            <div class="mz-clock-pill">
              ⏱️ {{ liveFrame?.minute ?? 0 }}'
            </div>
            <button class="mz-ctrl-btn" @click="togglePause">
              {{ isPaused ? '▶️ RESUME' : '⏸️ PAUSE' }}
            </button>
            <div class="mz-speed-group">
              <button
                v-for="spd in [1, 2, 4]"
                :key="spd"
                class="mz-speed-btn"
                :class="{ active: playSpeed === spd }"
                @click="playSpeed = spd"
              >
                {{ spd }}x
              </button>
            </div>
          </div>

          <live-pitch
            :frame="liveFrame"
            :home="liveHome"
            :away="liveAway"
            :players="playersById"
          ></live-pitch>

          <event-banner :banner="activeBanner"></event-banner>

          <!-- Full-Time Match Review Overlay -->
          <div
            v-if="matchFinished && !liveWatching && showReviewOverlay"
            class="mz-review-overlay"
          >
            <div class="mz-review-card">
              <div class="mz-review-badge-bar">
                <span class="mz-review-pill">FULL TIME MATCH REVIEW</span>
                <button class="mz-review-toggle-btn" @click="showReviewOverlay = false">
                  👁️ Inspect Pitch
                </button>
              </div>

              <!-- Scoreboard -->
              <div class="mz-review-score-grid">
                <div class="mz-review-team-box">
                  <v-avatar size="52" tile class="mb-1">
                    <v-icon size="44">custom:{{ fixture.Home }}</v-icon>
                  </v-avatar>
                  <div class="mz-review-team-name">{{ fixture.HomeTeam?.Name }}</div>
                  <div class="mz-review-team-sub">HOME</div>
                </div>

                <div class="mz-review-score-box">
                  <div class="mz-review-big-score">
                    {{ displayHomeScore }} : {{ displayAwayScore }}
                  </div>
                  <div v-if="fixture.Stadium" class="mz-review-venue">
                    {{ fixture.Stadium }}
                  </div>
                  <div v-if="fixture.Details?.Attendance" class="mz-review-attendance">
                    Att: {{ Number(fixture.Details.Attendance).toLocaleString() }}
                  </div>
                </div>

                <div class="mz-review-team-box">
                  <v-avatar size="52" tile class="mb-1">
                    <v-icon size="44">custom:{{ fixture.Away }}</v-icon>
                  </v-avatar>
                  <div class="mz-review-team-name">{{ fixture.AwayTeam?.Name }}</div>
                  <div class="mz-review-team-sub">AWAY</div>
                </div>
              </div>

              <!-- Key Match Events / Goal Scorers -->
              <div v-if="goalScorers.length" class="mz-review-goals-section">
                <div class="mz-review-goals-title">⚽ KEY MATCH EVENTS</div>
                <div class="mz-review-goals-list">
                  <div v-for="(g, idx) in goalScorers" :key="idx" class="mz-review-goal-chip">
                    <span class="font-weight-bold">{{ g.time }}'</span>
                    <span class="ml-1">{{ g.message }}</span>
                  </div>
                </div>
              </div>

              <!-- Quick Match Stats Comparison -->
              <div v-if="matchStatsComparison.length" class="mz-review-stats-section">
                <div v-for="(st, i) in matchStatsComparison" :key="i" class="mz-review-stat-row">
                  <span class="mz-stat-val mz-stat-home">{{ st.homeVal }}</span>
                  <div class="mz-stat-bar-col">
                    <div class="mz-stat-label">{{ st.label }}</div>
                    <div class="mz-stat-bar-track">
                      <div class="mz-stat-bar-fill-home" :style="{ width: st.homePct + '%' }"></div>
                      <div class="mz-stat-bar-fill-away" :style="{ width: st.awayPct + '%' }"></div>
                    </div>
                  </div>
                  <span class="mz-stat-val mz-stat-away">{{ st.awayVal }}</span>
                </div>
              </div>

              <!-- Actions: Replay & Pitch inspection -->
              <div class="mz-review-actions-bar">
                <button class="mz-action-btn mz-action-accent mz-replay-action" @click="watchReplay">
                  ▶️ WATCH 2D REPLAY
                </button>
              </div>
            </div>
          </div>

          <!-- Floating button to reopen review overlay if closed -->
          <button
            v-if="matchFinished && !liveWatching && !showReviewOverlay"
            class="mz-reopen-review-btn"
            @click="showReviewOverlay = true"
          >
            📊 Match Review
          </button>

          <div v-if="!resultsReady" class="mz-pitch-overlay">
            {{ overlayText }}
          </div>
        </div>
      </main>

      <aside class="mz-sidebar">
        <div class="mz-teams-card">
          <club-widget
            :winner="winner"
            :clubName="fixture.HomeTeam.Name"
            :clubCode="fixture.Home"
            :isHome="true"
            :rating="fixture.HomeTeam.Rating"
            :clubStandings="homeStandings"
            :manager="fixture.HomeTeam.Manager"
          ></club-widget>

          <div class="mz-score">
            <div class="mz-score-row">
              <span>{{ displayHomeScore }}</span>
              <span class="mz-score-sep">:</span>
              <span>{{ displayAwayScore }}</span>
            </div>

            <button
              v-if="!allReady && !matchFinished"
              class="mz-start-btn"
              @click="openLobby = true"
            >
              START
            </button>

            <button
              v-else-if="matchFinished && !liveWatching"
              class="mz-start-btn"
              @click="watchReplay"
            >
              WATCH REPLAY
            </button>
          </div>

          <club-widget
            :winner="winner"
            :clubName="fixture.AwayTeam.Name"
            :clubCode="fixture.Away"
            :isHome="false"
            :rating="fixture.AwayTeam.Rating"
            :clubStandings="awayStandings"
            :manager="fixture.AwayTeam.Manager"
          ></club-widget>
        </div>

        <div class="mz-fixture-meta d-flex justify-space-between align-center px-3 py-1">
          <div>
            {{ fixture.SeasonCode }} - {{ fixture.Title }}
            <span v-if="fixture.Stadium">- {{ fixture.Stadium }}</span>
          </div>
          <div v-if="!matchFinished" class="d-flex align-center">
            <v-checkbox
              v-model="simulateRest"
              label="Auto-advance day (sim other matches)"
              density="compact"
              hide-details
              color="amber-lighten-2"
            />
          </div>
        </div>

        <div class="mz-dugout">
          <dugout
            :home="fixture.HomeTeam"
            :away="fixture.AwayTeam"
            :homeSquad="mappedHomeSquad"
            :awaySquad="mappedAwaySquad"
            :match="fixture"
            :matchFinished="matchFinished"
            :dayFixtures="dayFixtures"
            :currentFixture="fixture._id"
            :liveEvents="liveEvents"
            @match-selected="matchSelected"
            @tactic-changed="onTacticChanged"
            @sub-requested="onSubRequested"
          ></dugout>
        </div>
      </aside>
    </div>

    <game-lobby
      v-if="fixture.HomeTeam && fixture.AwayTeam"
      v-model:show="openLobby"
      @all-ready="ready"
      :home="{ Name: fixture.HomeTeam.Name, ClubCode: fixture.Home }"
      :away="{ Name: fixture.AwayTeam.Name, ClubCode: fixture.Away }"
    ></game-lobby>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import ClubWidget from '@/components/matchzone/club.vue';
import GameLobby from '@/components/matchzone/game-lobby.vue';
import LivePitch from '@/components/matchzone/live-pitch.vue';
import EventBanner from '@/components/matchzone/event-banner.vue';
import { Dugout } from '@/components/matchzone/widgets';
import { client } from '@/services/api';
import { MatchReplaySocket, IMatchFrame } from '@/utils/matchReplaySocket';

const router = useRouter();
const route = useRoute();

defineOptions({
  name: 'MatchZone',
});

const whistle = ref<HTMLAudioElement>();
const fixture = ref<any>({});
const dayFixtures = ref<any[]>([]);
const allReady = ref(false);
const openLobby = ref(false);
const kickoffTimer = ref(0);
const starting = ref(false);
const lastMatchOfSeason = ref(false);
const standings = ref<any>(null);
const simulateRest = ref(true);

const replaySocket = new MatchReplaySocket();
const liveWatching = ref(false);
const liveFrame = ref<IMatchFrame | null>(null);
// True once the kickoff-new HTTP call has actually returned a result -
// gates revealing the (already quietly progressing, in the background)
// live pitch, so the loading state stays up until results are gotten
// rather than showing frames the instant they start trickling in.
const resultsReady = ref(true);
const liveHomeScore = ref(0);
const liveAwayScore = ref(0);
const liveEvents = ref<any[]>([]);
const overlayText = ref('Simulating...');
const activeBanner = ref<{ type: 'goal' | 'substitution'; message: string } | null>(
  null
);
let bannerTimer: ReturnType<typeof setTimeout> | null = null;

const isPaused = ref(false);
const playSpeed = ref(1);

function togglePause() {
  isPaused.value = !isPaused.value;
}

function onTacticChanged(style: string) {
  if (bannerTimer) clearTimeout(bannerTimer);
  activeBanner.value = {
    type: 'substitution',
    message: `TACTIC SHIFT: ${style.toUpperCase()}`,
  };
  bannerTimer = setTimeout(() => {
    activeBanner.value = null;
  }, 2800);
}

function onSubRequested(player: any) {
  if (bannerTimer) clearTimeout(bannerTimer);
  activeBanner.value = {
    type: 'substitution',
    message: `SUB: ${player.FirstName} ${player.LastName} ready to enter!`,
  };
  bannerTimer = setTimeout(() => {
    activeBanner.value = null;
  }, 3200);
}

const liveHome = computed(() => ({
  name: fixture.value.HomeTeam?.Name,
  code: fixture.value.Home,
}));
const liveAway = computed(() => ({
  name: fixture.value.AwayTeam?.Name,
  code: fixture.value.Away,
}));

// id -> squad info, so the live pitch's hover tooltip can show a name/
// rating without that data needing to travel on every single frame.
const playersById = computed(() => {
  const map: Record<
    string,
    { FirstName: string; LastName: string; Rating: number }
  > = {};
  const allPlayers = [
    ...(fixture.value.HomeTeam?.Players || []),
    ...(fixture.value.AwayTeam?.Players || []),
  ];
  allPlayers.forEach((p: any) => {
    map[p._id] = {
      FirstName: p.FirstName,
      LastName: p.LastName,
      Rating: p.Rating,
    };
  });
  return map;
});

const winner = computed(() => {
  if (
    fixture.value &&
    fixture.value.HomeSideDetails &&
    fixture.value.AwaySideDetails
  ) {
    return fixture.value.HomeSideDetails.Won &&
      !fixture.value.AwaySideDetails.Won
      ? 'home'
      : 'away';
  }
  return 'draw';
});

const fixtureId = computed(() => route.params.fixture);

const AwayTeamScore = computed(() => {
  if (!fixture.value.Details) return null;
  return fixture.value.Details.AwayTeamScore;
});

const HomeTeamScore = computed(() => {
  if (!fixture.value.Details) return null;
  return fixture.value.Details.HomeTeamScore;
});

// Before the match is marked Played, show the score as tallied live from
// the frame-stream's goal events instead of the final Details score (which
// only exists once the whole match has finished and been persisted).
const displayHomeScore = computed(() =>
  matchFinished.value ? (HomeTeamScore.value ?? 0) : liveHomeScore.value
);
const displayAwayScore = computed(() =>
  matchFinished.value ? (AwayTeamScore.value ?? 0) : liveAwayScore.value
);
const matchFinished = computed(() => fixture.value.Played);

const showReviewOverlay = ref(true);

const goalScorers = computed(() => {
  const events = fixture.value?.Events || [];
  return events
    .filter((e: any) => e.type === 'goal')
    .map((e: any) => ({
      time: e.time ?? e.minute ?? 0,
      message: e.message || 'Goal scored',
    }));
});

const matchStatsComparison = computed(() => {
  const home = fixture.value?.HomeSideDetails;
  const away = fixture.value?.AwaySideDetails;
  if (!home || !away) return [];

  const items = [
    { label: 'Possession', h: Number(home.Possession || 50), a: Number(away.Possession || 50), unit: '%' },
    { label: 'Shots on Target', h: Number(home.ShotsOnTarget || 0), a: Number(away.ShotsOnTarget || 0), unit: '' },
    { label: 'Total Shots', h: Number(home.Shots || 0), a: Number(away.Shots || 0), unit: '' },
    { label: 'Fouls', h: Number(home.Fouls || 0), a: Number(away.Fouls || 0), unit: '' },
  ];

  return items.map((it) => {
    const total = (it.h + it.a) || 1;
    const homePct = Math.round((it.h / total) * 100);
    const awayPct = 100 - homePct;
    return {
      label: it.label,
      homeVal: it.unit ? `${it.h}${it.unit}` : it.h,
      awayVal: it.unit ? `${it.a}${it.unit}` : it.a,
      homePct,
      awayPct,
    };
  });
});

const mappedHomeSquad = computed(() => {
  if (matchFinished.value && fixture.value.HomeSideDetails.PlayerStats) {
    return fixture.value.HomeTeam.Players.map((p: any) => ({
      ...p,
      stats: fixture.value.HomeSideDetails.PlayerStats.find(
        (s: any) => p._id == s.Player
      ),
    }));
  }
  return fixture.value.HomeTeam.Players;
});

const mappedAwaySquad = computed(() => {
  if (matchFinished.value && fixture.value.AwaySideDetails.PlayerStats) {
    return fixture.value.AwayTeam.Players.map((p: any) => ({
      ...p,
      stats: fixture.value.AwaySideDetails.PlayerStats.find(
        (s: any) => p._id == s.Player
      ),
    }));
  }
  return fixture.value.AwayTeam.Players;
});

const homeStandings = computed(() => {
  if (!standings.value) {
    return { position: 0, standing: null };
  }
  const position =
    standings.value.findIndex((c: any) => fixture.value.Home == c.ClubCode) + 1;
  return { position, standing: standings.value[position - 1] };
});

const awayStandings = computed(() => {
  if (!standings.value) {
    return { position: 0, standing: null };
  }
  const position =
    standings.value.findIndex((c: any) => fixture.value.Away == c.ClubCode) + 1;
  return { position, standing: standings.value[position - 1] };
});

/** Flashes a transient celebration/announcement banner over the pitch for
 * the first goal/substitution event in a frame - only one at a time (a
 * frame with both would be rare and the goal is the more important one to
 * show). Cleared automatically after a few seconds, or replaced immediately
 * if another event of interest arrives first. */
function maybeShowEventBanner(events?: { type: string; message: string }[]) {
  const event = events?.find((e) => e.type === 'goal' || e.type === 'substitution');
  if (!event) return;

  if (bannerTimer) clearTimeout(bannerTimer);
  activeBanner.value = { type: event.type as 'goal' | 'substitution', message: event.message };
  bannerTimer = setTimeout(
    () => {
      activeBanner.value = null;
    },
    event.type === 'goal' ? 3200 : 2600
  );
}

function ready() {
  openLobby.value = false;
  allReady.value = true;
  starting.value = true;
  playGame();
}

function timer() {
  let left = 0;
  const t = setInterval(() => {
    if (left > 3) {
      clearInterval(t);
    }
    kickoffTimer.value = 3 - left;
    left += 1;
  }, 1000);
}

async function getFixture() {
  try {
    // `populate` used to be sent here, but the server route has always
    // ignored it (getFixtureById is called with a fixed `{withClub: true}`
    // regardless) - dropped rather than ported, since the contract only
    // declares the params it actually reads.
    const response = await client.fixtures.getFixture.query({
      params: { id: String(fixtureId.value) },
    });

    if (response.status !== 200) {
      throw new Error(response.body.message);
    }

    fixture.value = response.body.payload;

    if (response.body.payload.isFinalMatch && response.body.payload.Played) {
      console.log('Is Final Match! Finish Season :)');
      lastMatchOfSeason.value = true;
    }

    getStandings();
  } catch (error) {
    console.error('Error initiating game:', error);
  } finally {
    starting.value = false;
  }
}

function finishSeason() {
  const ans = confirm(
    'Season is over hurray!\nEnd Season now... you must say okay.'
  );
  if (!ans) return;
  router.push(`/finish/season/${fixture.value.SeasonId}`);
}

async function playGame() {
  timer();
  whistle.value?.play();

  overlayText.value = 'Simulating...';
  const params: { simulate_rest?: boolean; send_other_results?: boolean } = {};
  if (simulateRest.value) {
    params.simulate_rest = true;
    params.send_other_results = false;
  }

  resultsReady.value = false;
  liveHomeScore.value = 0;
  liveAwayScore.value = 0;
  liveEvents.value = [];

  // Join the fixture's live-replay room before triggering kickoff - there's
  // no catch-up buffer for late joiners, so this must happen first. If the
  // socket can't connect, fall back to today's instant-reveal behavior
  // rather than waiting on a replay that will never arrive.
  let watchingLive = true;
  try {
    await replaySocket.watch(String(fixtureId.value));
  } catch (error) {
    console.error(
      'Error connecting to live match replay, falling back:',
      error
    );
    watchingLive = false;
  }

  if (watchingLive) {
    liveFrame.value = null;
    liveWatching.value = true;
    replaySocket.onFrame((frame) => {
      liveFrame.value = frame;

      if (frame.events?.length) {
        liveEvents.value.push(...frame.events);
        maybeShowEventBanner(frame.events);
      }

      // Tally the score live from goal events as they stream in, rather
      // than waiting for the final Details once the match is fully over.
      frame.events?.forEach((ev) => {
        if (ev.type !== 'goal') return;
        if (ev.playerTeamID === fixture.value.Home) liveHomeScore.value++;
        else if (ev.playerTeamID === fixture.value.Away) liveAwayScore.value++;
      });
    });
  }

  const applyResult = (main: any) => {
    const { match, HomeSideDetails, AwaySideDetails } = main;
    fixture.value = {
      ...fixture.value,
      ...match,
      HomeTeam: fixture.value.HomeTeam,
      AwayTeam: fixture.value.AwayTeam,
      HomeSideDetails,
      AwaySideDetails,
    };
    lastMatchOfSeason.value = main.lastMatchOfSeason;
    getStandings();
    getFixtureDay();
    liveWatching.value = false;
    starting.value = false;
  };

  try {
    const response = await client.game.kickoffNew.query({
      params: { fixture: String(fixtureId.value) },
      query: params,
    });

    if (response.status !== 200) {
      throw new Error(response.body.message);
    }

    let main: any = response.body.payload;
    if ('main' in response.body.payload && response.body.payload.main) {
      main = response.body.payload.main;
    }

    // Results are in - reveal the pitch (which has been quietly tracking
    // frames in the background since watchingLive started above).
    resultsReady.value = true;

    if (watchingLive) {
      // Hold the full reveal (score/timeline/MOTM) until the paced replay
      // actually finishes, rather than spoiling it the moment this (much
      // faster) HTTP call resolves.
      replaySocket.onReplayEnd(() => applyResult(main));
    } else {
      applyResult(main);
    }
  } catch (error) {
    console.error('Error playing match:', error);
    resultsReady.value = true;
    liveWatching.value = false;
    starting.value = false;
  }
}

/**
 * Re-streams a finished match's already-simulated Frames from the server
 * (see GET /game/replay/:fixture) over the same /match-replay socket room
 * playGame() uses for a live watch - no new simulation runs, and the final
 * score/timeline (already loaded via getFixture) stay untouched throughout,
 * since matchFinished is already true.
 */
async function watchReplay() {
  if (liveWatching.value) return;

  showReviewOverlay.value = false;
  overlayText.value = 'Loading replay...';
  liveFrame.value = null;
  resultsReady.value = false;

  // Fresh socket per attempt - MatchReplaySocket has no listener-removal
  // API, so reusing one across rewatches would stack duplicate handlers.
  replaySocket.disconnect();

  try {
    await replaySocket.watch(String(fixtureId.value));
  } catch (error) {
    console.error('Error connecting to match replay:', error);
    resultsReady.value = true;
    showReviewOverlay.value = true;
    return;
  }

  liveWatching.value = true;
  replaySocket.onFrame((frame) => {
    liveFrame.value = frame;
    resultsReady.value = true;
    if (frame.events?.length) maybeShowEventBanner(frame.events);
  });
  replaySocket.onReplayEnd(() => {
    liveWatching.value = false;
    showReviewOverlay.value = true;
  });

  try {
    await client.game.rewatchMatch.query({
      params: { fixture: String(fixtureId.value) },
    });
  } catch (error) {
    console.error('Error starting match replay:', error);
    resultsReady.value = true;
    liveWatching.value = false;
    showReviewOverlay.value = true;
    alert('No replay is available for this match.');
  }
}

async function getFixtureDay() {
  // Friendlies are season-less Fixtures with no ScheduledDay to look up.
  if (fixture.value.Type === 'friendly' || fixture.value.ScheduledDay == null) {
    return;
  }

  try {
    const response = await client.fixtures.getFixtures.query({
      query: { scheduledDay: fixture.value.ScheduledDay },
    });
    if (response.status === 200) {
      dayFixtures.value = response.body.payload;
    }
  } catch (error) {
    console.error('Error fetching fixtures for this day:', error);
  }
}

async function getStandings() {
  // Real Fixtures carry `SeasonId`, never `Season` - this check always
  // failed silently before (fixture.value is loosely typed `any`, so the
  // typo never surfaced as a build error), meaning getStandings() was a
  // permanent no-op.
  if (fixture.value.SeasonId) {
    try {
      const response = await client.seasons.getSeasonStandings.query({
        params: { id: fixture.value.SeasonId },
      });
      if (response.status === 200) {
        standings.value = response.body.payload;
      }
    } catch (error) {
      console.error('Error fetching Standings:', error);
    }
  }
}

async function matchSelected(match: any) {
  if (match?._id) {
    await router.push(`/matchzone/${match._id}`);
  }
}

async function initializeGame() {
  // Reset any live-watch state from a previously watched fixture before
  // loading a new one (e.g. jumping between fixtures via the Dugout).
  replaySocket.disconnect();
  liveWatching.value = false;
  liveFrame.value = null;
  resultsReady.value = true;
  showReviewOverlay.value = true;
  liveHomeScore.value = 0;
  liveAwayScore.value = 0;
  liveEvents.value = [];
  overlayText.value = 'Simulating...';
  if (bannerTimer) clearTimeout(bannerTimer);
  activeBanner.value = null;

  await getFixture();
  await getFixtureDay();
}

onMounted(() => {
  whistle.value = new Audio('../../assets/sounds/whistle1.mp3');
  initializeGame();
});

onUnmounted(() => {
  replaySocket.disconnect();
  if (bannerTimer) clearTimeout(bannerTimer);
});

watch(fixtureId, () => {
  initializeGame();
});
</script>

<style scoped>
.matchzone {
  height: 100vh;
  background: #0c1710;
  color: #eef3ec;
  font-family: 'IBM Plex Mono', monospace;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.mz-header {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 8px 16px;
  background: #12241a;
  border-bottom: 1px solid #23392c;
}
.mz-close {
  background: transparent;
  border: 1px solid #23392c;
  color: #eef3ec;
  border-radius: 6px;
  width: 28px;
  height: 28px;
  cursor: pointer;
}
.mz-title {
  font-weight: 700;
  letter-spacing: 0.06em;
  font-size: 13px;
  display: flex;
  align-items: center;
  gap: 8px;
}
.mz-chip {
  font-size: 10px;
  padding: 2px 8px;
  border-radius: 10px;
  background: #23392c;
}
.mz-chip-accent {
  background: #e9b34a;
  color: #12241a;
}
.mz-header-actions {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 12px;
}
.mz-checkbox {
  display: flex;
  align-items: center;
  gap: 4px;
  opacity: 0.75;
}
.mz-action-btn {
  background: transparent;
  border: 1px solid #e9b34a;
  color: #eef3ec;
  border-radius: 6px;
  padding: 6px 14px;
  font-weight: 700;
  font-size: 12px;
  cursor: pointer;
}
.mz-action-accent {
  background: #22c55e;
  border-color: #22c55e;
  color: #0c1710;
}

.mz-loading-screen {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0.6;
}

.mz-body {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 12px;
  padding: 12px;
}

.mz-main {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: auto;
  position: relative;
  /* Stylized stadium backdrop (no photographic assets exist for this) - a
   * dark concourse tone plus a faint dotted "crowd in the stands" texture
   * receding from the pitch, and a vignette so the pitch itself stays the
   * visual focus. */
  background:
    radial-gradient(
      ellipse at center,
      rgba(12, 23, 16, 0) 0%,
      rgba(6, 13, 9, 0.6) 72%,
      rgba(4, 9, 6, 0.92) 100%
    ),
    repeating-radial-gradient(
      circle at 20% 30%,
      rgba(238, 243, 236, 0.05) 0px,
      rgba(238, 243, 236, 0.05) 1px,
      transparent 1px,
      transparent 7px
    ),
    #0a1710;
}

.mz-pitch-wrap {
  position: relative;
  width: 100%;
  max-width: 640px;
  margin: 0 auto;
}

.mz-floodlight {
  position: absolute;
  width: 140px;
  height: 140px;
  border-radius: 50%;
  pointer-events: none;
  z-index: 1;
  background: radial-gradient(
    circle,
    rgba(255, 247, 214, 0.35) 0%,
    rgba(255, 247, 214, 0.12) 40%,
    transparent 72%
  );
  animation: mz-flicker 5s ease-in-out infinite;
}
.mz-floodlight-tl {
  top: -60px;
  left: -60px;
}
.mz-floodlight-tr {
  top: -60px;
  right: -60px;
  animation-delay: 1.2s;
}
.mz-floodlight-bl {
  bottom: -60px;
  left: -60px;
  animation-delay: 2.4s;
}
.mz-floodlight-br {
  bottom: -60px;
  right: -60px;
  animation-delay: 3.6s;
}

@keyframes mz-flicker {
  0%,
  100% {
    opacity: 0.75;
  }
  50% {
    opacity: 1;
  }
}
.mz-pitch-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(12, 23, 16, 0.55);
  font-size: 16px;
  font-weight: 700;
  letter-spacing: 0.04em;
}

.mz-sidebar {
  width: 340px;
  flex-shrink: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.mz-teams-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  background: #12241a;
  border: 1px solid #23392c;
  border-radius: 8px;
  padding: 12px;
  flex-shrink: 0;
}
.mz-score {
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}
.mz-score-row {
  display: flex;
  flex-direction: row;
  align-items: baseline;
  gap: 6px;
  font-size: 24px;
  font-weight: 700;
}
.mz-score-sep {
  opacity: 0.5;
}
.mz-start-btn {
  font-size: 11px;
  font-weight: 700;
  background: #22c55e;
  color: #0c1710;
  border: none;
  border-radius: 6px;
  padding: 6px 14px;
  cursor: pointer;
}

.mz-fixture-meta {
  text-align: center;
  font-size: 10px;
  opacity: 0.55;
  flex-shrink: 0;
}

.mz-dugout {
  flex: 1;
  min-height: 0;
  background: #12241a;
  border: 1px solid #23392c;
  border-radius: 8px;
  padding: 10px 12px;
  overflow-y: auto;
}

@media (max-width: 860px) {
  .mz-body {
    flex-direction: column;
    overflow-y: auto;
  }
  .matchzone {
    height: auto;
    min-height: 100vh;
    overflow: visible;
  }
  .mz-sidebar {
    width: 100%;
  }
}

.mz-playback-controls {
  position: absolute;
  top: 12px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 8px;
  background: rgba(15, 23, 42, 0.85);
  backdrop-filter: blur(8px);
  padding: 6px 12px;
  border-radius: 20px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  z-index: 100;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
}

.mz-clock-pill {
  font-size: 12px;
  font-weight: 800;
  color: #ffeb3b;
  letter-spacing: 0.05em;
  padding-right: 6px;
  border-right: 1px solid rgba(255, 255, 255, 0.2);
}

.mz-ctrl-btn {
  background: #2563eb;
  color: white;
  border: none;
  font-size: 11px;
  font-weight: 700;
  padding: 4px 10px;
  border-radius: 12px;
  cursor: pointer;
  transition: background 0.2s;
}
.mz-ctrl-btn:hover {
  background: #1d4ed8;
}

.mz-speed-group {
  display: flex;
  gap: 3px;
}

.mz-speed-btn {
  background: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.8);
  border: none;
  font-size: 10px;
  font-weight: 700;
  padding: 3px 6px;
  border-radius: 8px;
  cursor: pointer;
}
.mz-speed-btn.active {
  background: #ffeb3b;
  color: black;
}

/* --- Full Time Match Review Overlay --- */
.mz-review-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(10, 18, 14, 0.88);
  backdrop-filter: blur(8px);
  z-index: 95;
  padding: 20px;
}

.mz-review-card {
  width: 100%;
  max-width: 580px;
  background: linear-gradient(180deg, #162a1e 0%, #0d1912 100%);
  border: 1px solid #2e4d3b;
  border-radius: 12px;
  padding: 16px 20px;
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.7);
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.mz-review-badge-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.mz-review-pill {
  font-size: 11px;
  font-weight: 900;
  letter-spacing: 0.1em;
  color: #22c55e;
  background: rgba(34, 197, 94, 0.15);
  border: 1px solid rgba(34, 197, 94, 0.35);
  padding: 3px 10px;
  border-radius: 20px;
}

.mz-review-toggle-btn {
  background: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.8);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 12px;
  font-size: 11px;
  padding: 3px 10px;
  cursor: pointer;
  transition: all 0.2s;
}
.mz-review-toggle-btn:hover {
  background: rgba(255, 255, 255, 0.2);
  color: white;
}

.mz-review-score-grid {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: rgba(0, 0, 0, 0.25);
  border-radius: 10px;
  padding: 12px 16px;
  border: 1px solid rgba(255, 255, 255, 0.06);
}

.mz-review-team-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 120px;
  text-align: center;
}

.mz-review-team-name {
  font-size: 12px;
  font-weight: 700;
  color: #ffffff;
  line-height: 1.2;
  margin-top: 4px;
}

.mz-review-team-sub {
  font-size: 9px;
  color: rgba(255, 255, 255, 0.45);
  letter-spacing: 0.05em;
  margin-top: 2px;
}

.mz-review-score-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}

.mz-review-big-score {
  font-size: 38px;
  font-weight: 900;
  color: #ffeb3b;
  letter-spacing: 0.05em;
  line-height: 1;
}

.mz-review-venue {
  font-size: 10px;
  color: rgba(255, 255, 255, 0.6);
  margin-top: 4px;
}

.mz-review-attendance {
  font-size: 9px;
  color: rgba(255, 255, 255, 0.4);
}

.mz-review-goals-section {
  background: rgba(0, 0, 0, 0.2);
  border-radius: 8px;
  padding: 8px 12px;
  border: 1px solid rgba(255, 255, 255, 0.05);
}

.mz-review-goals-title {
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.05em;
  color: #ffc107;
  margin-bottom: 6px;
}

.mz-review-goals-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  max-height: 90px;
  overflow-y: auto;
}

.mz-review-goal-chip {
  font-size: 11px;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 6px;
  padding: 3px 8px;
  color: #e2e8f0;
}

.mz-review-stats-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 8px;
  padding: 10px 14px;
  border: 1px solid rgba(255, 255, 255, 0.05);
}

.mz-review-stat-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.mz-stat-val {
  font-size: 11px;
  font-weight: 800;
  width: 38px;
}
.mz-stat-home {
  text-align: right;
  color: #22c55e;
}
.mz-stat-away {
  text-align: left;
  color: #38bdf8;
}

.mz-stat-bar-col {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.mz-stat-label {
  font-size: 9px;
  font-weight: 700;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.55);
  letter-spacing: 0.04em;
}

.mz-stat-bar-track {
  width: 100%;
  height: 6px;
  border-radius: 3px;
  background: rgba(255, 255, 255, 0.08);
  display: flex;
  overflow: hidden;
}

.mz-stat-bar-fill-home {
  background: #22c55e;
  height: 100%;
  transition: width 0.3s;
}

.mz-stat-bar-fill-away {
  background: #38bdf8;
  height: 100%;
  transition: width 0.3s;
}

.mz-review-actions-bar {
  display: flex;
  justify-content: center;
  margin-top: 4px;
}

.mz-replay-action {
  font-size: 13px !important;
  font-weight: 800 !important;
  padding: 8px 24px !important;
  background: #ffeb3b !important;
  color: #0c1710 !important;
}

.mz-reopen-review-btn {
  position: absolute;
  top: 14px;
  right: 16px;
  background: rgba(15, 23, 42, 0.85);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 235, 59, 0.4);
  color: #ffeb3b;
  font-size: 11px;
  font-weight: 800;
  padding: 6px 12px;
  border-radius: 16px;
  cursor: pointer;
  z-index: 90;
  transition: all 0.2s;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
}
.mz-reopen-review-btn:hover {
  background: #ffeb3b;
  color: #0c1710;
}
</style>
