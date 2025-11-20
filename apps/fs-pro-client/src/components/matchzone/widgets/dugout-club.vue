<template>
  <div>
    <v-list-item density="compact">
      <template v-slot:prepend>
        <v-badge
          bordered
          location="bottom"
          :color="isHome ? 'green-accent-3' : 'pink-darken-3'"
          dot
          offset-x="10"
          offset-y="10"
        >
          <v-avatar tile size="30">
            <v-icon style="font-size: 30px; height: 30px" size="large">
              custom:{{ club.ClubCode }}
            </v-icon>
          </v-avatar>
        </v-badge>
      </template>

      <v-list-item-title>
        {{ club.Name }}
      </v-list-item-title>
      <v-list-item-subtitle>
        <template v-if="club.Manager && club.Manager.FirstName">
          {{ club.Manager.FirstName.charAt(0) }}
          {{ club.Manager.LastName }}
        </template>

        <template v-else>No Manager</template>
      </v-list-item-subtitle>

      <template v-slot:append>
        <v-btn icon @click="showClubSquad = !showClubSquad">
          <v-icon>
            {{ showClubSquad ? 'mdi-chevron-up' : 'mdi-chevron-down' }}
          </v-icon>
        </v-btn>
      </template>
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
