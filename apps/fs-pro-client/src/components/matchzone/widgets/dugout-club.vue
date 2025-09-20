<template>
  <div>
    <v-list-item dense>
      <v-list-item-avatar tile size="30px">
        <v-badge
          bordered
          bottom
          :color="isHome ? 'green accent-3' : 'pink darken-3'"
          dot
          offset-x="10"
          offset-y="10"
        >
          <v-icon style="font-size: 30px; height: 30px" large>
            ${{ club.ClubCode }}
          </v-icon>
        </v-badge>
      </v-list-item-avatar>

      <v-list-item-content>
        <v-list-item-title>
          {{ club.Name }}
        </v-list-item-title>
        <v-list-item-subtitle>
          <template v-if="club.Manager && club.Manager.FirstName">
            {{ club.Manager.FirstName.charAt(0) }}
            {{ club.Manager.LastName }}
          </template>

          <template>
            No Manager
          </template>
        </v-list-item-subtitle>
      </v-list-item-content>

      <v-spacer></v-spacer>
      <v-btn icon @click="showClubSquad = !showClubSquad">
        <v-icon>
          {{ showClubSquad ? 'mdi-chevron-up' : 'mdi-chevron-down' }}
        </v-icon>
      </v-btn>
    </v-list-item>
    <v-expand-transition>
      <div v-show="showClubSquad">
        <v-divider></v-divider>
        <squadlist
          :squad="clubSquad"
          :matchFinished="matchFinished"
        ></squadlist>
      </div>
    </v-expand-transition>
  </div>
</template>
<script setup lang="ts">
import { ref } from 'vue';
import Squadlist from './squadlist.vue';

interface Props {
  club: any;
  clubSquad?: any;
  matchFinished?: any;
  isHome: boolean;
}

withDefaults(defineProps<Props>(), {
  matchFinished: false,
});

const showClubSquad = ref(false);
</script>
