<template>
  <v-dialog
    :model-value="show"
    @update:model-value="handleClose"
    width="540"
    persistent
  >
    <v-card class="pa-0" :loading="loading">
      <v-card-title class="text-h6 d-flex align-center justify-space-between bg-purple-darken-3 text-white">
        <div class="d-flex align-center">
          <v-icon class="mr-2">mdi-tag-outline</v-icon>
          <span>{{ player?.isTransferListed ? 'Manage Transfer Listing' : 'Put Player Up for Sale' }}</span>
        </div>
        <v-btn size="small" icon variant="text" @click="handleClose">
          <v-icon size="small">mdi-close</v-icon>
        </v-btn>
      </v-card-title>

      <v-card-text v-if="player" class="pt-4">
        <!-- Player Identity & Stats -->
        <div class="d-flex justify-space-between align-center mb-3">
          <div>
            <div class="text-h6 font-weight-bold">
              {{ player.FirstName }} {{ player.LastName }}
              <v-chip
                size="small"
                color="indigo"
                class="ml-2 font-weight-bold"
              >
                {{ player.Position ?? 'SUB' }}
              </v-chip>
              <v-chip
                v-if="isYouthPlayer"
                size="small"
                color="teal"
                variant="flat"
                class="ml-1 text-white"
              >
                🌟 Youth Prospect
              </v-chip>
            </div>
            <div class="text-caption text-medium-emphasis">
              Age: {{ player.Age ?? 'N/A' }} | Overall Rating: {{ Math.round(player.Rating ?? 60) }}
            </div>
          </div>
          <div class="text-right">
            <div class="text-caption text-medium-emphasis">Market Value</div>
            <div class="text-subtitle-1 font-weight-bold text-success">
              {{ currency(player.Value ?? 0) }}
            </div>
          </div>
        </div>

        <v-divider class="my-3"></v-divider>

        <!-- Result / Jev Reaction Panel -->
        <template v-if="result">
          <v-alert
            color="deep-purple-darken-3"
            variant="tonal"
            class="mb-3"
            border="start"
          >
            <div class="d-flex align-center justify-space-between mb-2">
              <span class="font-weight-bold text-subtitle-2">
                <v-icon size="small" class="mr-1">mdi-account-voice</v-icon>
                Player Reaction
              </span>
              <v-chip size="x-small" :color="moraleColor(result.reaction.morale)" variant="flat">
                Morale: {{ result.reaction.morale }}
              </v-chip>
            </div>
            <div class="text-body-2 font-italic mb-2">
              "{{ result.reaction.quote }}"
            </div>
            <div class="text-caption text-medium-emphasis">
              Sentiment: <strong>{{ formatSentiment(result.reaction.sentiment) }}</strong>
            </div>
          </v-alert>

          <v-alert
            color="info"
            variant="tonal"
            density="compact"
            class="mb-3"
            icon="mdi-bullseye-arrow"
          >
            {{ result.marketInterest }}
          </v-alert>

          <v-alert
            v-if="result.newOffer"
            color="amber-darken-3"
            variant="elevated"
            density="compact"
            class="mb-3 text-white"
            icon="mdi-cash-fast"
          >
            <strong>Instant Offer Received!</strong>
            <div>
              {{ result.newOffer.fromClub?.name ?? 'An interested club' }} submitted an opening bid of
              <strong>{{ currency(result.newOffer.amount) }}</strong>! You can accept it in Transfer Offers to fund new defenders.
            </div>
          </v-alert>
        </template>

        <!-- Listing Form -->
        <template v-else>
          <div class="text-body-2 text-medium-emphasis mb-3">
            Set an asking price for <strong>{{ player.FirstName }}</strong>. AI clubs will submit transfer bids based on your asking valuation. Funds raised can be used immediately to acquire defensive reinforcements.
          </div>

          <v-text-field
            v-model.number="askingPrice"
            type="number"
            label="Asking Price (VLA)"
            color="purple"
            prefix="VLA"
            :rules="[(v: number) => v > 0 || 'Asking price must be positive']"
            density="comfortable"
            variant="outlined"
            class="mb-2"
          ></v-text-field>

          <!-- Quick Price Preset Buttons -->
          <div class="d-flex flex-wrap gap-1 mb-3">
            <span class="text-caption text-medium-emphasis align-self-center mr-2">Presets:</span>
            <v-btn
              size="x-small"
              variant="tonal"
              color="blue-grey"
              class="mr-1"
              @click="setMultiplier(0.8)"
            >
              -20% Quick Sale
            </v-btn>
            <v-btn
              size="x-small"
              variant="tonal"
              color="indigo"
              class="mr-1"
              @click="setMultiplier(1.0)"
            >
              100% Value
            </v-btn>
            <v-btn
              size="x-small"
              variant="tonal"
              color="purple"
              class="mr-1"
              @click="setMultiplier(1.2)"
            >
              +20% Premium
            </v-btn>
            <v-btn
              size="x-small"
              variant="tonal"
              color="deep-purple"
              @click="setMultiplier(1.5)"
            >
              +50% High
            </v-btn>
          </div>

          <v-alert
            v-if="error"
            type="error"
            density="compact"
            variant="tonal"
            class="mb-3"
          >
            {{ error }}
          </v-alert>
        </template>
      </v-card-text>

      <v-card-actions class="pa-4 bg-grey-darken-4 d-flex justify-space-between">
        <template v-if="result">
          <v-spacer></v-spacer>
          <v-btn
            color="purple-lighten-2"
            variant="elevated"
            @click="handleClose"
          >
            Done
          </v-btn>
        </template>
        <template v-else>
          <v-btn
            v-if="player?.isTransferListed"
            color="error"
            variant="text"
            :loading="unlisting"
            :disabled="loading"
            @click="confirmUnlist"
          >
            Remove from Sale
          </v-btn>
          <v-spacer v-else></v-spacer>

          <div>
            <v-btn
              variant="text"
              color="grey"
              class="mr-2"
              @click="handleClose"
              :disabled="loading"
            >
              Cancel
            </v-btn>
            <v-btn
              color="purple-darken-1"
              variant="elevated"
              :loading="loading"
              :disabled="loading || askingPrice <= 0"
              @click="confirmList"
            >
              {{ player?.isTransferListed ? 'Update Asking Price' : 'Confirm Listing' }}
            </v-btn>
          </div>
        </template>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { client } from '@/services/api';
import { currency } from '@/helpers/misc';

interface Props {
  show: boolean;
  player: any | null;
  clubId: string;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  (e: 'update:show', value: boolean): void;
  (e: 'update-available'): void;
}>();

const loading = ref(false);
const unlisting = ref(false);
const error = ref('');
const askingPrice = ref(0);
const result = ref<{
  reaction: { sentiment: string; quote: string; morale: string };
  marketInterest: string;
  newOffer?: any;
} | null>(null);

const isYouthPlayer = computed(() => {
  return Boolean(props.player?.isYouth || (props.player?.Age && props.player.Age <= 20));
});

watch(
  () => props.player,
  (player) => {
    if (player) {
      askingPrice.value = player.AskingPrice ?? player.Value ?? 100000;
      error.value = '';
      result.value = null;
    }
  },
  { immediate: true }
);

function setMultiplier(mult: number) {
  const base = props.player?.Value ?? 100000;
  askingPrice.value = Math.round(base * mult);
}

function moraleColor(morale: string) {
  switch (morale) {
    case 'Very High':
    case 'High':
      return 'success';
    case 'Determined':
      return 'indigo';
    case 'Content':
      return 'teal';
    case 'Low':
    case 'Unhappy':
      return 'error';
    default:
      return 'grey';
  }
}

function formatSentiment(sentiment: string) {
  switch (sentiment) {
    case 'youth_breakout_eager':
      return 'Hungry Academy Prospect (Eager for Minutes)';
    case 'unhappy_demoralized':
      return 'Demoralized by Listing';
    case 'ambitious_eager':
      return 'Ambitious for New Challenge';
    case 'determined_to_fight':
      return 'Determined to Prove Value';
    case 'accepts_professionally':
      return 'Professional Understanding';
    default:
      return sentiment.replace(/_/g, ' ');
  }
}

async function confirmList() {
  if (!props.player || !props.clubId) return;

  loading.value = true;
  error.value = '';

  try {
    const res = await client.transfers.listPlayerForSale.mutation({
      body: {
        playerId: props.player._id ?? props.player.id,
        clubId: props.clubId,
        isListed: true,
        askingPrice: askingPrice.value,
      },
    });

    if (res.status === 200) {
      result.value = {
        reaction: res.body.payload.reaction,
        marketInterest: res.body.payload.marketInterest,
        newOffer: res.body.payload.newOffer,
      };
      emit('update-available');
    } else {
      error.value = res.body.message ?? 'Failed to list player';
    }
  } catch (err: any) {
    error.value = err?.message ?? 'Network error listing player';
  } finally {
    loading.value = false;
  }
}

async function confirmUnlist() {
  if (!props.player || !props.clubId) return;

  unlisting.value = true;
  error.value = '';

  try {
    const res = await client.transfers.listPlayerForSale.mutation({
      body: {
        playerId: props.player._id ?? props.player.id,
        clubId: props.clubId,
        isListed: false,
      },
    });

    if (res.status === 200) {
      emit('update-available');
      handleClose();
    } else {
      error.value = res.body.message ?? 'Failed to remove player from transfer list';
    }
  } catch (err: any) {
    error.value = err?.message ?? 'Network error unlisting player';
  } finally {
    unlisting.value = false;
  }
}

function handleClose() {
  result.value = null;
  emit('update:show', false);
}
</script>
