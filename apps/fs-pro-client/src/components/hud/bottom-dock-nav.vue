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

    <!-- GitHub-style Split Play Match / Quick Sim Button -->
    <div
      class="split-btn-group d-flex align-center"
      :class="{
        pulsating: !isCooldown && !playing,
        'is-cooldown': isCooldown,
        'is-playing': playing
      }"
    >
      <!-- Main Action Button -->
      <v-btn
        class="play-match-main-btn"
        size="x-large"
        :color="activeModeColor"
        variant="flat"
        :disabled="isCooldown || playing"
        @click="$emit('play-match', selectedMode)"
      >
        <span class="text-h6 mr-2">{{ activeModeIcon }}</span>
        <div class="d-flex flex-column align-start text-left">
          <span class="font-weight-black line-height-1">
            {{ isCooldown ? 'Squad Resting' : playing ? 'Matchmaking...' : activeModeTitle }}
          </span>
          <span v-if="isCooldown" class="text-caption font-weight-bold text-amber-lighten-3 mt-1">
            {{ formatClock(cooldownSeconds) }}
          </span>
          <span v-else-if="!playing" class="text-caption text-medium-emphasis">
            {{ activeModeSubtitle }}
          </span>
        </div>
      </v-btn>

      <!-- Attached Dropdown Caret Button (like GitHub Merge Button) -->
      <v-menu v-model="menuOpen" location="top end" offset="8">
        <template #activator="{ props: menuProps }">
          <v-btn
            v-bind="menuProps"
            class="play-match-dropdown-btn"
            size="x-large"
            :color="activeModeColor"
            variant="flat"
            :disabled="isCooldown || playing"
            icon="mdi-menu-down"
          ></v-btn>
        </template>

        <!-- Dropdown Menu List -->
        <v-card class="play-mode-menu pa-2 rounded-xl" min-width="290">
          <div class="text-caption font-weight-bold text-medium-emphasis px-3 py-1">
            MATCH SIMULATION MODE
          </div>
          <v-list density="compact" class="bg-transparent pa-0">
            <v-list-item
              v-for="mode in modes"
              :key="mode.id"
              class="rounded-lg mb-1 cursor-pointer"
              :class="{ 'mode-active': selectedMode === mode.id }"
              @click="onSelectMode(mode.id)"
            >
              <template #prepend>
                <v-icon v-if="selectedMode === mode.id" color="amber" size="20" class="mr-2">
                  mdi-check
                </v-icon>
                <span v-else class="mr-6"></span>
              </template>
              <v-list-item-title class="font-weight-bold d-flex align-center gap-1 text-white">
                <span>{{ mode.icon }}</span>
                <span>{{ mode.title }}</span>
              </v-list-item-title>
              <v-list-item-subtitle class="text-caption text-medium-emphasis mt-1">
                {{ mode.desc }}
              </v-list-item-subtitle>
            </v-list-item>
          </v-list>
        </v-card>
      </v-menu>
    </div>

    <div class="dock-spacer"></div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';

export type PlayMode = 'battle' | 'quick_sim';

export interface NavTabItem {
  key: string;
  label: string;
  icon: string;
}

interface ModeOption {
  id: PlayMode;
  title: string;
  subtitle: string;
  icon: string;
  color: string;
  desc: string;
}

const props = withDefaults(
  defineProps<{
    currentTab?: string;
    isCooldown?: boolean;
    cooldownSeconds?: number;
    playing?: boolean;
    initialMode?: PlayMode;
  }>(),
  {
    currentTab: 'hq',
    isCooldown: false,
    cooldownSeconds: 0,
    playing: false,
    initialMode: 'battle',
  }
);

const emit = defineEmits<{
  (e: 'change-tab', key: string): void;
  (e: 'play-match', mode: PlayMode): void;
  (e: 'change-play-mode', mode: PlayMode): void;
}>();

const menuOpen = ref(false);

const savedMode = (localStorage.getItem('fspro_play_mode') as PlayMode) || props.initialMode;
const selectedMode = ref<PlayMode>(savedMode === 'quick_sim' ? 'quick_sim' : 'battle');

const modes: ModeOption[] = [
  {
    id: 'battle',
    title: 'Play Match',
    subtitle: 'Live Battle Arena',
    icon: '⚔️',
    color: 'amber-darken-2',
    desc: 'Watch match action, momentum swings, and use coaching staff boosts.',
  },
  {
    id: 'quick_sim',
    title: 'Quick Sim',
    subtitle: 'Instant Simulation',
    icon: '⚡',
    color: 'teal-darken-2',
    desc: 'Instantly simulate the fixture and claim rewards without watching.',
  },
];

const currentModeConfig = computed(() => {
  return modes.find((m) => m.id === selectedMode.value) || modes[0];
});

const activeModeTitle = computed(() => currentModeConfig.value.title);
const activeModeSubtitle = computed(() => currentModeConfig.value.subtitle);
const activeModeIcon = computed(() => currentModeConfig.value.icon);
const activeModeColor = computed(() => currentModeConfig.value.color);

function onSelectMode(mode: PlayMode) {
  selectedMode.value = mode;
  localStorage.setItem('fspro_play_mode', mode);
  menuOpen.value = false;
  emit('change-play-mode', mode);
}

// Tabs that hand off to the manager dashboard
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
.split-btn-group {
  pointer-events: auto;
}
.nav-tab {
  min-width: 64px;
}

/* Split Button Group Styling (GitHub style) */
.split-btn-group {
  border-radius: 18px;
  box-shadow: 0 6px 24px rgba(245, 158, 11, 0.45);
}

.play-match-main-btn {
  border-top-left-radius: 18px !important;
  border-bottom-left-radius: 18px !important;
  border-top-right-radius: 0 !important;
  border-bottom-right-radius: 0 !important;
  height: 52px !important;
  padding: 0 20px !important;
}

.play-match-dropdown-btn {
  border-top-left-radius: 0 !important;
  border-bottom-left-radius: 0 !important;
  border-top-right-radius: 18px !important;
  border-bottom-right-radius: 18px !important;
  border-left: 1px solid rgba(0, 0, 0, 0.25) !important;
  height: 52px !important;
  min-width: 42px !important;
  padding: 0 6px !important;
}

.split-btn-group.pulsating {
  animation: dock-pulse 2.4s infinite;
}

.play-mode-menu {
  background: rgba(15, 23, 42, 0.98) !important;
  border: 1px solid rgba(255, 255, 255, 0.16);
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.85);
  backdrop-filter: blur(16px);
}

.mode-active {
  background: rgba(255, 255, 255, 0.08);
}

.cursor-pointer {
  cursor: pointer;
}

.line-height-1 {
  line-height: 1.1;
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
  .play-match-main-btn {
    padding: 0 12px !important;
  }
}
</style>

