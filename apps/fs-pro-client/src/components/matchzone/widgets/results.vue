<template>
  <table v-if="matchDetails" class="results-table">
    <tbody>
      <tr class="results-badges">
        <td><img class="results-badge" :src="`/club-icons/${home}.svg`" /></td>
        <td>-</td>
        <td><img class="results-badge" :src="`/club-icons/${away}.svg`" /></td>
      </tr>
      <tr v-for="(stat, i) in statLabels" :key="i">
        <td>{{ matchDetails.Home[stat.key] }}</td>
        <td class="results-label">{{ stat.label }}</td>
        <td>{{ matchDetails.Away[stat.key] }}</td>
      </tr>
    </tbody>
  </table>
</template>
<script setup lang="ts">
import { ref } from 'vue';

interface Props {
  home: string;
  away: string;
  matchDetails: any;
}

defineProps<Props>();

const statLabels = ref([
  { label: 'Goals', key: 'Goals' },
  { label: 'Possession', key: 'Possession' },
  { label: 'Passes', key: 'Passes' },
  { label: 'Shots on Target', key: 'ShotsOnTarget' },
  { label: 'Fouls', key: 'Fouls' },
  { label: 'Yellow Cards', key: 'YellowCards' },
  { label: 'Red Cards', key: 'RedCards' },
]);
</script>

<style scoped>
.results-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
.results-table td {
  padding: 6px 4px;
  text-align: center;
}
.results-badges .results-badge {
  width: 30px;
  height: 30px;
}
.results-label {
  font-weight: 700;
  opacity: 0.85;
}
</style>
