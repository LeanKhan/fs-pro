<template>
  <v-card elevation="2" class="pa-2" color="green-accent-2">
    <v-toolbar>
      Best Players
      <v-icon>mdi-chart-areaspline</v-icon>
    </v-toolbar>
    <v-row>
      <template v-for="(attr, k) in stats_attributes" v-bind:key="k">
        <v-col cols="6">
          <v-card color="green-accent-1">
            <v-card-title class="capitalize text-subtitle-1 text-black">
              Highest {{ attr }}
            </v-card-title>

            <v-list v-if="top_players[attr].length > 0">
              <v-list-item v-for="(p, i) in top_players[attr]" :key="i">
                <template v-slot:prepend>
                  <v-avatar>
                    <v-icon style="font-size: 30px; height: 30px" size="large">
                      custom:{{ p.player.ClubCode }}
                    </v-icon>
                  </v-avatar>
                </template>

                <v-list-item-title>
                  {{ p.player.FirstName }} {{ p.player.LastName }}
                </v-list-item-title>

                <template v-slot:append>
                  <v-avatar size="40" color="blue">
                    <span class="text-white font-weight-bold">
                      {{ $filters.roundTo(p[attr], 2) }}
                    </span>
                  </v-avatar>
                </template>
              </v-list-item>
            </v-list>

            <v-sheet class="pa-2" v-else>
              <v-btn
                block
                :variant="loading_player_stats ? 'elevated' : 'flat'"
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
  </v-card>
</template>

<script setup lang="ts">
import { ref, getCurrentInstance } from 'vue';

interface Props {
  seasonId: string;
}

const props = defineProps<Props>();

const instance = getCurrentInstance();
const $axios = instance?.appContext.config.globalProperties.$axios;
const $filters = instance?.appContext.config.globalProperties.$filters;

// after end of season, check if the Year is also over (that is, all the seasons are finished...)
// then go to End Of Year...

const loading = ref(false);
const loading_player_stats = ref(false);
const stats_attributes = ref(['points', 'goals', 'assists', 'saves']);

const top_players = ref<{
  points: any[];
  goals: any[];
  assists: any[];
  saves: any[];
  [key: string]: any[];
}>({
  points: [],
  goals: [],
  assists: [],
  saves: [],
});

const load_stats = (attribute: string) => {
  loading_player_stats.value = true;
  $axios
    .get(
      `/players/stats?match_k=season._id&match_v=${props.seasonId}&sort_k=${attribute}&sort_v=-1`
    )
    .then((response: any) => {
      if (response.data.success) {
        top_players.value[attribute] = response.data.payload;
      }
    })
    .catch((err: any) => {
      console.log(`Error fetching player with most ${attribute} => `, err);
    })
    .finally(() => {
      loading_player_stats.value = false;
    });
};
</script>

<style></style>
