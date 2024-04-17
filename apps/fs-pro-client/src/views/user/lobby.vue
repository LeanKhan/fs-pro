<template>
  <div id="user-lobby">
    <h4 class="display-1 mb-0 text-center">FS-Pro Lobby</h4>
    <div class="d-flex justify-center align-center my-3">
      <img
        alt="FsPro Logo :)"
        height="200px"
        :src="`${api}/img/logo-new.png`"
      />
    </div>
    <div class="text-center white--text pa-2">
      No new Years available yet. Admin will create :)

      <br />
      <v-btn color="primary" to="/a/calendar">I'm an Admin</v-btn>
    </div>
  </div>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import { apiUrl } from '@/store';

@Component
export default class UserLobby extends Vue {
  public api: string = apiUrl;
}
</script>

<style></style>
