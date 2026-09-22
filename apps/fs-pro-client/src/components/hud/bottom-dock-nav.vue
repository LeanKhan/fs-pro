<template>
  <div class="bottom-dock-container d-flex justify-space-between align-center px-4 pb-3">
    <v-card class="nav-dock pa-1 d-flex align-center border" rounded="xl" :style="glassStyle">
      <v-btn
        v-for="item in navItems"
        :key="item.key"
        variant="text"
        :color="currentTab === item.key ? 'amber' : 'grey-lighten-1'"
        class="nav-tab"
        stacked
        size="small"
        @click="$emit('change-tab', item.key)"
      >
        <v-icon size="20">{{ item.icon }}</v-icon>
        <span class="text-caption mt-1">{{ item.label }}</span>
      </v-btn>
    </v-card>

    <v-btn
      class="play-match-btn"
      :class="{ pulsating: !isCooldown && !playing }"
      size="x-large"
      rounded="xl"
      color="amber-darken-2"
      variant="flat"
      :disabled="isCooldown || playing"
      :append-icon="!isCooldown && !playing ? 'mdi-chevron-right' : undefined"
      @click="$emit('play-match')"
    >
      <span class="text-h6 mr-1">⚽</span>
      <div class="d-flex flex-column align-start">
        <span class="font-weight-black">
          {{ isCooldown ? 'Squad Resting' : playing ? 'Matchmaking...' : 'Play Match' }}
        </span>
        <span v-if="isCooldown" class="text-caption font-weight-bold">{{ formatClock(cooldownSeconds) }}</span>
      </div>
    </v-btn>

    <div class="dock-spacer"></div>
  </div>
</template>

<script setup lang="ts">
export interface NavTabItem {
  key: string;
  label: string;
  icon: string;
}

withDefaults(
  defineProps<{
    currentTab?: string;
    isCooldown?: boolean;
    cooldownSeconds?: number;
    playing?: boolean;
  }>(),
  { currentTab: 'hq', isCooldown: false, cooldownSeconds: 0, playing: false }
);

defineEmits<{
  (e: 'change-tab', key: string): void;
  (e: 'play-match'): void;
}>();

// Only tabs that go somewhere real (see club-game.vue's goManager tab map).
const navItems: NavTabItem[] = [
  { key: 'squad', label: 'Squad', icon: 'mdi-account-group' },
  { key: 'tactics', label: 'Tactics', icon: 'mdi-clipboard-text' },
  { key: 'transfers', label: 'Transfers', icon: 'mdi-swap-horizontal' },
  { key: 'club', label: 'Club', icon: 'mdi-bank' },
];

const glassStyle = {
  background: 'linear-gradient(135deg, rgba(30, 34, 53, 0.95) 0%, rgba(15, 23, 42, 0.95) 100%)',
  borderColor: 'rgba(99, 102, 241, 0.3)',
};

function formatClock(totalSeconds: number) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
</script>

<style scoped>
.bottom-dock-container {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 20;
  pointer-events: none;
}
.nav-dock,
.play-match-btn {
  pointer-events: auto;
}
.nav-tab {
  min-width: 64px;
}
.play-match-btn {
  box-shadow: 0 6px 24px rgba(245, 158, 11, 0.45);
}
.play-match-btn.pulsating {
  animation: dock-pulse 2.4s infinite;
}
/* Balances the nav dock's width so the Play button stays centred. */
.dock-spacer {
  width: 190px;
}
@keyframes dock-pulse {
  0% {
    box-shadow: 0 0 0 0 rgba(245, 158, 11, 0.6);
  }
  70% {
    box-shadow: 0 0 0 14px rgba(245, 158, 11, 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(245, 158, 11, 0);
  }
}
@media (max-width: 720px) {
  .dock-spacer {
    display: none;
  }
  .nav-tab .text-caption {
    display: none;
  }
  .play-match-btn {
    padding: 0 16px !important;
  }
}
</style>
