<template>
  <dialog ref="dialogRef" class="place-picker-modal" @close="closeModal">
    <div class="modal-content">
      <header>
        <h3>Select a Place</h3>
        <button type="button" @click="closeModal" class="close-btn">×</button>
      </header>
      <div class="iframe-container">
        <iframe
          v-if="modelValue"
          :src="iframeSrc"
          class="picker-iframe"
          frameborder="0"
        ></iframe>
      </div>
      <footer>
        <button type="button" @click="closeModal" class="btn btn-secondary">Cancel</button>
      </footer>
    </div>
  </dialog>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, computed } from 'vue';
import type { PickedPlace } from '@/utils/worldPlace';

const props = defineProps<{
  modelValue: boolean;
  worldSlug: string;
  /** Restrict the picker to one place kind, e.g. 'country'. */
  kind?: string;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
  (e: 'select', place: PickedPlace): void;
}>();

const dialogRef = ref<HTMLDialogElement | null>(null);

const imaginationUrl = import.meta.env.VITE_IMAGINATION_URL || 'http://localhost:5173';

const iframeSrc = computed(() => {
  const origin = encodeURIComponent(window.location.origin);
  const kind = props.kind ? `&kind=${encodeURIComponent(props.kind)}` : '';
  return `${imaginationUrl}/w/${props.worldSlug}/pick?origin=${origin}${kind}`;
});

watch(() => props.modelValue, (isOpen) => {
  if (isOpen) {
    dialogRef.value?.showModal();
  } else {
    dialogRef.value?.close();
  }
});

const closeModal = () => {
  emit('update:modelValue', false);
};

const handleMessage = (event: MessageEvent) => {
  let expectedOrigin = imaginationUrl;
  try {
    expectedOrigin = new URL(imaginationUrl).origin;
  } catch {
    // fallback to imaginationUrl string as is
  }
  if (event.origin !== expectedOrigin) {
    return;
  }

  if (event.data?.type === 'place-selected') {
    emit('select', event.data.place);
    closeModal();
  }
};

onMounted(() => {
  window.addEventListener('message', handleMessage);
  if (props.modelValue) {
    dialogRef.value?.showModal();
  }
});

onUnmounted(() => {
  window.removeEventListener('message', handleMessage);
});
</script>

<style scoped>
.place-picker-modal {
  width: 90vw;
  max-width: 800px;
  height: 80vh;
  padding: 0;
  border: none;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  background: white;
}

.place-picker-modal::backdrop {
  background: rgba(0, 0, 0, 0.5);
}

.modal-content {
  display: flex;
  flex-direction: column;
  height: 100%;
}

header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem;
  border-bottom: 1px solid #eee;
}

header h3 {
  margin: 0;
}

.close-btn {
  background: none;
  border: none;
  font-size: 1.5rem;
  cursor: pointer;
  padding: 0;
  line-height: 1;
}

.iframe-container {
  flex: 1;
  min-height: 0;
}

.picker-iframe {
  width: 100%;
  height: 100%;
}

footer {
  padding: 1rem;
  border-top: 1px solid #eee;
  display: flex;
  justify-content: flex-end;
}

.btn {
  padding: 0.5rem 1rem;
  border-radius: 4px;
  border: 1px solid #ccc;
  background: #f8f9fa;
  cursor: pointer;
}

.btn:hover {
  background: #e2e6ea;
}
</style>
