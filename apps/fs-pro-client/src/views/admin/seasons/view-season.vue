<template>
  <div>
    <v-row>
      <v-col cols="12">
        <v-card>
          <div class="text-overline">{{ season.SeasonCode }}</div>
          <v-card-title>
            {{ season.Title }} Season
            <v-chip class="mx-2" :color="season.isStarted ? 'green' : 'orange'">
              {{ season.isStarted ? 'Started' : 'Not Started' }}
            </v-chip>
          </v-card-title>

          <v-card-actions>
            <v-btn :to="`/finish/season/${season._id}`">View Stats</v-btn>
          </v-card-actions>
        </v-card>
      </v-col>

      <v-col>
        <v-card>
          <v-sheet color="green green-lighten" height="100"></v-sheet>
        </v-card>
      </v-col>

      <v-col>
        <v-card>
          <v-sheet color="green green-lighten" height="100"></v-sheet>
        </v-card>
      </v-col>

      <v-col>
        <v-card>
          <v-sheet color="green green-lighten" height="100"></v-sheet>
        </v-card>
      </v-col>

      <v-col>
        <v-card>
          <v-sheet color="green green-lighten" height="100"></v-sheet>
        </v-card>
      </v-col>
    </v-row>

    <v-row>
      <v-col cols="6">
        <v-card>
          <v-card-title>Calendar</v-card-title>
          <v-sheet color="purple purple-lighten-1" height="180">
            Nothing here...
          </v-sheet>
        </v-card>
      </v-col>

      <v-col cols="6">
        <template v-if="season.Standings && season.Standings.length > 0">
          <v-card>
            <v-card-title>Standings (Table)</v-card-title>
            <v-card-text>
              <standings-scroller
                :standings="season.Standings"
              ></standings-scroller>
            </v-card-text>
          </v-card>
        </template>
        <template v-else>
          <span>No Standings yet</span>
        </template>
      </v-col>
    </v-row>

    <v-row>
      <v-col cols="12">
        <v-card>
          <v-card-title>Fixtures</v-card-title>
          <fixtures-table :fixtures="season.Fixtures"></fixtures-table>
        </v-card>
      </v-col>

      <v-col cols="12">
        <v-card>
          <v-card-title>Player Stats (Records)</v-card-title>
          <v-sheet color="secondary secondary-lighten" height="250"></v-sheet>
        </v-card>
      </v-col>

      <v-col cols="12">
        <v-card>
          <v-card-title>Settings</v-card-title>
          <v-sheet color="secondary secondary-lighten">
            <v-btn @click="deleteSeason">Delete Season</v-btn>
          </v-sheet>
        </v-card>
      </v-col>
    </v-row>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { client } from '@/services/api';
import type { Season } from '@repo/api-contract';
import StandingsScroller from '@/components/seasons/standings-scroller.vue';
import FixturesTable from '@/components/seasons/fixtures-table.vue';

const route = useRoute();
const router = useRouter();
const season = ref<any>({});

async function generateFixtures() {
  const seasonId = String(route.params.seasonId);
  const leagueCode = String(route.params.code);
  const competitionId = String(route.params.id);

  try {
    const response = await client.seasons.generateFixtures.mutation({
      params: { id: seasonId, code: season.value.SeasonCode },
      body: { competitionId, leagueCode },
    });
    if (response.status === 200) {
      season.value = response.body.payload as Season;
      console.log('Fixtures generated! => ', response.body.payload);
    }
  } catch (error) {
    console.error('Error generating Fixtures:', error);
  }
}

function startSeason() {
  console.log('Starting Season...');
}

async function deleteSeason() {
  const seasonID = String(route.params.seasonId);
  const ans = confirm(
    "Yo, are you ABSOLUTELY SURE ABOUT THIS!\nYou really want to delete this Season and everything about it?\nAll Fixtures will be deleted too.\nLast chance. You can't undo this."
  );

  if (ans) {
    try {
      await client.seasons.deleteSeason.mutation({ params: { id: seasonID } });
      console.log('Season deleted successfully :)');
      router.back();
    } catch (error) {
      console.error('Error deleting season:', error);
    }
  }
}

onMounted(async () => {
  const seasonID = String(route.params.seasonId);
  try {
    const response = await client.seasons.getSeason.query({
      params: { id: seasonID },
    });
    if (response.status === 200) {
      season.value = response.body.payload as Season;
    }
  } catch (error) {
    console.error('Error fetching season:', error);
  }
});
</script>
