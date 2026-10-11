<template>
  <div class="hud">
    <!-- Identity: crest, Clubhouse tier and the Standing ladder. Opens the club hub. -->
    <div class="profile" title="Club" @click="emit('act', 'hub')">
      <div class="avatar"><img :src="crestUrl(club.code)" :alt="club.name" width="56" height="56" @error="crestFallback($event, club.name)" /></div>
      <div class="lvl-badge" title="Clubhouse tier">{{ tier }}</div>
      <div class="standing" title="Standing points"><span v-html="icon('trophy')"></span><b>{{ fmt(standing) }}</b></div>
    </div>

    <!-- The three spendable resources, each against its vault cap. -->
    <div class="resbar">
      <div v-for="r in resources" :key="r.key" class="res cap" :class="{ bump: bumped === r.key, full: r.cap && r.value >= r.cap }" :title="r.cap ? `${r.label}: ${fmt(r.value)} of ${fmt(r.cap)}` : r.label" :data-res="r.key">
        <span v-html="icon(r.icon)"></span>
        <b>{{ fmt(r.value) }}</b>
        <i v-if="r.cap" class="capbar"><i :style="{ width: `${Math.min(100, (r.value / r.cap) * 100)}%` }"></i></i>
      </div>
      <span v-if="guardSeconds > 0" class="res guard" title="Nobody can attack you until this runs out">
        <span v-html="icon('check')"></span><b>Guard {{ formatRemainingSeconds(guardSeconds) }}</b>
      </span>
    </div>

    <div class="topright">
      <button v-if="isMine" class="roundbtn" title="Defence log" @click="emit('act', 'defence')">
        <span v-html="icon('mail')"></span><i v-if="defences" class="dot count">{{ defences }}</i>
      </button>
      <button v-if="isMine" class="roundbtn" title="Club hub" @click="emit('act', 'hub')" v-html="icon('hub')"></button>
      <button v-if="isMine" class="roundbtn" title="Settings" @click="emit('act', 'settings')" v-html="icon('gear')"></button>
    </div>

    <!-- Builders: the scarce upgrade slots. -->
    <div v-if="isMine && builders" class="speedup" title="Builders" @click="emit('act', 'build')">
      <div>
        <div class="su-title">{{ builders.next ? builders.next.name : 'Builders free' }}</div>
        <div v-if="builders.next" class="su-time"><span v-html="icon('clock')"></span><span>{{ formatRemainingSeconds(builders.next.secondsLeft) }}</span></div>
      </div>
      <span class="su-count"><span v-html="icon('hammer')"></span> {{ builders.active }}/{{ builders.max }} builders</span>
    </div>

    <template v-if="isMine">
      <nav v-if="!moving" class="dock">
        <button :class="{ coach: coach === 'build' }" @click="emit('act', 'build')"><span v-html="icon('hammer')"></span><span>Build</span></button>
        <button @click="emit('act', 'move')"><span v-html="icon('move')"></span><span>Move</span></button>
        <button :class="{ coach: coach === 'squad' }" @click="emit('act', 'squad')"><span v-html="icon('people')"></span><span>Squad</span></button>
        <button @click="emit('act', 'hub')"><span v-html="icon('hub')"></span><span>Club</span></button>
      </nav>
      <div v-else class="placebar">
        <button class="btn" @click="emit('act', 'move-cancel')"><span v-html="icon('close')"></span>Cancel</button>
        <button class="btn" @click="emit('act', 'move-rotate')"><span v-html="icon('rotate')"></span>Rotate</button>
        <button class="btn primary" @click="emit('act', 'move-save')"><span v-html="icon('check')"></span>Save layout</button>
      </div>
      <button v-if="!moving" class="playbtn" :class="{ tired: cooldown > 0, coach: coach === 'attack' }" :disabled="playing" @click="emit('act', 'attack')">
        <span v-html="icon('ball')"></span><span>Attack</span>
        <small>{{ cooldown > 0 ? `Resting ${formatRemainingSeconds(cooldown)}` : playing ? 'Playing…' : 'Find a match' }}</small>
      </button>
    </template>
    <div v-else class="placebar">
      <button class="btn primary" @click="emit('act', 'home')">Back to my grounds</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { crestUrl } from '@/helpers/crest';
import { computed, ref, watch } from 'vue';
import { formatRemainingSeconds } from '@/helpers/countdown';
import { crestFallback } from './club-colors';
import { icon } from './icons';

/**
 * The campus HUD (docs/coc-mapping/08 §4): identity + Clubhouse tier + Standing,
 * the three spendable resources against their vault caps, builders, and the
 * one big Attack button. Nothing from the old pyramid/calendar/board game.
 */
const props = defineProps<{
  club: { name: string; code: string };
  tier: number;
  standing: number;
  res: { cash: number; fans: number; tokens: number };
  caps: { cash: number | null; fans: number | null; tokens: number | null };
  builders: { active: number; max: number; next: { name: string; secondsLeft: number } | null } | null;
  guardSeconds: number;
  /** Unread defence results (raids against this club). */
  defences: number;
  isMine: boolean;
  moving: boolean;
  cooldown: number;
  playing: boolean;
  /** The action the onboarding pointer is on, if any. */
  coach?: string | null;
}>();
const emit = defineEmits<{ (e: 'act', action: string): void }>();

const fmt = (n: number) => Math.floor(n).toLocaleString('en-US');

const resources = computed(() => [
  { key: 'cash', label: 'Cash', icon: 'coins', value: props.res.cash, cap: props.caps.cash },
  { key: 'fans', label: 'Fans', icon: 'people', value: props.res.fans, cap: props.caps.fans },
  { key: 'tokens', label: 'Scout Tokens', icon: 'star', value: props.res.tokens, cap: props.caps.tokens },
]);

// A resource chip bumps whenever it goes up.
const bumped = ref<string | null>(null);
watch(
  () => ({ ...props.res }),
  (now, before) => {
    if (!before) return;
    const up = (['cash', 'fans', 'tokens'] as const).find((k) => now[k] > before[k]);
    if (!up) return;
    bumped.value = null;
    requestAnimationFrame(() => (bumped.value = up));
    setTimeout(() => (bumped.value = null), 450);
  }
);
</script>

<style scoped>
.standing {
  margin-top: 8px;
  display: flex;
  align-items: center;
  gap: 4px;
  height: 26px;
  padding: 0 8px 0 2px;
  border-radius: 14px;
  background: #3b2a1a;
  border: 2px solid #2a1c10;
  color: #fff;
  font-size: 14px;
  text-shadow: 0 1px 0 #000;
  box-shadow: 0 2px 0 rgba(0, 0, 0, 0.25);
}
.standing :deep(.ic) {
  width: 24px;
  height: 24px;
}
.res.cap {
  padding-bottom: 6px;
}
.res.bump {
  animation: bump 0.45s;
}
.capbar {
  position: absolute;
  left: 30px;
  right: 12px;
  bottom: 4px;
  height: 5px;
  border-radius: 3px;
  background: rgba(59, 42, 26, 0.25);
  overflow: hidden;
}
.capbar > i {
  display: block;
  height: 100%;
  background: linear-gradient(#8be15c, #46ad2a);
  transition: width 0.4s;
}
.res.full .capbar > i {
  background: linear-gradient(#ffb36b, #e0661b);
}
.res.guard {
  min-width: 0;
  background: linear-gradient(#e4f4ff, #b9dcf5);
  border-color: #5f9fd0;
}
.res.guard b {
  font-size: 15px;
}
.speedup {
  cursor: pointer;
}
.su-count {
  display: inline-flex;
  align-items: center;
  gap: 3px;
}
.su-count :deep(.ic) {
  width: 14px;
  height: 14px;
}
</style>
