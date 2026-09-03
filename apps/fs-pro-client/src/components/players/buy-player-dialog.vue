<template>
  <v-dialog
    :model-value="show"
    @update:model-value="$emit('update:show', $event)"
    width="500"
    persistent
  >
    <v-card class="pa-0" :loading="loading">
      <v-card-title class="text-h5 bg-cyan-darken-2" primary-title>
        Buy Player
        <v-spacer></v-spacer>
        <v-btn size="small" icon @click="close">
          <v-icon size="small">mdi-close</v-icon>
        </v-btn>
      </v-card-title>

      <v-card-text v-if="player">
        <v-list density="compact">
          <v-list-item>
            <strong>{{ player.FirstName }} {{ player.LastName }}</strong>
            &nbsp;({{ player.Position }})
          </v-list-item>
          <v-list-item>Rating: {{ Math.round(player.Rating) }}</v-list-item>
          <v-list-item>Value: {{ currency(player.Value) }}</v-list-item>
          <v-list-item>Wage: {{ currency(player.Wage) }}</v-list-item>
        </v-list>

        <v-text-field
          class="mt-4"
          type="number"
          color="cyan-darken-1"
          label="Offer Amount"
          v-model.number="offerAmount"
          :rules="[
            (v: number) => v >= (player?.Value ?? 0) || `Must be at least ${currency(player?.Value)}`,
          ]"
        ></v-text-field>

        <div class="text-caption">
          Your Budget: {{ currency(myBudget) }}
        </div>
        <v-alert v-if="error" type="error" density="compact" class="mt-2">
          {{ error }}
        </v-alert>
      </v-card-text>

      <v-card-actions>
        <v-btn
          @click="confirmPurchase"
          :loading="loading"
          :disabled="loading || !canSubmit"
        >
          Confirm Purchase
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { client } from '@/services/api';
import { useStore } from '@/store';
import { currency } from '@/helpers/misc';
import type { MarketPlayer } from './transfer-market-table.vue';

interface Props {
  show: boolean;
  player: MarketPlayer | null;
  club: string;
  myBudget: number;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  'update:show': [value: boolean];
  'update-available': [];
}>();

const store = useStore();
const loading = ref(false);
const offerAmount = ref(0);
const error = ref('');

watch(
  () => props.player,
  (player) => {
    offerAmount.value = player?.Value ?? 0;
    error.value = '';
  }
);

const canSubmit = computed(
  () => !!props.player && offerAmount.value >= (props.player.Value ?? 0)
);

const close = () => {
  emit('update:show', false);
};

const confirmPurchase = async () => {
  if (!props.player) return;

  loading.value = true;
  error.value = '';

  try {
    const response = await client.transfers.purchasePlayer.mutation({
      body: {
        playerId: props.player._id ?? '',
        buyingClubId: props.club,
        offerAmount: offerAmount.value,
      },
    });

    if (response.status === 200) {
      store.showToast({ message: 'Player purchased!', style: 'success' });
      emit('update:show', false);
      emit('update-available');
    } else {
      error.value = response.body.message;
      store.showToast({ message: response.body.message, style: 'error' });
    }
  } catch (err) {
    console.error('Error purchasing player:', err);
    error.value = 'Could not complete the purchase';
  } finally {
    loading.value = false;
  }
};
</script>
