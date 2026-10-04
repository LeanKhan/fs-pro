<template>
  <div class="crest-designer">
    <div class="cd-preview">
      <img :src="crestDataUrl(modelValue, 'preview')" alt="Your crest" width="150" height="168" />
      <button class="btn small" type="button" @click="shuffle" v-html="`${icon('rotate')} Shuffle`"></button>
    </div>
    <div class="cd-options">
      <div class="cd-row">
        <h4>Shape</h4>
        <div class="cd-choices">
          <button
            v-for="s in CREST_SHAPES"
            :key="s"
            type="button"
            class="cd-choice"
            :class="{ on: modelValue.shape === s }"
            :aria-label="s"
            :aria-pressed="modelValue.shape === s"
            @click="set({ shape: s })"
          >
            <img :src="crestDataUrl({ ...modelValue, shape: s, emblem: 'none', initials: '' }, `s-${s}`)" alt="" />
          </button>
        </div>
      </div>
      <div class="cd-row">
        <h4>Pattern</h4>
        <div class="cd-choices">
          <button
            v-for="p in CREST_PATTERNS"
            :key="p"
            type="button"
            class="cd-choice"
            :class="{ on: modelValue.pattern === p }"
            :aria-label="p"
            :aria-pressed="modelValue.pattern === p"
            @click="set({ pattern: p })"
          >
            <img :src="crestDataUrl({ ...modelValue, pattern: p, emblem: 'none', initials: '' }, `p-${p}`)" alt="" />
          </button>
        </div>
      </div>
      <div class="cd-row">
        <h4>Emblem</h4>
        <div class="cd-choices">
          <button
            v-for="e in CREST_EMBLEMS"
            :key="e"
            type="button"
            class="cd-choice"
            :class="{ on: modelValue.emblem === e }"
            :aria-label="e"
            :aria-pressed="modelValue.emblem === e"
            @click="set({ emblem: e })"
          >
            <img :src="crestDataUrl({ ...modelValue, emblem: e, initials: e === 'none' ? modelValue.initials : '' }, `e-${e}`)" alt="" />
          </button>
        </div>
      </div>
      <div v-for="slot in SLOTS" :key="slot.key" class="cd-row">
        <h4>{{ slot.label }}</h4>
        <div class="cd-swatches">
          <button
            v-for="c in CREST_PALETTE"
            :key="c"
            type="button"
            class="cd-swatch"
            :class="{ on: modelValue[slot.key] === c }"
            :style="{ background: c }"
            :aria-label="`${slot.label} ${c}`"
            :aria-pressed="modelValue[slot.key] === c"
            @click="set({ [slot.key]: c })"
          ></button>
          <label class="cd-swatch custom" :title="`Any ${slot.label.toLowerCase()} colour`">
            <input type="color" :value="modelValue[slot.key]" @input="set({ [slot.key]: ($event.target as HTMLInputElement).value })" />
          </label>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  CREST_EMBLEMS,
  CREST_PALETTE,
  CREST_PATTERNS,
  CREST_SHAPES,
  crestDataUrl,
  randomCrest,
  type CrestDesign,
} from '@repo/api-contract';
import { icon } from '@/components/cozy/icons';

const props = defineProps<{ modelValue: CrestDesign }>();
const emit = defineEmits<{ (e: 'update:modelValue', v: CrestDesign): void }>();

const SLOTS = [
  { key: 'primary', label: 'Kit colour' },
  { key: 'secondary', label: 'Second colour' },
  { key: 'trim', label: 'Badge colour' },
] as const;

function set(patch: Partial<CrestDesign>) {
  emit('update:modelValue', { ...props.modelValue, ...patch });
}

function shuffle() {
  set({ ...randomCrest(`${Math.random()}`), initials: props.modelValue.initials });
}
</script>

<style scoped>
.crest-designer {
  display: grid;
  grid-template-columns: 170px 1fr;
  gap: 16px;
  align-items: start;
}
.cd-preview {
  position: sticky;
  top: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 12px;
  border-radius: 16px;
  background: radial-gradient(circle at 50% 35%, #fffaf0, #f1dfb6);
  border: 3px solid #e2cc9c;
}
.cd-preview img {
  filter: drop-shadow(0 6px 0 rgba(70, 40, 15, 0.25));
}
.cd-row h4 {
  margin: 4px 0 6px;
  font-size: 15px;
}
.cd-row + .cd-row {
  margin-top: 8px;
}
.cd-choices {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.cd-choice {
  width: 46px;
  height: 50px;
  padding: 4px;
  border-radius: 10px;
  background: #fffaf0;
  border: 2px solid #eadbb8;
  display: grid;
  place-items: center;
  transition: transform 0.1s;
}
.cd-choice img {
  width: 34px;
  height: 38px;
}
.cd-choice:hover {
  transform: translateY(-2px);
}
.cd-choice.on {
  border-color: #3fa526;
  background: #eaf8e0;
  box-shadow: 0 2px 0 #2c7d18;
}
.cd-swatches {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.cd-swatch {
  position: relative;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 3px solid #fffaf0;
  box-shadow: 0 0 0 2px #c9a46a;
  cursor: pointer;
}
.cd-swatch.on {
  box-shadow: 0 0 0 3px #3fa526, 0 3px 0 3px #2c7d18;
  transform: scale(1.08);
}
.cd-swatch.custom {
  background: conic-gradient(#e5402f, #f5b82e, #5cc23a, #3a8ee0, #6a3fb5, #e5402f);
  overflow: hidden;
}
.cd-swatch.custom input {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
}
@media (max-width: 640px) {
  .crest-designer {
    grid-template-columns: 1fr;
  }
  .cd-preview {
    position: static;
    flex-direction: row;
    justify-content: center;
  }
  .cd-preview img {
    width: 96px;
    height: 108px;
  }
}
</style>
