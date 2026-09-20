<template>
  <v-card variant="tonal" class="mb-4" :loading="loading">
    <v-card-title class="d-flex align-center gap-2">
      <v-icon>mdi-email-fast-outline</v-icon>
      My Offers
      <v-chip v-if="waitingOnMe" size="small" color="amber" class="ml-2">
        {{ waitingOnMe }} need your answer
      </v-chip>
      <v-spacer />
      <v-btn size="small" variant="text" icon="mdi-refresh" @click="load" />
    </v-card-title>

    <v-card-text v-if="!offers.length" class="text-medium-emphasis">
      No offers yet. While the transfer window is open, other clubs may bid
      for your players, and you can bid for theirs from the market below.
    </v-card-text>

    <v-list v-else density="compact" class="bg-transparent">
      <v-list-item v-for="o in offers" :key="o.id" class="py-2">
        <v-list-item-title>
          <strong>{{ o.player.name }}</strong>
          <span class="text-medium-emphasis">
            ({{ o.player.position }} · {{ Math.round(o.player.rating) }})
          </span>
        </v-list-item-title>
        <v-list-item-subtitle>
          {{ describe(o) }}
        </v-list-item-subtitle>

        <template #append>
          <template v-if="o.awaiting === 'me'">
            <v-btn
              size="small"
              color="success"
              class="mr-1"
              :disabled="!windowOpen || busyId === o.id"
              :loading="busyId === o.id"
              @click="respond(o, 'accept')"
            >
              Accept {{ currency(price(o)) }}
            </v-btn>
            <v-btn
              size="small"
              variant="tonal"
              color="error"
              :disabled="busyId === o.id"
              @click="respond(o, 'reject')"
            >
              Decline
            </v-btn>
          </template>
          <v-chip v-else size="small" :color="statusColor(o)" variant="tonal">
            {{ statusLabel(o) }}
          </v-chip>
        </template>
      </v-list-item>
    </v-list>
  </v-card>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { client } from '@/services/api';
import { useStore } from '@/store';
import { currency } from '@/helpers/misc';
import type { TransferOffer } from '@repo/api-contract';

const props = defineProps<{ clubId: string; windowOpen: boolean }>();
const emit = defineEmits<{ (e: 'changed'): void }>();

const store = useStore();
const loading = ref(false);
const busyId = ref('');
const offers = ref<TransferOffer[]>([]);

const waitingOnMe = computed(() => offers.value.filter((o) => o.awaiting === 'me').length);

/** The price the club would agree to by accepting: the counter when there is one. */
function price(o: TransferOffer) {
  return o.status === 'countered' ? (o.counterAmount ?? o.amount) : o.amount;
}

function describe(o: TransferOffer) {
  if (o.direction === 'incoming') {
    return `${o.fromClub.name} bid ${currency(o.amount)} (value ${currency(o.player.value)}) · expires day ${o.expiresDay}`;
  }
  if (o.status === 'countered') {
    return `You bid ${currency(o.amount)} · ${o.toClub.name} want ${currency(o.counterAmount ?? 0)} · expires day ${o.expiresDay}`;
  }
  return `You bid ${currency(o.amount)} to ${o.toClub.name}${o.note ? ' · ' + o.note : ''}`;
}

function statusLabel(o: TransferOffer) {
  if (o.awaiting === 'them') return 'Waiting for their answer';
  return { accepted: 'Accepted', rejected: 'Declined', expired: 'Expired', failed: 'Failed' }[o.status] ?? o.status;
}

function statusColor(o: TransferOffer) {
  if (o.awaiting === 'them') return 'blue';
  return { accepted: 'success', rejected: 'error', expired: 'grey', failed: 'error' }[o.status] ?? 'grey';
}

async function load() {
  if (!props.clubId) return;
  loading.value = true;
  try {
    const res = await client.transfers.getOffers.query({ query: { clubId: props.clubId } });
    if (res.status === 200) offers.value = res.body.payload;
  } catch (error) {
    console.error('Error loading offers:', error);
  } finally {
    loading.value = false;
  }
}

async function respond(offer: TransferOffer, action: 'accept' | 'reject') {
  busyId.value = offer.id;
  try {
    const res = await client.transfers.respondToOffer.mutation({
      params: { id: offer.id },
      body: { clubId: props.clubId, action },
    });
    if (res.status === 200) {
      store.showToast({ message: res.body.message, style: 'success' });
    } else {
      store.showToast({ message: res.body.message, style: 'error' });
    }
  } catch (error) {
    console.error('Error answering offer:', error);
    store.showToast({ message: 'Could not answer the offer', style: 'error' });
  } finally {
    busyId.value = '';
    await load();
    emit('changed');
  }
}

watch(() => props.clubId, load);
onMounted(load);

defineExpose({ load });
</script>
