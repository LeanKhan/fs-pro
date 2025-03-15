<template>
  <div id="end-of-season">
    <v-container v-if="season" fluid class="pa-0">
      <v-toolbar dense color="dark">
        <v-toolbar-title class="mx-auto">
          End of {{ season.Year }} {{ season.CompetitionCode }} Season
        </v-toolbar-title>

        <v-spacer></v-spacer>

        <v-btn depressed small icon @click="close">
          <v-icon>
            mdi-close
          </v-icon>
        </v-btn>
      </v-toolbar>

      <v-row>
        <template :key="k" v-for="(attr, k) in stats_attributes">
          <v-col cols="3">
            <v-card>
              <v-card-title class="capitalize">Highest {{ attr }}</v-card-title>

              <v-list v-if="top_players[attr].length > 0">
                <v-list-item v-for="(p, i) in top_players[attr]" :key="i">
                  <v-list-item-avatar>
                    <v-icon style="font-size: 30px; height: 30px" large>
                      ${{ p.player.ClubCode }}
                    </v-icon>
                  </v-list-item-avatar>
                  <v-list-item-title>
                    {{ p.player.FirstName }} {{ p.player.LastName }}
                  </v-list-item-title>

                  <v-list-item-avatar size="40px" color="blue">
                    <span class="white--text font-weight-bold">
                      {{ p[attr] | roundTo(2) }}
                    </span>
                  </v-list-item-avatar>
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
    <v-overlay :value="loading">
      <v-progress-circular indeterminate size="68"></v-progress-circular>
    </v-overlay>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, getCurrentInstance } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { $axios } from '@/main';

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

const instance = getCurrentInstance();

function roundTo(stuff: any) {
  if (instance) {
    return instance.appContext.config.globalProperties.$filters.roundTo(stuff);
  }
}
function close() {
  router.push('/u');
}

async function load_stats(attribute: string) {
  loading_player_stats.value = true;
  try {
    const response = await $axios.get(
      `/players/stats?match_k=season._id&match_v=${route.params.season_id}&sort_k=${attribute}&sort_v=-1`
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
    const response = await $axios.get(`/seasons/${route.params.season_id}?populate=false`);
    season.value = response.data.payload;
  } catch (error) {
    console.error('Error fetching Season:', error);
  } finally {
    loading.value = false;
  }
});
</script>