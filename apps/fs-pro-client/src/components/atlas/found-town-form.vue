<template>
  <form class="form" @submit.prevent="submit">
    <label>Name<input v-model="name" maxlength="30" placeholder="e.g. Port Ellis" /></label>
    <div class="label">Setting <small>(sets the look of every club's grounds here)</small></div>
    <div class="terrains">
      <button v-for="t in TERRAINS" :key="t.key" type="button" class="terrain" :class="[t.key, { on: terrain === t.key }]" @click="terrain = t.key">
        <span class="t-art" aria-hidden="true"></span><b>{{ t.label }}</b><small>{{ t.blurb }}</small>
      </button>
    </div>
    <p v-if="error" class="warn">{{ error }}</p>
    <div class="row-btns sticky">
      <button class="btn" type="button" @click="emit('cancel')">Cancel</button>
      <button class="btn primary" type="submit" :disabled="busy || !name.trim()">Found {{ name.trim() || 'town' }}</button>
    </div>
  </form>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import type { AtlasTown, TownTerrain } from '@repo/api-contract';
import { TERRAINS } from './terrains';
import { client } from '@/services/api';
import { unwrap } from '@/store/open-play';

const props = defineProps<{ countryId: string; spot: { x: number; y: number } }>();
const emit = defineEmits<{ (e: 'founded', t: AtlasTown): void; (e: 'cancel'): void }>();

const name = ref('');
const terrain = ref<TownTerrain>('city');
const busy = ref(false);
const error = ref('');

async function submit() {
  busy.value = true;
  error.value = '';
  try {
    const t = unwrap<AtlasTown>(
      await client.atlas.foundTown.mutation({ body: { countryId: props.countryId, name: name.value, terrain: terrain.value, ...props.spot } })
    );
    emit('founded', t);
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    busy.value = false;
  }
}
</script>
