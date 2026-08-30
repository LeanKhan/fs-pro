<template>
  <div v-if="show" class="lobby-backdrop">
    <div class="lobby-modal">
      <div class="lobby-header">Get ready to play!</div>

      <div class="lobby-sides">
        <div class="lobby-side" :class="{ ready: player1Ready }">
          <img
            v-if="home"
            class="lobby-kit"
            :src="`${api}/img/clubs/kits/${home.ClubCode}-kit.png`"
          />
          <div class="lobby-name">{{ home?.Name }}</div>
          <div class="lobby-status">
            <template v-if="!player1Ready">Are you ready?</template>
            <template v-else>Oya na! ✓</template>
          </div>
          <button
            class="lobby-btn"
            :class="{ active: player1Ready }"
            @click="player1Ready = !player1Ready"
          >
            READY
          </button>
        </div>

        <div class="lobby-side" :class="{ ready: player2Ready }">
          <img
            v-if="away"
            class="lobby-kit"
            :src="`${api}/img/clubs/kits/${away.ClubCode}-kit.png`"
          />
          <div class="lobby-name">{{ away?.Name }}</div>
          <div class="lobby-status">
            <template v-if="!player2Ready">Are you ready?</template>
            <template v-else>Oya na! ✓</template>
          </div>
          <button
            class="lobby-btn"
            :class="{ active: player2Ready }"
            @click="player2Ready = !player2Ready"
          >
            READY
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { apiUrl } from '@/services/api';

interface Props {
  show: boolean;
  home: any;
  away: any;
}

withDefaults(defineProps<Props>(), {
  show: false,
});

const emit = defineEmits<{
  'update:show': [value: boolean];
  'all-ready': [];
}>();

const player1Ready = ref(false);
const player2Ready = ref(false);
const api = ref(apiUrl);

const allReady = computed(() => {
  return player1Ready.value && player2Ready.value;
});

watch(
  allReady,
  (ready: boolean) => {
    if (ready) {
      emit('all-ready');
    }
  },
  { immediate: true }
);
</script>

<style scoped>
.lobby-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}
.lobby-modal {
  width: 90%;
  max-width: 650px;
  background: #12241a;
  border: 1px solid #23392c;
  border-radius: 8px;
  overflow: hidden;
}
.lobby-header {
  text-align: center;
  padding: 12px;
  background: #1f5539;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
.lobby-sides {
  display: flex;
}
.lobby-side {
  flex: 1;
  padding: 20px;
  text-align: center;
  transition: background 150ms ease;
}
.lobby-side.ready {
  background: rgba(233, 179, 74, 0.12);
}
.lobby-side + .lobby-side {
  border-left: 1px solid #23392c;
}
.lobby-kit {
  max-width: 140px;
  margin: 0 auto 10px;
  display: block;
}
.lobby-name {
  font-size: 16px;
  font-weight: 700;
  margin-bottom: 6px;
}
.lobby-status {
  font-size: 13px;
  opacity: 0.75;
  margin-bottom: 12px;
}
.lobby-btn {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.04em;
  background: transparent;
  color: #eef3ec;
  border: 1px solid #e9b34a;
  border-radius: 6px;
  padding: 8px 16px;
  cursor: pointer;
}
.lobby-btn.active {
  background: #e9b34a;
  color: #12241a;
}
</style>
