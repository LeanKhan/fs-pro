<template>
  <div id="end-of-season">
    <v-container v-if="season" fluid class="pa-0">
      <v-toolbar density="compact" color="dark">
        <v-toolbar-title class="mx-auto">
          {{ season.Year }} {{ season.CompetitionCode }} Season Statistics
        </v-toolbar-title>

        <v-spacer></v-spacer>

        <v-btn variant="flat" size="small" icon @click="close">
          <v-icon>mdi-close</v-icon>
        </v-btn>
      </v-toolbar>

      <v-row>
        <template v-for="(attr, k) in stats_attributes" :key="k">
          <v-col cols="3">
            <v-card>
              <v-card-title class="capitalize">Highest {{ attr }}</v-card-title>

              <v-list v-if="top_players[attr].length > 0">
                <v-list-item v-for="(p, i) in top_players[attr]" :key="i">
                  <template v-slot:prepend>
                    <v-icon style="font-size: 30px; height: 30px" size="large">
                      ${{ p.player.ClubCode }}
                    </v-icon>
                  </template>

                  <v-list-item-title>
                    {{ p.player.FirstName }} {{ p.player.LastName }}
                  </v-list-item-title>

                  <template v-slot:append>
                    <v-avatar size="40" color="blue">
                      <span class="text-white font-weight-bold">
                        {{ filter(p[attr]) }}
                      </span>
                    </v-avatar>
                  </template>
                </v-list-item>
              </v-list>

              <v-sheet v-else>
                <v-btn
                  :disabled="loading_player_stats"
                  :loading="loading_player_stats"
                  @click="load_stats(attr)"
                >
                  Load
                </v-btn>
              </v-sheet>
            </v-card>
          </v-col>
        </template>
      </v-row>
    </v-container>

    <!-- loading overlay -->
    <v-overlay :model-value="loading">
      <v-progress-circular indeterminate size="68"></v-progress-circular>
    </v-overlay>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, getCurrentInstance } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { $axios } from '@/main';
import Standings from '@/components/seasons/standings-component.vue';
const instance = getCurrentInstance();

const route = useRoute();
const router = useRouter();

const loading = ref(false);
const season = ref<any>({});
const loading_player_stats = ref(false);
const stats_attributes = ['points', 'goals', 'assists', 'saves'];
const top_players = ref<any>({
  points: [],
  goals: [],
  assists: [],
  saves: [],
});

const seasonId = computed(() => route.params.season_id);

function close() {
  router.push('/u');
}

function filter(stuff: any) {
  if (instance) {
    return instance.appContext.config.globalProperties.$filters.roundTo(stuff);
  }
}

async function load_stats(attribute: string) {
  loading_player_stats.value = true;
  try {
    const response = await $axios.get(
      `/players/stats?match_k=season._id&match_v=${seasonId.value}&sort_k=${attribute}&sort_v=-1`
    );
    if (response.data.success) {
      top_players.value[attribute] = response.data.payload;
    }
  } catch (error) {
    console.error(`Error fetching player with most ${attribute}:`, error);
  } finally {
    loading_player_stats.value = false;
  }
}

onMounted(async () => {
  console.log('Fetching Season...');
  loading.value = true;

  try {
    const response = await $axios.get(
      `/seasons/${seasonId.value}?populate=false`
    );
    season.value = response.data.payload;
  } catch (error) {
    console.error('Error fetching Season:', error);
  } finally {
    loading.value = false;
  }
});
</script>
