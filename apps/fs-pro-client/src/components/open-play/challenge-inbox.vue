<template>
  <div class="challenge-inbox">
    <v-tabs v-model="tab" density="compact" grow>
      <v-tab value="incoming">
        Incoming
        <v-badge v-if="store.incoming.length" :content="store.incoming.length" color="red" inline />
      </v-tab>
      <v-tab value="outgoing">Sent</v-tab>
      <v-tab value="upcoming">Upcoming</v-tab>
      <v-tab value="history">History</v-tab>
    </v-tabs>
    <div class="pt-3 d-flex flex-column ga-2" :style="maxHeight ? { maxHeight, overflowY: 'auto' } : undefined">
      <challenge-card
        v-for="c in list"
        :key="c.id"
        :challenge="c"
        :today="store.settings?.currentDay ?? null"
        @done="notify($event)"
        @error="notify($event, true)"
      />
      <div v-if="!list.length" class="text-center text-medium-emphasis py-6">{{ empty }}</div>
    </div>
    <v-snackbar v-model="snack.show" :color="snack.error ? 'red-darken-2' : 'teal-darken-2'" timeout="3500">
      {{ snack.text }}
    </v-snackbar>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import ChallengeCard from './challenge-card.vue';
import { useOpenPlayStore } from '@/store/open-play';

withDefaults(defineProps<{ maxHeight?: string }>(), { maxHeight: '' });

const store = useOpenPlayStore();
const tab = ref<'incoming' | 'outgoing' | 'upcoming' | 'history'>(store.incoming.length ? 'incoming' : 'upcoming');
// Open on Incoming when challenges are waiting, until the user picks a tab.
let picked = false;
watch(tab, () => (picked = true), { flush: 'sync' });
watch(
  () => store.incoming.length,
  (n) => {
    if (!picked && n && tab.value !== 'incoming') {
      tab.value = 'incoming';
      picked = false;
    }
  },
  { immediate: true }
);
const list = computed(() => {
  const l = store[tab.value];
  return tab.value === 'history' ? [...l].reverse().slice(0, 30) : l;
});
const empty = computed(
  () =>
    ({
      incoming: 'No challenges waiting for you',
      outgoing: 'You have no open challenges',
      upcoming: 'No accepted matches coming up',
      history: 'Nothing played yet',
    })[tab.value]
);
const snack = reactive({ show: false, text: '', error: false });
function notify(text: string, error = false) {
  Object.assign(snack, { show: true, text, error });
}
</script>
