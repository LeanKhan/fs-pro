<template>
  <div class="timeline">
    <div v-if="!usefulEvents.length" class="timeline-empty">No events yet</div>
    <div v-for="(event, i) in usefulEvents" :key="i" class="timeline-row">
      <span class="timeline-time">{{ event.time }}'</span>
      <span class="timeline-dot" :class="eventClass(event.type)"></span>
      {{ event.message }}
    </div>
  </div>
</template>
<script setup lang="ts">
import { computed } from 'vue';

interface Props {
  Events: any | { message: string; time: string | number; type: string }[];
}

const props = defineProps<Props>();

defineOptions({
  name: 'TimelineWidget',
});

const usefulEvents = computed(() => {
  return props.Events.filter(
    (ev: any) => !['dribble', 'tackle'].includes(ev.type)
  );
});

const eventClass = (type: string) => {
  switch (type) {
    case 'match':
      return 'dot-yellow';
    case 'save':
      return 'dot-blue';
    case 'miss':
      return 'dot-red';
    case 'goal':
      return 'dot-green';
    case 'foul':
      return 'dot-orange';
    default:
      return 'dot-grey';
  }
};
</script>

<style scoped>
.timeline {
  font-size: 13px;
  line-height: 1.7;
}
.timeline-empty {
  opacity: 0.6;
}
.timeline-row {
  display: flex;
  align-items: baseline;
  gap: 6px;
  padding: 3px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}
.timeline-time {
  opacity: 0.6;
  min-width: 30px;
}
.timeline-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}
.dot-yellow { background: #e9b34a; }
.dot-blue { background: #3b82f6; }
.dot-red { background: #ef4444; }
.dot-green { background: #22c55e; }
.dot-orange { background: #f97316; }
.dot-grey { background: #8ba597; }
</style>
