<template>
  <div v-if="modelValue" class="modal-root open">
    <div class="backdrop" @click="close"></div>
    <div
      ref="panel"
      class="modal"
      :class="size"
      role="dialog"
      aria-modal="true"
      :aria-label="label"
      tabindex="-1"
      @keydown.tab="trapTab"
    >
      <button
        class="x"
        aria-label="Close"
        @click="close"
        v-html="icon('close')"
      ></button>
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { icon } from './icons';

/**
 * The cozy overlay. Beyond the visual shell it is a real modal for assistive
 * tech (U-13): role=dialog + aria-modal, focus moves into it on open and is
 * trapped, Escape (or the backdrop) dismisses, and focus returns to the
 * trigger on close. The backdrop/scroll lock live here so every overlay that
 * uses this shell inherits the behaviour.
 */
const props = withDefaults(
  defineProps<{
    modelValue: boolean;
    size?: 'small' | 'wide';
    label?: string;
  }>(),
  { label: 'Dialog' }
);
const emit = defineEmits<{ (e: 'update:modelValue', v: boolean): void }>();

const panel = ref<HTMLElement | null>(null);
let restore: HTMLElement | null = null;

const SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function focusables(): HTMLElement[] {
  const root = panel.value;
  if (!root) return [];
  return Array.from(root.querySelectorAll<HTMLElement>(SELECTOR)).filter(
    (el) => el.offsetParent !== null || el === document.activeElement
  );
}

/** Keep Tab / Shift+Tab inside the dialog. */
function trapTab(e: KeyboardEvent) {
  const list = focusables();
  if (!list.length) {
    e.preventDefault();
    panel.value?.focus();
    return;
  }
  const first = list[0]!;
  const last = list[list.length - 1]!;
  const active = document.activeElement as HTMLElement | null;
  if (e.shiftKey && (active === first || active === panel.value)) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && active === last) {
    e.preventDefault();
    first.focus();
  }
}

/** Escape always dismisses, even if focus slipped outside the panel. */
function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.stopPropagation();
    close();
  }
}

const close = () => emit('update:modelValue', false);

watch(
  () => props.modelValue,
  async (open) => {
    if (open) {
      restore = (document.activeElement as HTMLElement | null) ?? null;
      document.addEventListener('keydown', onKeydown, true);
      document.body.style.overflow = 'hidden';
      await nextTick();
      (focusables()[0] ?? panel.value)?.focus();
    } else {
      document.removeEventListener('keydown', onKeydown, true);
      document.body.style.overflow = '';
      restore?.focus?.();
      restore = null;
    }
  },
  { immediate: true }
);

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown, true);
  document.body.style.overflow = '';
});
</script>
