<template>
  <div class="world-top-ticker d-flex align-center justify-space-between w-100 px-3">
    <!-- Left / Center Pills Group -->
    <div class="d-flex align-center gap-2 flex-wrap">
      <!-- 1. Competition Pill -->
      <div class="ticker-pill d-flex align-center">
        <v-icon size="small" color="indigo-lighten-3" class="mr-2">mdi-shield-outline</v-icon>
        <span class="font-weight-bold">{{ competitionName }}</span>
        <span class="text-caption text-medium-emphasis ml-1">{{ seasonYear }}</span>
      </div>

      <!-- 2. Finance / Treasury Pill -->
      <div class="ticker-pill d-flex align-center">
        <v-icon size="small" color="green-accent-3" class="mr-2">mdi-wallet-outline</v-icon>
        <span class="font-weight-bold text-white">{{ formattedBudget }}</span>
        <span class="cashflow-badge ml-1">{{ formattedCashflow }}</span>
      </div>

      <!-- 3. Calendar Date Pill (Clickable -> Opens Year Calendar) -->
      <div
        class="ticker-pill ticker-clickable d-flex align-center cursor-pointer"
        @click="router.push('/u/calendar')"
        title="Click to open Season Calendar of the Year"
      >
        <v-icon size="small" color="indigo-lighten-2" class="mr-2">mdi-calendar-month-outline</v-icon>
        <span class="font-weight-medium">{{ formattedGameDate }}</span>
        <v-chip size="x-small" color="indigo-lighten-3" variant="tonal" class="ml-2 px-1">
          CALENDAR
        </v-chip>
      </div>

      <!-- 4. Next Match / World Event Ticker (Highlighted Purple/Indigo Pill) -->
      <div
        class="ticker-pill ticker-highlight d-flex align-center cursor-pointer"
        @click="showWorldFeedModal = true"
        :title="'Click to view World Emulator Events & Influences'"
      >
        <v-icon size="small" color="indigo-lighten-2" class="mr-2">
          {{ currentTickerItem.icon }}
        </v-icon>
        <transition name="fade-ticker" mode="out-in">
          <span :key="currentTickerIndex" class="ticker-text font-weight-bold text-truncate">
            {{ currentTickerItem.text }}
          </span>
        </transition>
        <v-chip size="x-small" color="indigo-lighten-2" variant="tonal" class="ml-2 px-1">
          LIVE
        </v-chip>
      </div>
    </div>

    <!-- Right: User Persona -->
    <div class="d-flex align-center gap-3">
      <div class="text-right">
        <div class="persona-name text-white">{{ username }}</div>
        <div class="persona-role">CLUB EXECUTIVE</div>
      </div>

      <v-badge
        bordered
        location="bottom end"
        :color="socketConnected ? 'green-accent-4' : 'grey'"
        dot
        offset-x="6"
        offset-y="6"
      >
        <v-avatar size="36" class="elevation-2 border">
          <v-img
            :src="avatarUrl"
            alt="User avatar"
          ></v-img>
        </v-avatar>
      </v-badge>

      <v-menu location="bottom end">
        <template #activator="{ props }">
          <v-btn icon size="x-small" variant="text" v-bind="props">
            <v-icon size="small">mdi-chevron-down</v-icon>
          </v-btn>
        </template>
        <v-list density="compact" class="bg-surface-variant">
          <v-list-item to="/u/settings" prepend-icon="mdi-cog" title="Settings" />
          <v-list-item @click="$emit('logout')" prepend-icon="mdi-logout" title="Logout" base-color="error" />
        </v-list>
      </v-menu>
    </div>

    <!-- Modal: World Emulator Live Feed & Influences -->
    <v-dialog v-model="showWorldFeedModal" max-width="600px">
      <v-card class="pa-4 bg-surface elevation-6 rounded-lg">
        <div class="d-flex justify-space-between align-center mb-3">
          <div class="d-flex align-center gap-2">
            <v-icon color="indigo-lighten-2">mdi-earth</v-icon>
            <span class="text-h6 font-weight-bold">World Emulator: Intent & Events</span>
          </div>
          <v-btn icon size="small" variant="text" @click="showWorldFeedModal = false">
            <v-icon>mdi-close</v-icon>
          </v-btn>
        </div>
        <v-divider class="mb-3" />

        <p class="text-caption text-medium-emphasis mb-3">
          The autonomous world interprets events across football, civic mood, and macroeconomic factors, deriving probabilistic influences on match outcomes and club behavior.
        </p>

        <div class="text-subtitle-2 font-weight-bold mb-2">Recent World Influences & Headlines</div>
        <v-list density="compact" class="bg-transparent pa-0">
          <v-list-item
            v-for="(item, idx) in allTickerHeadlines"
            :key="idx"
            class="pa-2 mb-2 rounded border"
            style="background: rgba(255, 255, 255, 0.03)"
          >
            <template #prepend>
              <v-icon size="small" :color="item.color" class="mr-2">{{ item.icon }}</v-icon>
            </template>
            <v-list-item-title class="text-body-2 font-weight-bold">
              {{ item.title }}
            </v-list-item-title>
            <v-list-item-subtitle class="text-caption text-medium-emphasis mt-1">
              {{ item.detail }}
            </v-list-item-subtitle>
          </v-list-item>
        </v-list>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { useStore } from '@/store';
import { client } from '@/services/api';

defineProps<{
  socketConnected?: boolean;
}>();

defineEmits<{
  (e: 'logout'): void;
}>();

const router = useRouter();
const store = useStore();
const showWorldFeedModal = ref(false);
const worldHeadlines = ref<any[]>([]);
const currentTickerIndex = ref(0);
let tickerTimer: ReturnType<typeof setInterval> | null = null;

const user = computed(() => store.user);
const calendar = computed(() => store.calendar);

const username = computed(() => user.value?.username || 'leankhan');

const userClub = computed<any>(() => {
  const clubs = user.value?.clubs;
  if (Array.isArray(clubs) && clubs.length > 0 && typeof clubs[0] !== 'string') {
    return clubs[0];
  }
  return null;
});

const avatarUrl = computed(() => {
  if (user.value?.avatar && user.value.avatar !== 'default-avatar.png') {
    return user.value.avatar;
  }
  return 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=120&q=80';
});

const competitionName = computed(() => {
  return userClub.value?.LeagueCode || 'Premier Division';
});

const seasonYear = computed(() => {
  const curDate = calendar.value?.CurrentDate;
  if (curDate) {
    const y = new Date(curDate).getFullYear();
    return `${y}/${(y + 1).toString().slice(-2)}`;
  }
  return '2026/27';
});

const formattedBudget = computed(() => {
  const b = userClub.value?.Finances?.budget ?? userClub.value?.Budget ?? 142500000;
  if (b >= 1000000) {
    return `$${(b / 1000000).toFixed(1)}M`;
  }
  return `$${(b / 1000).toFixed(0)}k`;
});

const formattedCashflow = computed(() => {
  const weeklyWages = userClub.value?.Finances?.wageBillWeekly ?? 1200000;
  const matchdayRev = Math.round((userClub.value?.Finances?.totalMatchdayRevenue ?? 6000000) / 2);
  const net = matchdayRev - weeklyWages;
  const sign = net >= 0 ? '+' : '-';
  const abs = Math.abs(net);
  if (abs >= 1000000) {
    return `${sign}$${(abs / 1000000).toFixed(1)}M/wk`;
  }
  return `${sign}$${(abs / 1000).toFixed(0)}k/wk`;
});

const formattedGameDate = computed(() => {
  const cur = calendar.value?.CurrentDate;
  if (cur) {
    const d = new Date(cur);
    return d.toLocaleDateString('en-US', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  }
  return `Day ${calendar.value?.CurrentDay ?? 1}`;
});

// Rotate between next match preview and live world headlines
const tickerItems = computed(() => {
  const items: { icon: string; text: string }[] = [];

  // Item 1: Next match or default
  items.push({
    icon: 'mdi-timer-outline',
    text: `NEXT: PREGGE SV 2d 14h (Day ${(calendar.value?.CurrentDay ?? 1) + 2})`,
  });

  // Item 2: Club Readiness
  items.push({
    icon: 'mdi-chart-bell-curve-cumulative',
    text: `TACTICAL READINESS: 94% • High Press Active`,
  });

  // Items from World Feed if loaded
  if (worldHeadlines.value.length > 0) {
    for (const h of worldHeadlines.value.slice(0, 3)) {
      items.push({
        icon: 'mdi-lightning-bolt',
        text: `WORLD: ${h.title}`,
      });
    }
  } else {
    items.push({
      icon: 'mdi-earth',
      text: 'WORLD EMULATOR: Civic optimism boosting regional match attendance',
    });
  }

  return items;
});

const currentTickerItem = computed(() => {
  const list = tickerItems.value;
  return list[currentTickerIndex.value % list.length] || list[0];
});

const allTickerHeadlines = computed(() => {
  if (worldHeadlines.value.length > 0) {
    return worldHeadlines.value.map((h) => ({
      icon: 'mdi-newspaper-variant-outline',
      color: 'indigo-lighten-2',
      title: h.title,
      detail: h.summary || 'Derived from autonomous league state',
    }));
  }
  return [
    {
      icon: 'mdi-cash-multiple',
      color: 'success',
      title: 'Major Investment Inflow',
      detail: 'Commercial capital injections boosting Continental division budgets.',
    },
    {
      icon: 'mdi-account-group',
      color: 'primary',
      title: 'Civic Sentiment Optimal',
      detail: 'Public enthusiasm for football driving record matchday ticket sales.',
    },
    {
      icon: 'mdi-strategy',
      color: 'amber',
      title: 'Tactical Realignment Observed',
      detail: 'Rival clubs adapting pressing lines ahead of upcoming matchday.',
    },
  ];
});

async function fetchWorldNews() {
  try {
    const res = await client.calendar.getWorldFeed.query();
    if (res.status === 200 && res.body.payload?.headlines) {
      worldHeadlines.value = res.body.payload.headlines;
    }
  } catch (e) {
    // Graceful fallback
  }
}

onMounted(() => {
  fetchWorldNews();
  tickerTimer = setInterval(() => {
    currentTickerIndex.value = (currentTickerIndex.value + 1) % tickerItems.value.length;
  }, 6000);
});

onUnmounted(() => {
  if (tickerTimer) clearInterval(tickerTimer);
});
</script>

<style scoped>
.world-top-ticker {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
  user-select: none;
}

.ticker-pill {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  padding: 5px 12px;
  font-size: 0.81rem;
  color: #e2e8f0;
  transition: all 0.2s ease;
  white-space: nowrap;
}

.ticker-pill:hover {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(255, 255, 255, 0.2);
}

.ticker-clickable:hover {
  background: rgba(99, 102, 241, 0.18) !important;
  border-color: rgba(129, 140, 248, 0.5) !important;
  box-shadow: 0 0 10px rgba(99, 102, 241, 0.2);
}

.cashflow-badge {
  color: #4ade80;
  font-weight: 700;
}

.ticker-highlight {
  background: linear-gradient(135deg, rgba(49, 46, 129, 0.75) 0%, rgba(30, 27, 75, 0.85) 100%);
  border: 1px solid rgba(129, 140, 248, 0.45);
  color: #e0e7ff;
  max-width: 380px;
}

.ticker-highlight:hover {
  border-color: rgba(165, 180, 252, 0.7);
  box-shadow: 0 0 12px rgba(99, 102, 241, 0.25);
}

.ticker-text {
  max-width: 250px;
  display: inline-block;
}

.persona-name {
  font-size: 0.85rem;
  font-weight: 700;
  line-height: 1.1;
  letter-spacing: -0.01em;
}

.persona-role {
  font-size: 0.68rem;
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-weight: 700;
  color: #4ade80;
  letter-spacing: 0.08em;
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
</style>
