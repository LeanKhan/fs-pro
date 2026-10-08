<template>
  <aside v-if="line" class="op-note" role="note">
    <div class="op-note-tag">Vintra · club secretary</div>
    <p class="op-note-text">{{ line.text }}</p>
  </aside>
</template>

<script setup lang="ts">
import type { AdvisorLine } from '@repo/api-contract';

/**
 * The advisor's framing line for the current step, rendered as a note card.
 * The animated portrait and motion are 3A's component; the program screens only
 * consume the deterministic line the Go engine selects.
 */
defineProps<{ line: AdvisorLine | null }>();
</script>

<style scoped>
.op-note {
  position: relative;
  padding: 12px 16px 12px 18px;
  border-radius: 16px;
  background: linear-gradient(#fffdf5, #f7ead0);
  border: 3px solid #c9a46a;
  box-shadow: 0 3px 0 rgba(70, 40, 15, 0.22);
}
.op-note::before {
  content: '“';
  position: absolute;
  left: 8px;
  top: -2px;
  font-size: 40px;
  line-height: 1;
  color: #d8bb85;
  font-family: Georgia, serif;
}
.op-note-tag {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.4px;
  text-transform: uppercase;
  color: #8a6230;
}
.op-note-text {
  margin: 2px 0 0;
  font-size: 16px;
  line-height: 1.35;
  color: #4a3220;
}
</style>
