<template>
  <v-data-table
    :headers="headers"
    :items="players"
    :loading="!players"
    :search="search"
    no-data-text="No players available"
    no-results-text="No players match your search"
    loading-text="Fetching players..."
    class="elevation-1"
  >
    <template v-slot:item.FirstName="{ item }">
      <div
        class="cursor-pointer d-inline-flex align-center player-name-cell"
        @click.stop="$emit('scout-player', item)"
        title="Click to view details & Jev scouting analysis"
      >
        <strong class="text-slate-100 hover:text-cyan-300 transition-colors">
          {{ item.FirstName }} {{ item.LastName }}
        </strong>
        <v-chip
          v-if="item.isYouth"
          size="x-small"
          color="teal"
          variant="flat"
          class="ml-1 text-white"
        >
          Youth
        </v-chip>
        <v-icon size="14" class="ml-1 text-cyan-400 opacity-60">mdi-eye-outline</v-icon>
      </div>
    </template>

    <template v-slot:item.Rating="{ item }">
      <v-chip :color="getColor(item.Rating)">
        {{ Math.round(item.Rating) }}
      </v-chip>
    </template>

    <template v-slot:item.source="{ item }">
      <v-chip
        v-if="item.source && (item.source.includes('Overseas') || item.source.includes('Free Agent'))"
        size="x-small"
        color="blue-darken-2"
        variant="tonal"
      >
        🌍 {{ item.source }}
      </v-chip>
      <v-chip v-else size="x-small" color="indigo" variant="tonal">
        {{ item.source }}
      </v-chip>
    </template>

    <template v-slot:item.Value="{ item }">
      {{ currency(item.Value) }}
    </template>

    <template v-slot:item.Wage="{ item }">
      {{ currency(item.Wage) }}
    </template>

    <template v-slot:item.Actions="{ item }">
      <div class="d-flex align-center">
        <v-tooltip location="top">
          <template v-slot:activator="{ props: scoutProps }">
            <v-btn
              icon
              variant="tonal"
              color="cyan-lighten-2"
              size="small"
              class="mr-2"
              v-bind="scoutProps"
              @click.stop="$emit('scout-player', item)"
            >
              <v-icon size="small">mdi-brain</v-icon>
            </v-btn>
          </template>
          Scout Player & Jev Analysis
        </v-tooltip>

        <v-tooltip :disabled="(item.Value ?? 0) <= myBudget" location="top">
          <template v-slot:activator="{ props: tooltipProps }">
            <span v-bind="tooltipProps">
              <v-btn
                icon
                size="small"
                color="success-lighten-2"
                :disabled="(item.Value ?? 0) > myBudget"
                @click.stop="$emit('buy-player', item)"
              >
                <v-icon size="small">mdi-cash-plus</v-icon>
              </v-btn>
            </span>
          </template>
          Not enough Budget for this player
        </v-tooltip>
      </div>
    </template>
  </v-data-table>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import type { Player } from '@repo/api-contract';
import { currency } from '@/helpers/misc';

export interface MarketPlayer extends Player {
  source: string;
}

interface Props {
  players: MarketPlayer[];
  myBudget: number;
  search?: string;
}

defineProps<Props>();

defineEmits<{
  'buy-player': [player: MarketPlayer];
  'scout-player': [player: MarketPlayer];
}>();

const headers = ref<any[]>([
  { title: 'Player', key: 'FirstName' },
  { title: 'Position', key: 'Position', filterable: false },
  { title: 'Age', key: 'Age', filterable: false },
  { title: 'Rating', key: 'Rating', filterable: false },
  { title: 'Origin / Club', key: 'source', filterable: true },
  { title: 'Value', key: 'Value', filterable: false },
  { title: 'Wage', key: 'Wage', filterable: false },
  { title: 'Actions', key: 'Actions', filterable: false, sortable: false },
]);

const getColor = (rating: number): string => {
  if (rating >= 80) return 'green';
  else if (rating >= 50) return 'orange';
  else return 'red';
};
</script>
