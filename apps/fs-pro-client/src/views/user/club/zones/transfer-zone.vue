<template>
  <v-card>
    <v-card-title>
      Transfer Market
      <v-spacer></v-spacer>
      <v-chip color="green">Budget: {{ currency(club.Budget) }}</v-chip>
    </v-card-title>

    <v-card-text>
      <v-row dense>
        <v-col cols="12" md="6">
          <v-text-field
            v-model="search"
            append-icon="mdi-magnify"
            label="Search"
            single-line
            hide-details
            clearable
          ></v-text-field>
        </v-col>
        <v-col cols="12" md="6">
          <v-btn-toggle v-model="filter" mandatory>
            <v-btn value="all">All</v-btn>
            <v-btn value="free-agents">Free Agents</v-btn>
            <v-btn value="other-clubs">Other Clubs</v-btn>
          </v-btn-toggle>
        </v-col>
      </v-row>
    </v-card-text>

    <transfer-market-table
      :players="filteredPlayers"
      :my-budget="club.Budget ?? 0"
      :search="search"
      @buy-player="openBuyDialog"
    ></transfer-market-table>

    <buy-player-dialog
      v-model:show="showBuyDialog"
      :player="selectedPlayer"
      :club="club._id"
      :my-budget="club.Budget ?? 0"
      @update-available="onPurchase"
    ></buy-player-dialog>
  </v-card>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { client } from '@/services/api';
import { currency } from '@/helpers/misc';
import TransferMarketTable from '@/components/players/transfer-market-table.vue';
import BuyPlayerDialog from '@/components/players/buy-player-dialog.vue';
import type { MarketPlayer } from '@/components/players/transfer-market-table.vue';

const props = defineProps<{ club: any }>();
const emit = defineEmits<{ (e: 'update-available'): void }>();

const freeAgents = ref<MarketPlayer[]>([]);
const otherClubsPlayers = ref<MarketPlayer[]>([]);
const search = ref('');
const filter = ref<'all' | 'free-agents' | 'other-clubs'>('all');
const showBuyDialog = ref(false);
const selectedPlayer = ref<MarketPlayer | null>(null);

const filteredPlayers = computed<MarketPlayer[]>(() => {
  if (filter.value === 'free-agents') return freeAgents.value;
  if (filter.value === 'other-clubs') return otherClubsPlayers.value;
  return [...freeAgents.value, ...otherClubsPlayers.value];
});

async function loadFreeAgents() {
  try {
    const response = await client.players.getPlayers.query({
      query: { isSigned: false },
    });
    if (response.status === 200) {
      freeAgents.value = response.body.payload.map((p) => ({
        ...p,
        source: 'Free Agent',
      }));
    }
  } catch (error) {
    console.error('Error loading free agents:', error);
  }
}

async function loadOtherClubsPlayers() {
  if (!props.club?._id) return;

  try {
    const response = await client.players.getPlayers.query({
      query: { isSigned: true, excludeClubId: props.club._id },
    });
    if (response.status === 200) {
      otherClubsPlayers.value = response.body.payload.map((p) => ({
        ...p,
        source: p.ClubCode ?? 'Other Club',
      }));
    }
  } catch (error) {
    console.error("Error loading other clubs' players:", error);
  }
}

function openBuyDialog(player: MarketPlayer) {
  selectedPlayer.value = player;
  showBuyDialog.value = true;
}

function onPurchase() {
  emit('update-available');
  loadFreeAgents();
  loadOtherClubsPlayers();
}

watch(
  () => props.club?._id,
  (id) => {
    if (id) loadOtherClubsPlayers();
  }
);

onMounted(() => {
  loadFreeAgents();
  loadOtherClubsPlayers();
});
</script>
