<template>
  <div class="position-list">
    <div v-for="(row, i) in modelValue" :key="i" class="d-flex ga-2 align-center mb-1">
      <v-text-field v-model.number="row.position" type="number" label="Rank" density="compact" variant="outlined" hide-details style="max-width: 90px" />
      <v-text-field v-model.number="row.amount" type="number" :prefix="prefix" :suffix="suffix" label="Amount" density="compact" variant="outlined" hide-details />
      <v-btn icon="mdi-close" size="x-small" variant="text" @click="remove(i)" />
    </div>
    <v-btn size="small" variant="text" prepend-icon="mdi-plus" @click="add">Add</v-btn>
  </div>
</template>

<script setup lang="ts">
type Row = { position: number; amount: number };
const props = withDefaults(defineProps<{ modelValue: Row[]; prefix?: string; suffix?: string }>(), { prefix: undefined, suffix: undefined });
const emit = defineEmits<{ (e: 'update:modelValue', v: Row[]): void }>();

function add() {
  const next = (props.modelValue.at(-1)?.position ?? 0) + 1;
  emit('update:modelValue', [...props.modelValue, { position: next, amount: 0 }]);
}
function remove(i: number) {
  emit('update:modelValue', props.modelValue.filter((_, j) => j !== i));
}
</script>
