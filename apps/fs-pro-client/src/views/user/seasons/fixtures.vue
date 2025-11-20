<template>
  <v-card>
    <v-toolbar flat color="indigo darken-1">
      <v-btn icon @click="router.back()">
        <v-icon>mdi-arrow-left</v-icon>
      </v-btn>
      <v-toolbar-title class="ml-1">All Fixtures</v-toolbar-title>
      <v-spacer></v-spacer>
    </v-toolbar>

    <v-card-text>
      <v-tabs
        background-color="transparent"
        dark
        color="indigo"
        next-icon="mdi-arrow-right-bold-box-outline"
        prev-icon="mdi-arrow-left-bold-box-outline"
        v-model="tab"
        show-arrows
      >
        <v-tabs-slider color="indigo"></v-tabs-slider>
        <v-tab v-for="(season, i) in seasons" :key="i">
          {{ season.CompetitionCode }}
        </v-tab>
      </v-tabs>

      <div>
        <template v-if="fixturesLoading">
          <v-progress-circular indeterminate></v-progress-circular>
        </template>

        <template v-if="fixtures">
          <fixtures-table :fixtures="fixtures"></fixtures-table>
        </template>
      </div>
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useStore } from '@/store';
import { $axios } from '@/main';
import FixturesTable from '@/components/seasons/fixtures-table.vue';

const router = useRouter();
const store = useStore();

const tab = ref(0);
const fixtures = ref({});
const fixturesLoading = ref(false);
const selectedYear = ref('');

const currentYear = computed(() => store.currentYear);
const seasons = computed(() => store.seasons as any);
const selectedSeason = computed(() => seasons.value[tab.value] as any);

watch(tab, () => {
  getFixtures();
});

async function getFixtures() {
  fixturesLoading.value = true;
  try {
    const select = JSON.stringify('Title Home Away Details Played');
    const response = await $axios.get(
      `/seasons/${selectedSeason.value._id}/fixtures?select=${select}`
    );
    fixtures.value = response.data.payload;
  } catch (error) {
    console.error('Error getting fixtures for Season:', error);
  } finally {
    fixturesLoading.value = false;
  }
}

async function fetchCurrentSeasons() {
  if (store.calendar?.YearString) {
    try {
      const response = await $axios.get(
        `/seasons?query=${JSON.stringify({ Year: currentYear.value })}`
      );
      if (response.data.success) {
        store.seasons = response.data.payload;
      }
    } catch (error) {
      console.error('Error fetching current Seasons:', error);
    }
  }
}

onMounted(() => {
  getFixtures();
  fetchCurrentSeasons();
});
</script>
