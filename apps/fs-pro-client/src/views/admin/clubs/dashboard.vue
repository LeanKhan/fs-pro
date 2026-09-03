<template>
  <div>
    <v-row>
      <v-col cols="12">
        <v-card>
          <v-toolbar flat color="amber-darken-1">
            <v-toolbar-title class="ml-1">Dashboard</v-toolbar-title>

            <v-spacer></v-spacer>

            <v-btn append-icon="mdi-plus" color="success" to="./clubs/new">
              New
            </v-btn>
          </v-toolbar>
        </v-card>
      </v-col>

      <v-col cols="12">
        <v-alert v-if="error" type="error" class="mb-4">
          Error fetching clubs
        </v-alert>
        <all-clubs-table
          :clubs="clubs"
          :loading="isLoading"
        ></all-clubs-table>
      </v-col>
    </v-row>
  </div>
</template>

<script setup lang="ts">
import { computed, toRaw, watchEffect } from 'vue';
import AllClubsTable from '@/components/clubs/allclubs-table.vue';
import { client } from '@/services/api';

const { data, error, isLoading } = client.clubs.getClubs.useQuery(
  ['all-clubs'],
  (context) => ({
    query: {
      // allclubs-table.vue's columns read Manager/Players.length, so this
      // must actually populate them - `false` here used to "work" only
      // because of a query-boolean-coercion bug that ignored the value
      // (see schemas/query.ts's booleanQuery()); now that's fixed, this
      // needs to genuinely be true.
      withPlayersAndManager: true,
    },
  })
);

const clubs = computed(() => {
  return data.value?.status === 200 ? data.value.body.payload : [];
});

watchEffect(() => {
  console.log('Clubs response => ', toRaw(data.value));
});
</script>
