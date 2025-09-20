<template>
  <v-timeline>
    <v-timeline-item
      v-for="(event, i) in usefulEvents"
      :key="i"
      :color="eventColor(event.type)"
      :icon="eventIcon(event.type)"
    >
      <template v-slot:opposite>
        <span class="font-weight-bold">"{{ event.time }}</span>
      </template>
      {{ event.message }}
    </v-timeline-item>
  </v-timeline>
</template>
<script setup lang="ts">
import { computed } from 'vue';

interface Props {
  Events: any | { message: string; time: string | number; type: string }[];
}

const props = defineProps<Props>();

const usefulEvents = computed(() => {
  return props.Events.filter(
    (ev: any) => !['dribble', 'tackle'].includes(ev.type)
  );
});

const eventColor = (type: string) => {
  switch (type) {
    case 'match':
      return 'yellow';
    case 'save':
      return 'blue';
    case 'miss':
      return 'red';
    case 'goal':
      return 'green accent-3';
  }
};

const eventIcon = (type: string) => {
  switch (type) {
    case 'match':
      return 'mdi-flag';
    case 'save':
      return 'mdi-shield';
    case 'miss':
      return 'mdi-close-thick';
    case 'goal':
      return 'mdi-soccer';
  }
};
</script>
