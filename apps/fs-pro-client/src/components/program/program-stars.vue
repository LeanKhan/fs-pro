<template>
  <div class="op-stars" :class="size" :aria-label="`${stars} of 3 stars`">
    <span
      v-for="i in 3"
      :key="i"
      class="op-star"
      :class="{ on: i <= shown, dim: i > shown }"
      aria-hidden="true"
      v-html="icon('star')"
    />
    <div v-if="label && reasons.length" class="op-stars-why">
      <div v-for="(r, i) in reasons" :key="i">• {{ r }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { icon } from '@/components/cozy/icons';
import { sfx } from '@/services/sfx';

/**
 * The 1-3 star reveal (rule: stars are decision quality, not completion). Each
 * star pops in with a chime; reduced motion shows them all at once.
 */
const props = withDefaults(
  defineProps<{ stars: number; size?: 'sm' | 'lg'; label?: boolean; reasons?: string[] }>(),
  { size: 'lg', label: false, reasons: () => [] }
);

const shown = ref(0);
let timer: ReturnType<typeof setInterval> | undefined;

onMounted(() => {
  const count = Math.max(0, Math.min(3, Math.round(props.stars)));
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (reduce || count === 0) {
    shown.value = count;
    return;
  }
  let i = 0;
  timer = setInterval(() => {
    i += 1;
    shown.value = i;
    sfx.play('star');
    if (i >= count && timer) clearInterval(timer);
  }, 240);
});

onBeforeUnmount(() => timer && clearInterval(timer));
</script>

<style scoped>
.op-stars {
  display: flex;
  gap: 6px;
  align-items: center;
  flex-wrap: wrap;
}
.op-star {
  width: 34px;
  height: 34px;
  display: inline-block;
  filter: drop-shadow(0 2px 0 rgba(70, 40, 15, 0.25));
  transform: scale(0.6);
  opacity: 0.35;
  transition: transform 0.28s cubic-bezier(0.2, 1.6, 0.4, 1), opacity 0.2s;
}
.op-star.on {
  transform: scale(1);
  opacity: 1;
}
.op-stars.sm .op-star {
  width: 20px;
  height: 20px;
}
.op-star :deep(svg) {
  width: 100%;
  height: 100%;
}
.op-stars-why {
  width: 100%;
  margin-top: 4px;
  font-size: 13px;
  color: #6f5940;
}
@media (prefers-reduced-motion: reduce) {
  .op-star {
    transition: none;
  }
}
</style>
