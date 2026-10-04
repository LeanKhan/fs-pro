<template>
  <form class="form" @submit.prevent="submit">
    <label>Name<input v-model="name" maxlength="30" placeholder="e.g. Verdania" @input="!codeTouched && (code = suggestCode(name))" /></label>
    <label>Code<input v-model="code" maxlength="4" class="code" @input="code = code.toUpperCase().replace(/[^A-Z0-9]/g, ''); codeTouched = true" /></label>
    <div class="label">Flag</div>
    <div class="flagpick">
      <div v-for="i in [0, 1]" :key="i" class="swatches">
        <button
          v-for="c in CREST_PALETTE"
          :key="c"
          type="button"
          class="sw"
          :class="{ on: colors[i] === c }"
          :style="{ background: c }"
          :aria-label="`Flag colour ${i + 1}: ${c}`"
          @click="colors[i] = c"
        ></button>
      </div>
      <div class="flag big" aria-hidden="true"><i :style="{ background: colors[0] }"></i><i :style="{ background: colors[1] }"></i></div>
    </div>
    <label><span>Motto <small>(optional)</small></span><input v-model="motto" maxlength="80" placeholder="Unity, Football, Biscuits" /></label>
    <p v-if="error" class="warn">{{ error }}</p>
    <div class="row-btns sticky">
      <button class="btn" type="button" @click="emit('cancel')">Cancel</button>
      <button class="btn primary" type="submit" :disabled="busy || !name.trim()">Found {{ name.trim() || 'country' }}</button>
    </div>
  </form>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue';
import { CREST_PALETTE, suggestCode, type AtlasCountry } from '@repo/api-contract';
import { client } from '@/services/api';
import { unwrap } from '@/store/open-play';

const props = defineProps<{ spot: { x: number; y: number } }>();
const emit = defineEmits<{ (e: 'founded', c: AtlasCountry): void; (e: 'cancel'): void }>();

const name = ref('');
const code = ref('');
const codeTouched = ref(false);
const colors = reactive<[string, string]>(['#2f8a1c', '#f5b82e']);
const motto = ref('');
const busy = ref(false);
const error = ref('');

async function submit() {
  busy.value = true;
  error.value = '';
  try {
    const c = unwrap<AtlasCountry>(
      await client.atlas.foundCountry.mutation({
        body: { name: name.value, code: code.value, colors: [colors[0], colors[1]], motto: motto.value || undefined, ...props.spot },
      })
    );
    emit('founded', c);
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    busy.value = false;
  }
}
</script>
