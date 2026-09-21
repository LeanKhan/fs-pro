<template>
  <a
    v-if="entityId"
    :href="entityUrl"
    target="_blank"
    rel="noopener noreferrer"
    class="world-entity-link"
    :title="title || 'Explore in Imaginations World Wiki'"
    @click="handleClick"
  >
    <slot>{{ fallback }}</slot>
    <span class="world-entity-icon">↗</span>
  </a>
  <span v-else>
    <slot>{{ fallback }}</slot>
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  entityId?: string | null;
  fallback?: string | number | null;
  title?: string;
  peek?: boolean;
}>();

const emit = defineEmits<{
  (e: 'peek', entityId: string): void;
}>();

const imaginationUrl = import.meta.env.VITE_IMAGINATION_URL || 'http://localhost:5173';

const entityUrl = computed(() => {
  if (!props.entityId) return '#';
  return `${imaginationUrl}/entity/${encodeURIComponent(props.entityId)}`;
});

function handleClick(e: MouseEvent) {
  if (props.peek) {
    e.preventDefault();
    emit('peek', props.entityId!);
  }
}
</script>

<style scoped>
.world-entity-link {
  color: inherit;
  text-decoration: underline dotted #6366f1;
  text-underline-offset: 3px;
  transition: color 0.15s ease, text-decoration-color 0.15s ease;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 2px;
}

.world-entity-link:hover {
  color: #6366f1;
  text-decoration: underline solid #6366f1;
}

.world-entity-icon {
  font-size: 0.75em;
  opacity: 0.6;
  line-height: 1;
}

.world-entity-link:hover .world-entity-icon {
  opacity: 1;
}
</style>
