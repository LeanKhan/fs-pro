<template>
  <div class="timeline">
    <!-- Mode Switcher Tabs -->
    <div class="timeline-tabs">
      <button
        type="button"
        class="timeline-tab-btn"
        :class="{ active: currentTab === 'key' }"
        @click="currentTab = 'key'"
      >
        <span class="tab-icon">⭐</span>
        <span class="tab-label">Key Events</span>
        <span class="tab-count">{{ keyEvents.length }}</span>
      </button>
      <button
        type="button"
        class="timeline-tab-btn"
        :class="{ active: currentTab === 'all' }"
        @click="currentTab = 'all'"
      >
        <span class="tab-icon">📋</span>
        <span class="tab-label">Play-by-Play</span>
        <span class="tab-count">{{ allEvents.length }}</span>
      </button>
    </div>

    <!-- Filter input in play-by-play mode -->
    <div
      v-if="currentTab === 'all' && allEvents.length > 5"
      class="timeline-filter-bar"
    >
      <input
        v-model="searchQuery"
        type="text"
        placeholder="Filter by player, team, event..."
        class="timeline-search-input"
      />
      <span
        v-if="searchQuery"
        class="clear-search"
        @click="searchQuery = ''"
      >
        ✕
      </span>
    </div>

    <!-- Empty State -->
    <div v-if="!displayedEvents.length" class="timeline-empty">
      {{ searchQuery ? 'No matching events found' : 'No events yet' }}
    </div>

    <!-- Events Stream List -->
    <div ref="scrollContainer" class="timeline-list">
      <div
        v-for="(event, i) in displayedEvents"
        :key="i"
        class="timeline-row"
        :class="`type-${event.type}`"
      >
        <span class="timeline-time">{{ formatTime(event.time) }}</span>

        <div class="timeline-icon-wrap" :class="eventDotClass(event)">
          <span class="event-icon">{{ eventIcon(event) }}</span>
        </div>

        <div class="timeline-content">
          <div class="timeline-msg-line">
            <span v-if="event.playerTeamID" class="team-tag">
              [{{ event.playerTeamID }}]
            </span>
            <span class="timeline-text">{{ event.message }}</span>
          </div>

          <div
            v-if="
              event.data?.xG !== undefined ||
              event.data?.card ||
              event.data?.blocked ||
              event.data?.penalty
            "
            class="timeline-tags"
          >
            <span v-if="event.data?.xG !== undefined" class="tag-xg">
              {{ Number(event.data.xG).toFixed(2) }} xG
            </span>
            <span v-if="event.data?.blocked" class="tag-blocked">
              Blocked
            </span>
            <span
              v-if="event.data?.card"
              class="tag-card"
              :class="String(event.data.card).toLowerCase()"
            >
              {{ event.data.card }} Card
            </span>
            <span v-if="event.data?.penalty" class="tag-pen">
              Penalty
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue';

interface MatchEventItem {
  message: string;
  time?: string | number;
  type: string;
  playerID?: string;
  playerTeamID?: string;
  data?: any;
}

interface Props {
  Events?: any | MatchEventItem[];
}

const props = defineProps<Props>();

defineOptions({
  name: 'TimelineWidget',
});

const currentTab = ref<'key' | 'all'>('key');
const searchQuery = ref('');
const scrollContainer = ref<HTMLElement | null>(null);

const allEvents = computed<MatchEventItem[]>(() => {
  if (!props.Events || !Array.isArray(props.Events)) return [];
  return props.Events;
});

const keyEvents = computed<MatchEventItem[]>(() => {
  return allEvents.value.filter((ev) => {
    // Goals and saves are always key
    if (ev.type === 'goal' || ev.type === 'save') return true;
    // Disciplinary cards or penalty awards
    if (ev.data?.card || ev.data?.penalty) return true;
    // Kick-off, half-time, full-time milestones
    if (ev.type === 'match') return true;
    // Substitutions
    if (ev.type === 'substitution') return true;
    return false;
  });
});

const displayedEvents = computed<MatchEventItem[]>(() => {
  const list = currentTab.value === 'key' ? keyEvents.value : allEvents.value;
  if (!searchQuery.value.trim()) return list;
  const q = searchQuery.value.toLowerCase().trim();
  return list.filter(
    (ev) =>
      (ev.message && ev.message.toLowerCase().includes(q)) ||
      (ev.playerTeamID && ev.playerTeamID.toLowerCase().includes(q)) ||
      (ev.type && ev.type.toLowerCase().includes(q))
  );
});

// Auto-scroll to latest event during live match stream
watch(
  () => displayedEvents.value.length,
  () => {
    nextTick(() => {
      if (scrollContainer.value) {
        scrollContainer.value.scrollTop = scrollContainer.value.scrollHeight;
      }
    });
  }
);

function formatTime(t: any): string {
  if (t !== undefined && t !== null && t !== '') {
    return `${t}'`;
  }
  return '—';
}

function eventIcon(ev: MatchEventItem): string {
  if (ev.data?.card === 'Red' || ev.data?.card === 'red') return '🟥';
  if (ev.data?.card === 'Yellow' || ev.data?.card === 'yellow') return '🟨';
  switch (ev.type) {
    case 'goal':
      return '⚽';
    case 'save':
      return '🧤';
    case 'miss':
      return '🎯';
    case 'foul':
      return '⚠️';
    case 'match':
      return '⏱️';
    case 'substitution':
      return '⇄';
    case 'dribble':
      return '💨';
    case 'tackle':
      return '🛑';
    default:
      return '•';
  }
}

function eventDotClass(ev: MatchEventItem): string {
  if (ev.data?.card === 'Red') return 'dot-red-card';
  if (ev.data?.card === 'Yellow') return 'dot-yellow-card';
  switch (ev.type) {
    case 'goal':
      return 'dot-goal';
    case 'save':
      return 'dot-save';
    case 'miss':
      return 'dot-miss';
    case 'foul':
      return 'dot-foul';
    case 'match':
      return 'dot-match';
    case 'substitution':
      return 'dot-sub';
    default:
      return 'dot-default';
  }
}
</script>

<style scoped>
.timeline {
  display: flex;
  flex-direction: column;
  height: 100%;
  font-size: 13px;
  line-height: 1.6;
}

.timeline-tabs {
  display: flex;
  gap: 6px;
  margin-bottom: 8px;
  padding-bottom: 6px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.timeline-tab-btn {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.65);
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  cursor: pointer;
  transition: all 0.2s ease;
}

.timeline-tab-btn:hover {
  color: #ffffff;
  background: rgba(255, 255, 255, 0.08);
}

.timeline-tab-btn.active {
  color: #e9b34a;
  background: rgba(233, 179, 74, 0.12);
  border-color: rgba(233, 179, 74, 0.4);
}

.tab-count {
  font-size: 10px;
  padding: 1px 5px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.1);
}

.timeline-tab-btn.active .tab-count {
  background: rgba(233, 179, 74, 0.25);
  color: #fde68a;
}

.timeline-filter-bar {
  position: relative;
  margin-bottom: 8px;
}

.timeline-search-input {
  width: 100%;
  padding: 4px 22px 4px 8px;
  font-size: 11px;
  color: #f1f5f9;
  background: rgba(0, 0, 0, 0.25);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 4px;
  outline: none;
}

.timeline-search-input:focus {
  border-color: #e9b34a;
}

.clear-search {
  position: absolute;
  right: 6px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 11px;
  color: rgba(255, 255, 255, 0.5);
  cursor: pointer;
}

.timeline-empty {
  opacity: 0.6;
  font-size: 12px;
  padding: 12px 0;
  text-align: center;
}

.timeline-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: 380px;
  overflow-y: auto;
  padding-right: 4px;
}

.timeline-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 5px 6px;
  border-radius: 4px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
  transition: background 0.15s ease;
}

.timeline-row:hover {
  background: rgba(255, 255, 255, 0.03);
}

.timeline-time {
  opacity: 0.65;
  font-size: 11px;
  font-weight: 700;
  min-width: 26px;
  margin-top: 1px;
}

.timeline-icon-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  font-size: 10px;
  flex-shrink: 0;
  margin-top: 1px;
}

.timeline-content {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
}

.timeline-msg-line {
  display: flex;
  align-items: baseline;
  gap: 4px;
  font-size: 12px;
}

.team-tag {
  font-size: 10px;
  font-weight: 700;
  color: #93c5fd;
  opacity: 0.9;
}

.timeline-text {
  color: rgba(255, 255, 255, 0.9);
}

.timeline-tags {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 2px;
}

.tag-xg,
.tag-blocked,
.tag-card,
.tag-pen {
  font-size: 9px;
  font-weight: 700;
  padding: 1px 4px;
  border-radius: 3px;
  text-transform: uppercase;
}

.tag-xg {
  background: rgba(56, 189, 248, 0.18);
  color: #38bdf8;
  border: 1px solid rgba(56, 189, 248, 0.3);
}

.tag-blocked {
  background: rgba(148, 163, 184, 0.2);
  color: #cbd5e1;
}

.tag-card.yellow {
  background: rgba(234, 179, 8, 0.2);
  color: #facc15;
}

.tag-card.red {
  background: rgba(239, 68, 68, 0.2);
  color: #f87171;
}

.tag-pen {
  background: rgba(168, 85, 247, 0.2);
  color: #c084fc;
}

.dot-goal {
  background: rgba(34, 197, 94, 0.2);
}
.dot-save {
  background: rgba(59, 130, 246, 0.2);
}
.dot-miss {
  background: rgba(249, 115, 22, 0.2);
}
.dot-foul {
  background: rgba(234, 179, 8, 0.2);
}
.dot-match {
  background: rgba(148, 163, 184, 0.2);
}
.dot-yellow-card {
  background: rgba(234, 179, 8, 0.3);
}
.dot-red-card {
  background: rgba(239, 68, 68, 0.3);
}
.dot-default {
  background: rgba(255, 255, 255, 0.1);
}
</style>
