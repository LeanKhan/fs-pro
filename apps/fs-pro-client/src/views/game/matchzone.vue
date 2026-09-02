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
        <span v-if="simulateRest" class="mz-chip mz-chip-accent">simulation</span>
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

    <div v-if="!fixture.HomeTeam" class="mz-loading-screen">Loading match...</div>

    <div v-else class="mz-body">
      <main class="mz-main">
        <div class="mz-pitch-wrap">
          <live-pitch
            :frame="liveFrame"
            :home="liveHome"
            :away="liveAway"
            :players="playersById"
          ></live-pitch>

          <div v-if="!resultsReady" class="mz-pitch-overlay">{{ overlayText }}</div>
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
          ></club-widget>
        </div>

        <div class="mz-fixture-meta">
          {{ fixture.SeasonCode }} - {{ fixture.Title }}
          <span v-if="fixture.Stadium"> - {{ fixture.Stadium }}</span>
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
import { Dugout } from '@/components/matchzone/widgets';
import { $axios } from '@/services/api';
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
const simulateRest = ref(false);

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
  const map: Record<string, { FirstName: string; LastName: string; Rating: number }> = {};
  const allPlayers = [
    ...(fixture.value.HomeTeam?.Players || []),
    ...(fixture.value.AwayTeam?.Players || []),
  ];
  allPlayers.forEach((p: any) => {
    map[p._id] = { FirstName: p.FirstName, LastName: p.LastName, Rating: p.Rating };
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
  matchFinished.value ? HomeTeamScore.value ?? 0 : liveHomeScore.value
);
const displayAwayScore = computed(() =>
  matchFinished.value ? AwayTeamScore.value ?? 0 : liveAwayScore.value
);

const matchFinished = computed(() => fixture.value.Played);

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
    const response = await $axios.get(`/fixtures/${fixtureId.value}`, {
      params: {
        populate: JSON.stringify([
          { path: 'HomeTeam', populate: ['Players', 'Manager'] },
          { path: 'AwayTeam', populate: ['Players', 'Manager'] },
        ]),
      },
    });

    fixture.value = response.data.payload;

    if (response.data.payload.isFinalMatch && response.data.payload.Played) {
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
  router.push(`/finish/season/${fixture.value.Season}`);
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
    console.error('Error connecting to live match replay, falling back:', error);
    watchingLive = false;
  }

  if (watchingLive) {
    liveFrame.value = null;
    liveWatching.value = true;
    replaySocket.onFrame((frame) => {
      liveFrame.value = frame;

      if (frame.events?.length) {
        liveEvents.value.push(...frame.events);
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
    const response = await $axios.get(`/game/kickoff-new/${fixtureId.value}`, {
      params,
    });
    let main = response.data.payload;
    if (response.data.payload.main) {
      main = response.data.payload.main;
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
    return;
  }

  liveWatching.value = true;
  replaySocket.onFrame((frame) => {
    liveFrame.value = frame;
    resultsReady.value = true;
  });
  replaySocket.onReplayEnd(() => {
    liveWatching.value = false;
  });

  try {
    await $axios.get(`/game/replay/${fixtureId.value}`);
  } catch (error) {
    console.error('Error starting match replay:', error);
    resultsReady.value = true;
    liveWatching.value = false;
    alert('No replay is available for this match.');
  }
}

async function getFixtureDay() {
  // Friendlies are season-less Fixtures with no ScheduledDay to look up.
  if (fixture.value.Type === 'friendly' || fixture.value.ScheduledDay == null) {
    return;
  }

  try {
    const response = await $axios.get(
      `/fixtures?scheduledDay=${fixture.value.ScheduledDay}`
    );
    dayFixtures.value = response.data.payload;
  } catch (error) {
    console.error('Error fetching fixtures for this day:', error);
  }
}

async function getStandings() {
  if (fixture.value.Season) {
    try {
      const response = await $axios.get(
        `/seasons/${fixture.value.Season}/standings`
      );
      standings.value = response.data.payload;
    } catch (error) {
      console.error('Error fetching Standings:', error);
    }
  }
}

async function matchSelected(match: any) {
  if (fixture.value.Played) {
    await router.push({ params: { fixture: match._id } });
  }
}

async function initializeGame() {
  // Reset any live-watch state from a previously watched fixture before
  // loading a new one (e.g. jumping between fixtures via the Dugout).
  replaySocket.disconnect();
  liveWatching.value = false;
  liveFrame.value = null;
  resultsReady.value = true;
  liveHomeScore.value = 0;
  liveAwayScore.value = 0;
  liveEvents.value = [];
  overlayText.value = 'Simulating...';

  await getFixture();
  await getFixtureDay();
}

onMounted(() => {
  whistle.value = new Audio('../../assets/sounds/whistle1.mp3');
  initializeGame();
});

onUnmounted(() => {
  replaySocket.disconnect();
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
}

.mz-pitch-wrap {
  position: relative;
  width: 100%;
  max-width: 640px;
  margin: 0 auto;
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
</style>
