<template>
  <div class="home">
    <v-app-bar app color="white" floating collapse>
      <v-btn icon>
        <v-icon color="green">
          mdi-star
        </v-icon>
      </v-btn>
    </v-app-bar>

    <div class="d-flex justify-center align-center" style="height: 400px;">
      <p class="display-2 white--text text-center">Match Zone</p>

      <img
        alt="FsPro Logo :)"
        height="200px"
        :src="`${api}/img/logo-new.png`"
      />
    </div>
  </div>
</template>

<script lang="ts">
// @ is an alias to /src
import { Component, Vue } from 'vue-property-decorator';
import { apiUrl } from '@/store';

@Component({
  name: 'MatchZone',
})
export default class MatchZone extends Vue {
  public api: string = apiUrl;
}
</script>
