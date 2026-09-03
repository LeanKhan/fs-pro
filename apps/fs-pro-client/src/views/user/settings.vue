<template>
  <div>
    <v-dialog :model-value="openClubModal" persistent max-width="800px">
      <clubs-table
        :multi-select="true"
        @close-club-modal="closeClubModal"
      ></clubs-table>
    </v-dialog>

    <v-row>
      <v-col cols="12">
        <v-card>
          <v-card-title class="text-h5">
            <v-icon color="primary" class="mr-2">mdi-cog</v-icon>
            User Settings
          </v-card-title>

          <v-divider></v-divider>

          <v-card-text>
            <v-row>
              <v-col cols="12" md="6">
                <div class="text-h6 mb-2">User Information</div>
                <v-list>
                  <v-list-item>
                    <template v-slot:prepend>
                      <v-icon>mdi-account</v-icon>
                    </template>
                    <v-list-item-title>Username</v-list-item-title>
                    <v-list-item-subtitle>
                      {{ user?.username }}
                    </v-list-item-subtitle>
                  </v-list-item>
                  <v-list-item>
                    <template v-slot:prepend>
                      <v-icon>mdi-shield-account</v-icon>
                    </template>
                    <v-list-item-title>Role</v-list-item-title>
                    <v-list-item-subtitle>
                      {{ user?.isAdmin ? 'Administrator' : 'Manager' }}
                    </v-list-item-subtitle>
                  </v-list-item>
                </v-list>
              </v-col>

              <v-col cols="12" md="6">
                <div class="text-h6 mb-2">My Clubs</div>
                <v-list v-if="userClubs.length > 0">
                  <v-list-item v-for="club in userClubs" :key="club._id">
                    <template v-slot:prepend>
                      <v-icon>custom:{{ club.ClubCode }}</v-icon>
                    </template>
                    <v-list-item-title>{{ club.Name }}</v-list-item-title>
                    <template v-slot:append>
                      <v-btn
                        variant="text"
                        icon
                        size="small"
                        color="error"
                        @click="removeClub(club._id)"
                      >
                        <v-icon size="small">mdi-delete</v-icon>
                      </v-btn>
                    </template>
                  </v-list-item>
                </v-list>
                <v-alert v-else type="info" variant="tonal" class="mb-3">
                  No clubs assigned yet
                </v-alert>

                <v-btn
                  color="primary"
                  variant="outlined"
                  @click="openClubModal = true"
                  block
                >
                  <v-icon class="mr-2">mdi-plus</v-icon>
                  Add Clubs
                </v-btn>
              </v-col>
            </v-row>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useStore } from '@/store';
import { client } from '@/services/api';
import ClubsTable from '@/components/clubs/clubs-table.vue';

const store = useStore();

const openClubModal = ref(false);
const userClubs = ref<any[]>([]);

const user = computed(() => store.user);

const closeClubModal = async (event: any) => {
  openClubModal.value = false;

  if (event && event.id) {
    try {
      const selectedClubIds = Array.isArray(event.id) ? event.id : [event.id];

      const response = await client.users.addClubsToUser.mutation({
        params: { id: user.value.userID },
        body: selectedClubIds,
      });

      if (response.status === 200) {
        store.showToast({
          message: 'Clubs added successfully',
          style: 'success',
        });

        // Update user in store
        store.getUser();

        // Refresh user clubs
        await fetchUserClubs();
      }
    } catch (error: any) {
      console.error('Error adding clubs:', error);
      store.showToast({
        message: 'Error adding clubs',
        style: 'error',
      });
    }
  }
};

const removeClub = async (clubId: string) => {
  try {
    const response = await client.users.removeClubFromUser.mutation({
      params: { id: user.value.userID, club_id: clubId },
    });

    if (response.status === 200) {
      store.showToast({
        message: 'Club removed successfully',
        style: 'success',
      });

      // Update user in store
      store.getUser();

      // Refresh user clubs
      await fetchUserClubs();
    }
  } catch (error: any) {
    console.error('Error removing club:', error);
    store.showToast({
      message: 'Error removing club',
      style: 'error',
    });
  }
};

const fetchUserClubs = async () => {
  console.log('Fetching User Clubs', user.value);
  if (!user.value?.clubs || user.value.clubs.length === 0) {
    userClubs.value = [];
    return;
  }

  try {
    // user.value.clubs can hold either raw id strings (fresh from
    // login/registration) or enriched Club objects (after the store's
    // setUserClubs() runs) - handle both rather than assuming one shape.
    const ids = user.value.clubs
      .map((c: any) => (typeof c === 'string' ? c : c._id))
      .join(',');
    const response = await client.clubs.getClubs.query({ query: { ids } });

    if (response.status === 200) {
      userClubs.value = response.body.payload;
    }
  } catch (error) {
    console.error('Error fetching user clubs:', error);
  }
};

// Watch for user to be available, then fetch clubs
watch(
  user,
  async (newUser) => {
    if (newUser && newUser.userID) {
      await fetchUserClubs();
    }
  },
  { immediate: true }
);

onMounted(() => {
  // Ensure user is loaded from store
  if (!user.value?.userID) {
    store.getUser();
  }
});
</script>

<style scoped>
.v-list-item {
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}
</style>
