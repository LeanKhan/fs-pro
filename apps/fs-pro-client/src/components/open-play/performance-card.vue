<template>
  <v-card class="performance-card" variant="elevated">
    <v-card-item>
      <v-card-title class="d-flex align-center">
        <v-icon class="mr-2" color="amber">mdi-clipboard-account</v-icon>
        Board review · Year {{ performance?.year ?? '—' }}
      </v-card-title>
      <v-card-subtitle>Your score across every competition, against the target for Level {{ performance?.level ?? 0 }}</v-card-subtitle>
    </v-card-item>
    <v-card-text v-if="performance">
      <div class="d-flex align-end ga-4 mb-2">
        <div>
          <div class="text-h4 font-weight-black">{{ fmt(performance.score) }}</div>
          <div class="text-caption text-medium-emphasis">score</div>
        </div>
        <div>
          <div class="text-h6">{{ fmt(performance.expected) }}</div>
          <div class="text-caption text-medium-emphasis">target</div>
        </div>
        <v-spacer />
        <v-chip :color="mood.color" variant="flat">{{ mood.label }}</v-chip>
      </div>
      <v-progress-linear :model-value="pct" :color="mood.color" height="8" rounded class="mb-3" />
      <div class="d-flex flex-wrap ga-4 text-body-2 mb-3">
        <span><v-icon size="16">mdi-flag</v-icon> {{ performance.entries }} entries</span>
        <span><v-icon size="16">mdi-trophy</v-icon> {{ performance.trophies }} trophies</span>
        <span>
          <v-icon size="16">mdi-chart-line</v-icon>
          Elo {{ Math.round(performance.eloStart) }} → {{ Math.round(performance.eloEnd) }}
        </span>
        <span>
          <v-icon size="16">mdi-stairs</v-icon>
          Level {{ performance.levelStart }} → {{ performance.levelEnd }}
        </span>
      </div>
      <v-table v-if="performance.finishes.length" density="compact" class="bg-transparent">
        <thead>
          <tr>
            <th>Competition</th>
            <th class="text-right">Finish</th>
            <th class="text-right">Prestige</th>
            <th class="text-right">Score</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="f in performance.finishes" :key="f.seasonId">
            <td>
              <v-icon v-if="f.won" size="14" color="amber">mdi-trophy</v-icon>
              <router-link :to="`/u/competitions/${f.seasonId}`" class="text-decoration-none">{{ f.competitionName }}</router-link>
            </td>
            <td class="text-right">{{ f.finalPosition ?? '—' }}</td>
            <td class="text-right">{{ '★'.repeat(f.prestige) }}</td>
            <td class="text-right">{{ f.finishScore == null ? '—' : fmt(f.finishScore) }}</td>
          </tr>
        </tbody>
      </v-table>
      <div v-else class="text-medium-emphasis text-caption">No competitions finished this year yet.</div>
      <div v-if="performance.levelMoves.length" class="mt-3">
        <div v-for="m in performance.levelMoves" :key="m.day" class="text-caption">
          <v-icon size="14" :color="m.to > m.from ? 'green' : 'red'">{{ m.to > m.from ? 'mdi-arrow-up-bold' : 'mdi-arrow-down-bold' }}</v-icon>
          Day {{ m.day }}: Level {{ m.from }} → {{ m.to }} ({{ m.source }})
        </div>
      </div>
    </v-card-text>
    <v-card-text v-else class="text-medium-emphasis">No performance data yet.</v-card-text>
  </v-card>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { PerformanceView } from '@repo/api-contract';

const props = defineProps<{ performance: PerformanceView | null }>();

const fmt = (n: number) => (Math.abs(n) < 10 ? n.toFixed(2) : Math.round(n).toString());
const pct = computed(() => {
  const p = props.performance;
  if (!p || p.expected <= 0) return 0;
  return Math.min(100, (p.score / p.expected) * 100);
});
const mood = computed(() => {
  const gap = props.performance?.gap ?? 0;
  const expected = props.performance?.expected || 1;
  const ratio = gap / expected;
  if (ratio >= 0.15) return { label: 'Delighted', color: 'green' };
  if (ratio >= -0.05) return { label: 'Satisfied', color: 'teal' };
  if (ratio >= -0.25) return { label: 'Concerned', color: 'amber' };
  return { label: 'Unhappy', color: 'red' };
});
</script>
