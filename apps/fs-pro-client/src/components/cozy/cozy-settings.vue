<template>
  <h2><span v-html="icon('gear')"></span> Settings</h2>
  <div class="set-list">
    <label class="set-row">
      <span class="set-ic" v-html="icon('bolt')"></span>
      <span class="set-text"><b>Sound effects</b><small>Whistles, crowds, coins</small></span>
      <input v-model="sound" type="checkbox" class="toggle" />
    </label>
    <label class="set-row">
      <span class="set-ic" v-html="icon('ball')"></span>
      <span class="set-text"><b>Quick sim</b><small>Skip straight to the result when you press PLAY</small></span>
      <input :checked="quickSim" type="checkbox" class="toggle" @change="emit('update:quickSim', ($event.target as HTMLInputElement).checked)" />
    </label>
    <div class="set-row">
      <span class="set-ic" v-html="icon('clock')"></span>
      <span class="set-text"><b>Match speed</b><small>How fast watched matches play</small></span>
      <span class="seg">
        <button v-for="s in [1, 2, 4]" :key="s" :class="{ on: speed === s }" @click="setSpeed(s)">{{ s }}×</button>
      </span>
    </div>
  </div>

  <h4>Club</h4>
  <div class="set-list">
    <button class="set-row link" @click="emit('act', 'office')">
      <span class="set-ic" v-html="icon('trophy')"></span>
      <span class="set-text"><b>Manager hub</b><small>Matchday, team sheet, squad, transfers, finances</small></span>
    </button>
    <button class="set-row link" @click="emit('act', 'calendar')">
      <span class="set-ic" v-html="icon('clock')"></span>
      <span class="set-text"><b>Year calendar &amp; history</b><small>Every fixture of the year, and past seasons</small></span>
    </button>
    <button class="set-row link" @click="emit('act', 'account')">
      <span class="set-ic" v-html="icon('people')"></span>
      <span class="set-text"><b>Account</b><small>{{ userName || 'Your profile and password' }}</small></span>
    </button>
  </div>
  <div class="row-btns">
    <button class="btn" @click="emit('act', 'logout')"><span v-html="icon('close')"></span>Sign out</button>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { sfx } from '@/services/sfx';
import { icon } from './icons';

defineProps<{ quickSim: boolean; userName?: string }>();
const emit = defineEmits<{ (e: 'update:quickSim', v: boolean): void; (e: 'act', action: string): void }>();

const sound = ref(sfx.enabled);
watch(sound, (on) => (sfx.enabled = on));

const SPEED_KEY = 'fspro_match_speed';
const speed = ref(readSpeed());
function readSpeed() {
  try {
    const v = Number(localStorage.getItem(SPEED_KEY));
    return [1, 2, 4, 8].includes(v) ? v : 2;
  } catch {
    return 2;
  }
}
function setSpeed(s: number) {
  speed.value = s;
  sfx.play('tap');
  try {
    localStorage.setItem(SPEED_KEY, String(s));
  } catch {
    // Private mode: nothing to remember it in.
  }
}
</script>

<style scoped>
.set-list { display: grid; gap: 8px; }
.set-row { display: flex; align-items: center; gap: 12px; width: 100%; padding: 10px 12px; border-radius: 14px; background: #fffaf0; border: 2px solid #eadbb8; text-align: left; cursor: pointer; }
.set-row.link:hover { border-color: var(--green); }
.set-ic :deep(.ic) { width: 30px; height: 30px; }
.set-text { flex: 1; display: grid; }
.set-text small { color: var(--muted); font-size: 13px; }
.toggle { appearance: none; -webkit-appearance: none; width: 52px; height: 30px; border-radius: 16px; background: #d9c9a6; border: 2px solid #b88a4f; position: relative; cursor: pointer; transition: background 0.15s; flex: none; }
.toggle::after { content: ''; position: absolute; top: 2px; left: 2px; width: 22px; height: 22px; border-radius: 50%; background: #fff; box-shadow: 0 2px 0 rgba(0, 0, 0, 0.2); transition: transform 0.15s; }
.toggle:checked { background: var(--green); border-color: var(--green-d); }
.toggle:checked::after { transform: translateX(22px); }
.seg { display: flex; border-radius: 12px; overflow: hidden; border: 2px solid #c39457; flex: none; }
.seg button { padding: 4px 12px; font-weight: 700; background: #fffaf0; }
.seg button + button { border-left: 2px solid #e2cc9c; }
.seg button.on { background: var(--green); color: #fff; }
</style>
