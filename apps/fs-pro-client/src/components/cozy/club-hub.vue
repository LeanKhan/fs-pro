<template>
  <section class="chub">
    <nav class="chub-tabs" role="tablist">
      <button
        v-for="t in tabs"
        :key="t.key"
        role="tab"
        :aria-selected="active === t.key"
        :class="{ on: active === t.key }"
        @click="active = t.key"
      >
        <span class="ic" v-html="icon(t.icon)"></span>{{ t.title }}
      </button>
    </nav>

    <div class="chub-body">
      <defense-inbox
        v-if="active === 'defence'"
        :club-id="clubId"
        @toast="(t, l) => emit('toast', t, l)"
        @replay="(f, p) => emit('replay', f, p)"
      />
      <league-ladder
        v-else-if="active === 'ladder'"
        :club-id="clubId"
        :server-now="serverNow"
        @toast="(t, l) => emit('toast', t, l)"
      />
      <season-panel
        v-else-if="active === 'season'"
        :club-id="clubId"
        @toast="(t, l) => emit('toast', t, l)"
      />
      <legacy-panel
        v-else-if="active === 'legacy'"
        :club-id="clubId"
        @toast="(t, l) => emit('toast', t, l)"
      />
      <abilities-panel
        v-else-if="active === 'abilities'"
        :club-id="clubId"
        @toast="(t, l) => emit('toast', t, l)"
      />
      <association-panel
        v-else-if="active === 'association'"
        :club-id="clubId"
        :server-now="serverNow"
        @toast="(t, l) => emit('toast', t, l)"
      />
      <preseason-panel
        v-else-if="active === 'preseason'"
        :club-id="clubId"
        @toast="(t, l) => emit('toast', t, l)"
      />
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { icon } from './icons';
import DefenseInbox from './defense-inbox.vue';
import LeagueLadder from './league-ladder.vue';
import SeasonPanel from './season-panel.vue';
import LegacyPanel from './legacy-panel.vue';
import AbilitiesPanel from './abilities-panel.vue';
import AssociationPanel from './association-panel.vue';
import PreseasonPanel from './preseason-panel.vue';

/**
 * The club hub overlay (docs/coc-mapping/08 §2/§6): the gathered Track A
 * surfaces reachable *from* the campus — the defence inbox + replay, the
 * Standing ladder, the Season, Club Legacy, gated abilities / traits / War
 * Room, the Association, and the Pre-Season Tour. It is an overlay/tabbed
 * panel, never a control-room route-home: the campus stays home. Only the
 * active tab mounts, so opening the hub is one request, not seven.
 *
 * Plain HTML/CSS + cozy tokens; no Vuetify.
 */
type HubTabKey =
  | 'defence'
  | 'ladder'
  | 'season'
  | 'legacy'
  | 'abilities'
  | 'association'
  | 'preseason';

withDefaults(defineProps<{ clubId: string; serverNow?: string | null }>(), {
  serverNow: null,
});

const emit = defineEmits<{
  (e: 'toast', text: string, level?: 'success' | 'error'): void;
  (e: 'replay', fixtureId: string, playedAt: string | null): void;
}>();

const tabs: { key: HubTabKey; title: string; icon: string }[] = [
  { key: 'defence', title: 'Defence', icon: 'mail' },
  { key: 'ladder', title: 'Ladder', icon: 'trophy' },
  { key: 'season', title: 'Season', icon: 'star' },
  { key: 'legacy', title: 'Legacy', icon: 'bolt' },
  { key: 'abilities', title: 'Abilities', icon: 'bag' },
  { key: 'association', title: 'Association', icon: 'people' },
  { key: 'preseason', title: 'Pre-Season', icon: 'map' },
];
const active = ref<HubTabKey>('defence');
</script>

<style scoped>
.chub {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 300px;
}
.chub-tabs {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  padding-bottom: 4px;
  scrollbar-width: thin;
}
.chub-tabs button {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  flex: none;
  padding: 5px 12px;
  border-radius: 999px;
  border: 2px solid #e2cc9c;
  background: #fff8e6;
  font: inherit;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  color: var(--ink, #4a3220);
}
.chub-tabs button.on {
  background: linear-gradient(#fff8e6, #f1dfb6);
  border-color: var(--gold, #f5b82e);
}
.chub-tabs .ic {
  width: 18px;
  height: 18px;
  display: inline-flex;
}
.chub-tabs .ic :deep(.ic) {
  width: 100%;
  height: 100%;
}
.chub-body {
  min-height: 0;
}
</style>
