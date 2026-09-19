<template>
  <v-dialog
    :model-value="show"
    @update:model-value="$emit('update:show', $event)"
    width="500"
    persistent
  >
    <v-card class="pa-0" :loading="loading">
      <v-card-title class="text-h5 bg-cyan-darken-2" primary-title>
        {{ isBid ? 'Place Bid' : 'Buy Player' }}
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
          :label="isBid ? 'Bid Amount' : 'Offer Amount'"
          v-model.number="offerAmount"
          :rules="[
            (v: number) => v >= minAmount || `Must be at least ${currency(minAmount)}`,
          ]"
        ></v-text-field>

        <div v-if="isBid" class="text-caption text-medium-emphasis mb-1">
          {{ player.ClubCode }} will accept, counter or refuse. Bids of at least
          half his value are considered.
        </div>

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
          {{ isBid ? 'Place Bid' : 'Confirm Purchase' }}
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

/** A player who belongs to a club is bid for; a free agent is bought outright. */
const isBid = computed(() => !!props.player?.ClubId);

const minAmount = computed(() => {
  const value = props.player?.Value ?? 0;
  return isBid.value ? Math.ceil(value * 0.5) : value;
});

const canSubmit = computed(
  () => !!props.player && offerAmount.value >= minAmount.value
);

const close = () => {
  emit('update:show', false);
};

const confirmPurchase = async () => {
  if (!props.player) return;

  loading.value = true;
  error.value = '';

  try {
    if (isBid.value) {
      const bid = await client.transfers.placeBid.mutation({
        body: {
          playerId: props.player._id ?? '',
          biddingClubId: props.club,
          amount: offerAmount.value,
        },
      });

      if (bid.status !== 200) {
        error.value = bid.body.message;
        store.showToast({ message: bid.body.message, style: 'error' });
        return;
      }

      const offer = bid.body.payload;
      if (offer.status === 'accepted') {
        store.showToast({ message: `${props.player.LastName} signed!`, style: 'success' });
      } else if (offer.status === 'countered') {
        store.showToast({
          message: `${offer.toClub.code} want ${currency(offer.counterAmount ?? 0)} - see My Offers`,
          style: 'warning',
        });
      } else if (offer.status === 'pending') {
        store.showToast({ message: 'Bid sent - waiting for their answer', style: 'info' });
      } else {
        // Refused: keep the dialog open so the bid can be raised.
        error.value = offer.note ?? 'Bid refused';
        emit('update-available');
        return;
      }
      emit('update:show', false);
      emit('update-available');
      return;
    }

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
