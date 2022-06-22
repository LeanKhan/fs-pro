<template>
  <v-app>
    <v-main>
      <v-container class="indigo auth-background" fluid>
        <v-row>
          <v-col offset="7">
            <div
              class="d-flex justify-center align-center"
              style="height: 100px;"
            >
              <img
                alt="FsPro Logo :)"
                height="100px"
                :src="`${url}/img/logo-new.png`"
              />
            </div>
            <v-card color="dark">
              <v-tabs background-color="transparent" color="green" grow>
                <v-tab title="Login" to="login">Login</v-tab>

                <v-tab title="Join" to="join">Join</v-tab>
              </v-tabs>
              <router-view></router-view>
            </v-card>
          </v-col>
        </v-row>
      </v-container>
    </v-main>

    <v-footer class="text-center" dark padless tile>
      <v-row dir="row" no-gutters class="justify-center">
        <v-col class="my-2">
          <v-btn to="/credits" text>credits</v-btn>
        </v-col>
        <v-col class="ext-center white--text" cols="12">
          <v-divider></v-divider>

          {{ new Date().getFullYear() }} —
          <span>LeanKhan and Tobi</span>
        </v-col>
      </v-row>
    </v-footer>
  </v-app>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import { apiUrl } from '@/store';

@Component({})
export default class Auth extends Vue {
  private url = apiUrl;
}
</script>
<style scoped>
.auth-background {
  height: 100%;
  background: linear-gradient(80deg, transparent 0%, black 82%),
    url('https://images.pexels.com/photos/399187/pexels-photo-399187.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940')
      center center border-box no-repeat;
}
ul {
  list-style-type: none;
  margin: 0;
  padding: 0;
  overflow: hidden;
  background-color: #333333;
}

li {
  float: left;
}

li a {
  display: block;
  color: white;
  text-align: center;
  padding: 16px;
  text-decoration: none;
}

li a:hover {
  background-color: #111111;
}
</style>
