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
    <template v-slot:item.Rating="{ item }">
      <v-chip :color="getColor(item.Rating)">
        {{ Math.round(item.Rating) }}
      </v-chip>
    </template>

    <template v-slot:item.Value="{ item }">
      {{ currency(item.Value) }}
    </template>

    <template v-slot:item.Wage="{ item }">
      {{ currency(item.Wage) }}
    </template>

    <template v-slot:item.Actions="{ item }">
      <v-tooltip :disabled="(item.Value ?? 0) <= myBudget" location="top">
        <template v-slot:activator="{ props: tooltipProps }">
          <span v-bind="tooltipProps">
            <v-btn
              icon
              color="success-lighten-2"
              :disabled="(item.Value ?? 0) > myBudget"
              @click="$emit('buy-player', item)"
            >
              <v-icon size="small">mdi-cash-plus</v-icon>
            </v-btn>
          </span>
        </template>
        Not enough Budget for this player
      </v-tooltip>
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
}>();

const headers = ref<any[]>([
  { title: 'First Name', key: 'FirstName' },
  { title: 'Last Name', key: 'LastName' },
  { title: 'Position', key: 'Position', filterable: false },
  { title: 'Age', key: 'Age', filterable: false },
  { title: 'Rating', key: 'Rating', filterable: false },
  { title: 'Source', key: 'source', filterable: true },
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
