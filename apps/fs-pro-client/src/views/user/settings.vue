<template>
  <div class="settings">
    <v-dialog v-if="user?.isAdmin" :model-value="openClubModal" persistent max-width="800px">
      <clubs-table :multi-select="true" @close-club-modal="closeClubModal"></clubs-table>
    </v-dialog>

    <v-dialog v-model="leaving.open" max-width="440">
      <v-card class="pa-4">
        <div class="text-h6 mb-2">Leave {{ leaving.club?.Name }}?</div>
        <p class="mb-4">
          The club stays in the world and the AI takes over. You can't get it back yourself, but you can found a new club.
        </p>
        <div class="d-flex justify-end ga-2">
          <v-btn variant="text" @click="leaving.open = false">Stay</v-btn>
          <v-btn color="error" variant="flat" :loading="leaving.busy" @click="confirmLeave">Leave club</v-btn>
        </div>
      </v-card>
    </v-dialog>

    <v-row>
      <v-col cols="12" md="6">
        <v-card class="pa-2 mb-4">
          <v-card-title class="text-h5 d-flex align-center ga-2"><v-icon color="secondary">mdi-account</v-icon> Account</v-card-title>
          <v-list density="compact" bg-color="transparent">
            <v-list-item prepend-icon="mdi-card-account-details-outline" title="Name" :subtitle="user?.fullname || '—'" />
            <v-list-item prepend-icon="mdi-at" title="Username" :subtitle="user?.username" />
            <v-list-item prepend-icon="mdi-shield-account" title="Role" :subtitle="user?.isAdmin ? 'Administrator' : 'Manager'" />
            <v-list-item prepend-icon="mdi-access-point" title="Live connection">
              <template #subtitle>
                <span :class="live === 'live' ? 'text-success' : 'text-medium-emphasis'">
                  {{ live === 'live' ? `Connected · ${online} online` : live === 'connecting' ? 'Connecting…' : 'Offline (updates arrive on refresh)' }}
                </span>
              </template>
            </v-list-item>
          </v-list>
        </v-card>

        <v-card class="pa-2">
          <v-card-title class="text-h5 d-flex align-center ga-2"><v-icon color="secondary">mdi-lock-reset</v-icon> Change password</v-card-title>
          <v-card-text>
            <v-form @submit.prevent="changePassword">
              <v-text-field v-model="pw.current" type="password" label="Current password" autocomplete="current-password" density="compact" variant="outlined" />
              <v-text-field v-model="pw.next" type="password" label="New password" hint="At least 8 characters" autocomplete="new-password" density="compact" variant="outlined" />
              <v-text-field
                v-model="pw.again"
                type="password"
                label="New password again"
                autocomplete="new-password"
                density="compact"
                variant="outlined"
                :error-messages="pw.again && pw.again !== pw.next ? ['The passwords differ'] : []"
              />
              <v-alert v-if="pw.message" :type="pw.ok ? 'success' : 'error'" variant="tonal" density="compact" class="mb-3">{{ pw.message }}</v-alert>
              <v-btn type="submit" color="primary" variant="flat" :loading="pw.busy" :disabled="!pw.current || pw.next.length < 8 || pw.next !== pw.again">
                Change password
              </v-btn>
            </v-form>
          </v-card-text>
        </v-card>
      </v-col>

      <v-col cols="12" md="6">
        <v-card class="pa-2">
          <v-card-title class="text-h5 d-flex align-center ga-2"><v-icon color="secondary">mdi-shield-half-full</v-icon> My clubs</v-card-title>
          <v-list v-if="userClubs.length" bg-color="transparent">
            <v-list-item v-for="club in userClubs" :key="club._id">
              <template #prepend>
                <img :src="crestUrl(club.ClubCode)" :alt="club.Name" width="36" height="40" class="mr-3" />
              </template>
              <v-list-item-title class="font-weight-bold">{{ club.Name }}</v-list-item-title>
              <v-list-item-subtitle>{{ [club.Address?.City, club.AddressCountry?.Name].filter(Boolean).join(', ') }}</v-list-item-subtitle>
              <template #append>
                <v-btn variant="text" size="small" :to="`/game/${club._id}`">Ground</v-btn>
                <v-btn variant="text" size="small" color="error" @click="askLeave(club)">Leave</v-btn>
              </template>
            </v-list-item>
          </v-list>
          <v-alert v-else type="info" variant="tonal" class="ma-3">You don't run a club yet.</v-alert>
          <v-card-actions class="flex-wrap ga-2">
            <v-btn v-if="userClubs.length < FOUNDING_LIMITS.clubs" color="primary" variant="flat" to="/start" prepend-icon="mdi-shield-plus-outline">
              Found {{ userClubs.length ? 'another' : 'a' }} club
            </v-btn>
            <span v-else class="text-caption text-medium-emphasis">You run the most clubs one manager can ({{ FOUNDING_LIMITS.clubs }}).</span>
            <v-btn v-if="user?.isAdmin" variant="outlined" prepend-icon="mdi-plus" @click="openClubModal = true">Assign clubs (admin)</v-btn>
          </v-card-actions>
        </v-card>
      </v-col>
    </v-row>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { FOUNDING_LIMITS } from '@repo/api-contract';
import { useStore } from '@/store';
import { client } from '@/services/api';
import { realtime } from '@/services/realtime';
import { crestUrl } from '@/helpers/crest';
import ClubsTable from '@/components/clubs/clubs-table.vue';

const store = useStore();
const user = computed(() => store.user);
const live = realtime.status;
const online = realtime.online;

const openClubModal = ref(false);
const userClubs = ref<any[]>([]);

const pw = reactive({ current: '', next: '', again: '', busy: false, ok: false, message: '' });
const leaving = reactive<{ open: boolean; busy: boolean; club: any }>({ open: false, busy: false, club: null });

async function loadUserClubs() {
  if (!user.value?.userID) return;
  try {
    const response = await client.users.getUser.query({ params: { id: user.value.userID }, query: { populate: 'true' } });
    if (response.status === 200) {
      const clubs = (response.body.payload as { Clubs?: unknown[] }).Clubs ?? [];
      userClubs.value = clubs.filter((c): c is Record<string, unknown> => !!c && typeof c === 'object');
    }
  } catch (error) {
    console.error('Error loading clubs:', error);
  }
}

async function changePassword() {
  pw.busy = true;
  pw.message = '';
  try {
    const res = await client.users.changePassword.mutation({
      body: { Username: user.value.username, CurrentPassword: pw.current, NewPassword: pw.next },
    });
    pw.ok = res.status === 200;
    pw.message = pw.ok ? 'Password changed.' : ((res.body as { message?: string }).message ?? 'Could not change the password');
    if (pw.ok) Object.assign(pw, { current: '', next: '', again: '' });
  } catch {
    pw.ok = false;
    pw.message = 'Could not change the password. Try again.';
  } finally {
    pw.busy = false;
  }
}

function askLeave(club: any) {
  leaving.club = club;
  leaving.open = true;
}

async function confirmLeave() {
  if (!leaving.club) return;
  leaving.busy = true;
  try {
    const res = await client.users.removeClubFromUser.mutation({
      params: { id: user.value.userID, club_id: leaving.club._id },
      body: {},
    });
    if (res.status === 200) {
      store.showToast({ message: `You left ${leaving.club.Name}`, style: 'success' });
      const remaining = (store.user.clubs ?? []).filter((c: any) => (typeof c === 'string' ? c : c._id) !== leaving.club._id);
      store.setUser({ ...store.user, clubs: remaining.map((c: any) => (typeof c === 'string' ? c : c._id)) });
      await store.setUserClubs();
      await loadUserClubs();
    }
  } finally {
    leaving.busy = false;
    leaving.open = false;
  }
}

function closeClubModal() {
  openClubModal.value = false;
  void loadUserClubs();
  void store.setUserClubs();
}

onMounted(loadUserClubs);
watch(() => user.value?.userID, loadUserClubs);
</script>
