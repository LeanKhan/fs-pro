<template>
  <v-card variant="tonal" class="mb-4" :loading="loading">
    <v-card-title class="d-flex flex-wrap align-center gap-2">
      <div class="d-flex align-center gap-2">
        <v-icon>mdi-email-fast-outline</v-icon>
        <span>My Offers</span>
        <v-chip v-if="waitingOnMe" size="small" color="amber" class="ml-1 font-weight-bold">
          {{ waitingOnMe }} need your answer
        </v-chip>
      </div>

      <!-- Scope Switcher: Current Season vs All History -->
      <v-btn-toggle
        v-model="scope"
        density="compact"
        mandatory
        variant="outlined"
        color="primary"
        class="ml-sm-3"
      >
        <v-btn value="current" size="small">
          <v-icon start size="14">mdi-calendar-clock</v-icon>
          Current Season
        </v-btn>
        <v-btn value="all" size="small">
          <v-icon start size="14">mdi-history</v-icon>
          All History
        </v-btn>
      </v-btn-toggle>

      <v-spacer />

      <v-btn size="small" variant="text" icon="mdi-reload" title="Refresh Offers" @click="load" />
    </v-card-title>

    <!-- Filter chips when offers exist -->
    <div v-if="offers.length > 0" class="px-4 pb-2 d-flex flex-wrap align-center justify-space-between gap-2 border-b border-opacity-10">
      <v-chip-group v-model="filter" mandatory density="compact">
        <v-chip value="all" size="small" variant="tonal">
          All ({{ offers.length }})
        </v-chip>
        <v-chip
          v-if="waitingOnMe > 0"
          value="action_needed"
          size="small"
          color="amber"
          variant="flat"
          class="font-weight-bold"
        >
          Action Needed ({{ waitingOnMe }})
        </v-chip>
        <v-chip value="incoming" size="small" variant="tonal" color="blue">
          Incoming ({{ incomingCount }})
        </v-chip>
        <v-chip value="outgoing" size="small" variant="tonal" color="purple">
          Outgoing ({{ outgoingCount }})
        </v-chip>
      </v-chip-group>

      <div class="text-caption text-medium-emphasis">
        Showing {{ filteredOffers.length }} offer{{ filteredOffers.length === 1 ? '' : 's' }}
      </div>
    </div>

    <!-- Empty State -->
    <v-card-text v-if="!filteredOffers.length && !loading" class="text-medium-emphasis py-4 text-center">
      <template v-if="scope === 'current' && !offers.length">
        <v-icon size="36" color="grey" class="mb-2">mdi-clipboard-text-clock-outline</v-icon>
        <div>No offers recorded for the current season yet.</div>
        <div class="text-caption mt-1">
          While the transfer window is open, other clubs will bid for your players, and you can bid on the market below.
        </div>
        <v-btn size="small" variant="tonal" color="primary" class="mt-3" @click="scope = 'all'">
          View All Previous Offers
        </v-btn>
      </template>
      <template v-else-if="!offers.length">
        <v-icon size="36" color="grey" class="mb-2">mdi-email-outline</v-icon>
        <div>No transfer offers on record yet.</div>
        <div class="text-caption mt-1">
          Bids and negotiations will appear here once incoming or outgoing offers are made.
        </div>
      </template>
      <template v-else>
        <div>No offers match the selected filter (<strong>{{ filter }}</strong>).</div>
        <v-btn size="x-small" variant="text" color="primary" class="mt-1" @click="filter = 'all'">
          Reset Filter
        </v-btn>
      </template>
    </v-card-text>

    <!-- Paginated List -->
    <v-list v-else density="compact" class="bg-transparent pa-0">
      <v-list-item
        v-for="o in paginatedOffers"
        :key="o.id"
        class="py-2 px-4 border-b border-opacity-10"
        :class="{ 'bg-amber-darken-4 bg-opacity-10': o.awaiting === 'me' }"
      >
        <template #prepend>
          <v-avatar size="32" :color="o.direction === 'incoming' ? 'blue-darken-3' : 'purple-darken-3'" class="mr-2">
            <v-icon size="18" color="white">
              {{ o.direction === 'incoming' ? 'mdi-arrow-down-bold' : 'mdi-arrow-up-bold' }}
            </v-icon>
          </v-avatar>
        </template>

        <v-list-item-title class="d-flex align-center flex-wrap gap-1">
          <strong>{{ o.player.name }}</strong>
          <v-chip size="x-small" variant="tonal" color="indigo" class="ml-1">
            {{ o.player.position ?? 'POS' }}
          </v-chip>
          <span class="text-caption text-medium-emphasis">
            · OVR {{ Math.round(o.player.rating) }}
          </span>
          <v-chip
            size="x-small"
            :color="o.direction === 'incoming' ? 'blue' : 'purple'"
            variant="tonal"
            class="ml-1"
          >
            {{ o.direction === 'incoming' ? 'Incoming Bid' : 'Outgoing Bid' }}
          </v-chip>
        </v-list-item-title>

        <v-list-item-subtitle class="mt-1">
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
          <v-chip v-else size="small" :color="statusColor(o)" variant="tonal" class="font-weight-medium">
            {{ statusLabel(o) }}
          </v-chip>
        </template>
      </v-list-item>
    </v-list>

    <!-- Pagination Footer -->
    <div
      v-if="totalPages > 1"
      class="d-flex flex-wrap justify-space-between align-center px-4 py-2 border-t border-opacity-10 gap-2"
    >
      <span class="text-caption text-medium-emphasis">
        Showing {{ (page - 1) * pageSize + 1 }} - {{ Math.min(page * pageSize, filteredOffers.length) }} of {{ filteredOffers.length }} offers
      </span>

      <v-pagination
        v-model="page"
        :length="totalPages"
        density="compact"
        total-visible="5"
        size="small"
      />
    </div>
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

// Scope: 'current' (current season only) or 'all' (all history)
const scope = ref<'current' | 'all'>('current');
// Filter: 'all', 'action_needed', 'incoming', 'outgoing'
const filter = ref<'all' | 'action_needed' | 'incoming' | 'outgoing'>('all');

// Pagination
const page = ref(1);
const pageSize = ref(5);

const waitingOnMe = computed(() => offers.value.filter((o) => o.awaiting === 'me').length);
const incomingCount = computed(() => offers.value.filter((o) => o.direction === 'incoming').length);
const outgoingCount = computed(() => offers.value.filter((o) => o.direction === 'outgoing').length);

const filteredOffers = computed(() => {
  if (filter.value === 'action_needed') {
    return offers.value.filter((o) => o.awaiting === 'me');
  }
  if (filter.value === 'incoming') {
    return offers.value.filter((o) => o.direction === 'incoming');
  }
  if (filter.value === 'outgoing') {
    return offers.value.filter((o) => o.direction === 'outgoing');
  }
  return offers.value;
});

const totalPages = computed(() => Math.ceil(filteredOffers.value.length / pageSize.value) || 1);

const paginatedOffers = computed(() => {
  const start = (page.value - 1) * pageSize.value;
  return filteredOffers.value.slice(start, start + pageSize.value);
});

// Reset page on filter or scope change
watch([filter, scope], () => {
  page.value = 1;
});

// Refetch on scope change
watch(scope, () => {
  load();
});

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
  if (o.awaiting === 'them') return 'Waiting for answer';
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
    const res = await client.transfers.getOffers.query({
      query: {
        clubId: props.clubId,
        currentSeasonOnly: scope.value === 'current',
        limit: scope.value === 'current' ? 50 : 100,
      },
    });
    if (res.status === 200) {
      offers.value = res.body.payload;
    }
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
