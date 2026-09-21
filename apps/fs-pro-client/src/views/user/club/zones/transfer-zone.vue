<template>
  <v-card>
    <v-card-title>
      Transfer Market
      <v-spacer></v-spacer>
      <v-chip color="green">Budget: {{ currency(club.Budget) }}</v-chip>
    </v-card-title>

    <v-alert
      :type="windowState?.open ? 'success' : 'warning'"
      variant="tonal"
      density="compact"
      class="mx-4 mt-2"
    >
      <template v-if="windowState?.open">
        Transfer window is <strong>open</strong>
        <template v-if="windowState.daysLeft !== null">
          - closes in {{ windowState.daysLeft }} day{{ windowState.daysLeft === 1 ? '' : 's' }}
          (day {{ windowState.closesDay }})
        </template>
        <template v-else> until the next season starts.</template>
      </template>
      <template v-else>
        Transfer window is <strong>closed</strong>. Bids and purchases reopen
        when the next window opens.
      </template>
    </v-alert>

    <v-card-text>
      <transfer-offers-panel
        ref="offersPanel"
        :club-id="club._id"
        :window-open="!!windowState?.open"
        @changed="onPurchase"
      />

      <!-- Listed Players for Sale Banner -->
      <v-alert
        v-if="myListedPlayers.length > 0"
        color="purple-darken-3"
        variant="tonal"
        density="compact"
        class="mb-3"
      >
        <div class="d-flex justify-space-between align-center">
          <div>
            <v-icon size="small" class="mr-1">mdi-tag-multiple</v-icon>
            <strong>Your Players on the Market ({{ myListedPlayers.length }} listed):</strong>
            <span class="ml-2">
              <span
                v-for="p in myListedPlayers"
                :key="p._id ?? p.id"
                class="mr-2"
              >
                <strong>{{ p.FirstName }} {{ p.LastName }}</strong> ({{ currency(p.AskingPrice ?? p.Value) }})
              </span>
            </span>
          </div>
          <div class="text-caption font-weight-bold text-purple-lighten-2">
            Potential Revenue: {{ currency(totalPotentialRevenue) }}
          </div>
        </div>
      </v-alert>

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
import { useStore } from '@/store';
import { currency } from '@/helpers/misc';
import TransferMarketTable from '@/components/players/transfer-market-table.vue';
import BuyPlayerDialog from '@/components/players/buy-player-dialog.vue';
import TransferOffersPanel from '@/components/players/transfer-offers-panel.vue';
import type { TransferWindow } from '@repo/api-contract';
import type { MarketPlayer } from '@/components/players/transfer-market-table.vue';

const props = defineProps<{ club: any }>();
const store = useStore();
const emit = defineEmits<{ (e: 'update-available'): void }>();

const freeAgents = ref<MarketPlayer[]>([]);
const otherClubsPlayers = ref<MarketPlayer[]>([]);
const search = ref('');
const filter = ref<'all' | 'free-agents' | 'other-clubs'>('all');
const showBuyDialog = ref(false);
const selectedPlayer = ref<MarketPlayer | null>(null);
const windowState = ref<TransferWindow | null>(null);
const offersPanel = ref<InstanceType<typeof TransferOffersPanel> | null>(null);

async function loadWindow() {
  try {
    const res = await client.transfers.getTransferWindow.query();
    if (res.status === 200) windowState.value = res.body.payload;
  } catch (error) {
    console.error('Error loading the transfer window:', error);
  }
}

const filteredPlayers = computed<MarketPlayer[]>(() => {
  if (filter.value === 'free-agents') return freeAgents.value;
  if (filter.value === 'other-clubs') return otherClubsPlayers.value;
  return [...freeAgents.value, ...otherClubsPlayers.value];
});

const myListedPlayers = computed(() => {
  if (!Array.isArray(props.club?.Players)) return [];
  return props.club.Players.filter((p: any) => p.isTransferListed);
});

const totalPotentialRevenue = computed(() => {
  return myListedPlayers.value.reduce((sum: number, p: any) => sum + (p.AskingPrice ?? p.Value ?? 0), 0);
});

async function loadFreeAgents() {
  try {
    const response = await client.players.getPlayers.query({
      query: { isSigned: false },
    });
    if (response.status === 200) {
      freeAgents.value = response.body.payload.map((p) => ({
        ...p,
        source: 'Overseas Free Agent',
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
  if (windowState.value && !windowState.value.open) {
    store.showToast({ message: 'The transfer window is closed', style: 'warning' });
    return;
  }
  selectedPlayer.value = player;
  showBuyDialog.value = true;
}

function onPurchase() {
  emit('update-available');
  loadWindow();
  offersPanel.value?.load();
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
  loadWindow();
  loadFreeAgents();
  loadOtherClubsPlayers();
});
</script>
