<template>
  <transition name="eb-fade">
    <div v-if="banner" class="eb-wrap" :class="banner.type">
      <div v-if="banner.type === 'goal'" class="eb-confetti">
        <span
          v-for="i in 24"
          :key="i"
          class="eb-piece"
          :style="pieceStyle(i)"
        ></span>
      </div>

      <div class="eb-banner">
        <div class="eb-headline">
          {{ banner.type === 'goal' ? '⚽ GOAL!' : '⇄ SUBSTITUTION' }}
        </div>
        <div class="eb-message">{{ banner.message }}</div>
      </div>
    </div>
  </transition>
</template>

<script setup lang="ts">
defineProps<{
  banner: { type: 'goal' | 'substitution'; message: string } | null;
}>();

const COLORS = ['#e9b34a', '#22c55e', '#3b82f6', '#ef4444', '#eef3ec'];

function pieceStyle(i: number) {
  const angle = (i / 24) * 360 + Math.random() * 12;
  const distance = 90 + Math.random() * 60;
  const dx = Math.cos((angle * Math.PI) / 180) * distance;
  const dy = Math.sin((angle * Math.PI) / 180) * distance;
  return {
    '--dx': `${dx}px`,
    '--dy': `${dy}px`,
    background: COLORS[i % COLORS.length],
    animationDelay: `${Math.random() * 120}ms`,
  };
}
</script>

<style scoped>
.eb-wrap {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  z-index: 20;
}

.eb-banner {
  background: rgba(12, 23, 16, 0.9);
  border: 1px solid #e9b34a;
  border-radius: 10px;
  padding: 10px 22px;
  text-align: center;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.5);
}
.eb-wrap.substitution .eb-banner {
  border-color: #3b82f6;
}

.eb-headline {
  font-size: 22px;
  font-weight: 800;
  letter-spacing: 0.04em;
  color: #e9b34a;
}
.eb-wrap.substitution .eb-headline {
  font-size: 14px;
  color: #93c5fd;
}

.eb-message {
  font-size: 12px;
  opacity: 0.85;
  margin-top: 2px;
}

.eb-confetti {
  position: absolute;
  inset: 0;
  overflow: hidden;
}
.eb-piece {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 8px;
  height: 8px;
  border-radius: 2px;
  transform: translate(-50%, -50%);
  animation: eb-burst 900ms ease-out forwards;
}

@keyframes eb-burst {
  from {
    transform: translate(-50%, -50%) rotate(0deg);
    opacity: 1;
  }
  to {
    transform: translate(calc(-50% + var(--dx)), calc(-50% + var(--dy)))
      rotate(280deg);
    opacity: 0;
  }
}

.eb-fade-enter-active {
  transition: opacity 180ms ease-out;
}
.eb-fade-leave-active {
  transition: opacity 500ms ease-in;
}
.eb-fade-enter-from,
.eb-fade-leave-to {
  opacity: 0;
}
</style>
