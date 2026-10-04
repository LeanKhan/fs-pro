<template>
  <div class="world-top-ticker d-flex align-center justify-space-between w-100 px-3" :class="{ cozy }">
    <div class="d-flex align-center pills">
      <!-- Level and the world year -->
      <div class="ticker-pill" :title="seasonYear">
        <v-icon size="small" class="mr-1">mdi-stairs</v-icon>
        <b>{{ levelLabel }}</b>
        <span class="muted ml-1">{{ seasonYear }}</span>
      </div>

      <!-- Treasury and the yearly wage bill -->
      <div v-if="userClub" class="ticker-pill" title="Treasury, and what the squad costs a year">
        <v-icon size="small" class="mr-1">mdi-wallet-outline</v-icon>
        <b>{{ money(userClub.Budget ?? 0) }}</b>
        <span v-if="wageBill !== null" class="muted ml-1">wages {{ money(wageBill) }}/yr</span>
      </div>

      <!-- Game date -> the year calendar -->
      <button class="ticker-pill clickable" title="Open the year calendar" @click="router.push('/u/calendar')">
        <v-icon size="small" class="mr-1">mdi-calendar-month-outline</v-icon>
        {{ formattedGameDate }}
      </button>

      <!-- Next real fixture, or what's happening in the world -->
      <button class="ticker-pill highlight clickable" title="Around the world" @click="showWorldFeedModal = true">
        <v-icon size="small" class="mr-1">{{ currentTickerItem.icon }}</v-icon>
        <transition name="fade-ticker" mode="out-in">
          <span :key="currentTickerIndex" class="ticker-text text-truncate">{{ currentTickerItem.text }}</span>
        </transition>
      </button>
    </div>

    <!-- Who's signed in -->
    <div class="d-flex align-center ga-2">
      <div class="text-right persona">
        <div class="persona-name">{{ displayName }}</div>
        <div class="persona-role">{{ userClub ? userClub.Name : 'Manager' }}</div>
      </div>
      <v-badge bordered location="bottom end" :color="socketConnected ? 'green-accent-4' : 'grey'" dot offset-x="6" offset-y="6">
        <v-avatar size="38" rounded="0">
          <img v-if="userClub" :src="crestUrl(userClub.ClubCode)" :alt="userClub.Name" width="34" height="38" />
          <v-icon v-else>mdi-account-circle</v-icon>
        </v-avatar>
      </v-badge>
      <v-menu location="bottom end">
        <template #activator="{ props }">
          <v-btn icon size="x-small" variant="text" v-bind="props" aria-label="Account">
            <v-icon size="small">mdi-chevron-down</v-icon>
          </v-btn>
        </template>
        <v-list density="compact">
          <v-list-item to="/u/settings" prepend-icon="mdi-cog" title="Settings" />
          <v-list-item @click="$emit('logout')" prepend-icon="mdi-logout" title="Log out" base-color="error" />
        </v-list>
      </v-menu>
    </div>

    <v-dialog v-model="showWorldFeedModal" max-width="600px">
      <v-card class="pa-4">
        <div class="d-flex justify-space-between align-center mb-3">
          <div class="d-flex align-center ga-2">
            <v-icon>mdi-earth</v-icon>
            <span class="text-h6 font-weight-bold">Around the world</span>
          </div>
          <v-btn icon size="small" variant="text" aria-label="Close" @click="showWorldFeedModal = false">
            <v-icon>mdi-close</v-icon>
          </v-btn>
        </div>
        <v-divider class="mb-3" />
        <v-list v-if="worldHeadlines.length" density="compact" class="bg-transparent pa-0">
          <v-list-item v-for="(h, idx) in worldHeadlines" :key="idx" class="pa-2 mb-2 rounded border">
            <template #prepend>
              <v-icon size="small" class="mr-2">mdi-newspaper-variant-outline</v-icon>
            </template>
            <v-list-item-title class="text-body-2 font-weight-bold">{{ h.title }}</v-list-item-title>
            <v-list-item-subtitle v-if="h.summary" class="text-caption mt-1">{{ h.summary }}</v-list-item-subtitle>
          </v-list-item>
        </v-list>
        <p v-else class="text-medium-emphasis">No news yet. Results, transfers and new clubs will show up here.</p>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { useStore } from '@/store';
import { client } from '@/services/api';
import { useOpenPlayStore } from '@/store/open-play';
import { levelForXp, useClubDirectory } from '@/helpers/open-play';
import { crestUrl } from '@/helpers/crest';

defineProps<{
  socketConnected?: boolean;
  /** The manager app's campus palette (the admin console is dark). */
  cozy?: boolean;
}>();
defineEmits<{ (e: 'logout'): void }>();

const router = useRouter();
const store = useStore();
const openPlay = useOpenPlayStore();
const directory = useClubDirectory();
const showWorldFeedModal = ref(false);
const worldHeadlines = ref<{ title: string; summary?: string }[]>([]);
const currentTickerIndex = ref(0);
let tickerTimer: ReturnType<typeof setInterval> | null = null;

const user = computed(() => store.user);
const calendar = computed(() => store.calendar);
const displayName = computed(() => user.value?.fullname || user.value?.username || 'Manager');

/** The first owned club, once setUserClubs has resolved it to an object. */
const userClub = computed<any>(() => {
  const c = user.value?.clubs?.[0];
  return c && typeof c === 'object' ? c : null;
});

const levelLabel = computed(() => {
  const club = directory.get(openPlay.clubId);
  return club ? `Level ${levelForXp(club.XP ?? 0, openPlay.settings?.levelThresholds)}` : 'Open play';
});
const seasonYear = computed(() => {
  const s = openPlay.settings;
  return s ? `Year ${s.currentYear} · day ${s.dayOfYear}/${s.yearLengthDays}` : '';
});

/** Player wages are yearly (see utils/players.ts calculatePlayerWage). */
const wageBill = computed<number | null>(() => {
  const players = userClub.value?.Players;
  if (!Array.isArray(players)) return null;
  return players.reduce((sum: number, p: { Wage?: number; isRetired?: boolean }) => sum + (p.isRetired ? 0 : (p.Wage ?? 0)), 0);
});

function money(n: number) {
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${sign}$${Math.round(abs / 1e3)}k`;
  return `${sign}$${Math.round(abs)}`;
}

const formattedGameDate = computed(() => {
  const cur = calendar.value?.CurrentDate;
  return cur
    ? new Date(cur).toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
    : `Day ${calendar.value?.CurrentDay ?? 1}`;
});

/** The club's next accepted competition match, if any. */
const nextMatch = computed(() => {
  const today = openPlay.settings?.currentDay ?? calendar.value?.CurrentDay ?? 0;
  const next = [...openPlay.upcoming]
    .filter((c) => c.scheduledDay != null && c.scheduledDay >= today)
    .sort((a, b) => (a.scheduledDay ?? 0) - (b.scheduledDay ?? 0))[0];
  if (!next) return null;
  const mine = openPlay.clubId;
  const opponentId = next.homeClubId === mine ? next.awayClubId : next.homeClubId;
  const days = (next.scheduledDay ?? today) - today;
  return `NEXT: ${next.homeClubId === mine ? 'vs' : '@'} ${directory.name(opponentId)} · ${days === 0 ? 'today' : `in ${days} day${days === 1 ? '' : 's'}`}`;
});

const tickerItems = computed(() => {
  const items: { icon: string; text: string }[] = [];
  if (nextMatch.value) items.push({ icon: 'mdi-timer-outline', text: nextMatch.value });
  else if (userClub.value) items.push({ icon: 'mdi-soccer', text: 'No fixtures: PLAY at your ground any time' });
  for (const h of worldHeadlines.value.slice(0, 4)) items.push({ icon: 'mdi-newspaper-variant-outline', text: h.title });
  if (!items.length) items.push({ icon: 'mdi-earth', text: 'The world is quiet today' });
  return items;
});
const currentTickerItem = computed(() => tickerItems.value[currentTickerIndex.value % tickerItems.value.length] ?? tickerItems.value[0]!);

async function fetchWorldNews() {
  try {
    const res = await client.calendar.getWorldFeed.query();
    if (res.status === 200 && res.body.payload?.headlines) worldHeadlines.value = res.body.payload.headlines as never;
  } catch {
    // The ticker just shows fewer items.
  }
}

onMounted(() => {
  openPlay.start();
  void fetchWorldNews();
  tickerTimer = setInterval(() => {
    currentTickerIndex.value = (currentTickerIndex.value + 1) % tickerItems.value.length;
  }, 6000);
});
onUnmounted(() => {
  openPlay.stop();
  if (tickerTimer) clearInterval(tickerTimer);
});
</script>

<style scoped>
.world-top-ticker {
  user-select: none;
  --pill-bg: rgba(255, 255, 255, 0.05);
  --pill-border: rgba(255, 255, 255, 0.12);
  --pill-ink: #e2e8f0;
  --pill-muted: #94a3b8;
  --hi-bg: rgba(49, 46, 129, 0.75);
  --hi-border: rgba(129, 140, 248, 0.45);
}
.world-top-ticker.cozy {
  font-family: 'Fredoka', system-ui, sans-serif;
  --pill-bg: #fffaf0;
  --pill-border: #e2cc9c;
  --pill-ink: #4a3220;
  --pill-muted: #8b7357;
  --hi-bg: #fff1c4;
  --hi-border: #f5b82e;
}
.pills {
  gap: 8px;
  flex-wrap: nowrap;
  min-width: 0;
  flex: 1 1 auto;
  overflow: hidden;
}
.ticker-pill {
  display: inline-flex;
  align-items: center;
  background: var(--pill-bg);
  border: 2px solid var(--pill-border);
  border-radius: 12px;
  padding: 4px 12px;
  font-size: 0.85rem;
  color: var(--pill-ink);
  white-space: nowrap;
  font: inherit;
}
.cozy .ticker-pill {
  box-shadow: 0 2px 0 rgba(70, 40, 15, 0.18);
}
.ticker-pill .v-icon {
  color: var(--pill-muted);
}
.muted {
  color: var(--pill-muted);
  font-size: 0.8rem;
}
.clickable {
  cursor: pointer;
}
.clickable:hover {
  border-color: var(--hi-border);
}
.highlight {
  background: var(--hi-bg);
  border-color: var(--hi-border);
  max-width: 420px;
  min-width: 120px;
  flex: 0 1 auto;
  overflow: hidden;
  font-weight: 600;
}
.ticker-text {
  max-width: 340px;
  min-width: 0;
  display: inline-block;
  overflow: hidden;
  text-overflow: ellipsis;
}
.persona-name {
  font-size: 0.9rem;
  font-weight: 700;
  line-height: 1.1;
  color: var(--pill-ink);
}
.persona-role {
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--pill-muted);
  line-height: 1.1;
}
.fade-ticker-enter-active,
.fade-ticker-leave-active {
  transition: all 0.3s ease;
}
.fade-ticker-enter-from {
  opacity: 0;
  transform: translateY(6px);
}
.fade-ticker-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}
@media (max-width: 1500px) {
  .persona,
  .ticker-pill .muted {
    display: none;
  }
}
@media (max-width: 1100px) {
  .ticker-pill:nth-child(3) {
    display: none;
  }
}
</style>
