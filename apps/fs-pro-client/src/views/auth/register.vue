<template>
  <v-card>
    <v-card-title class="title font-weight-regular justify-space-between">
      <span>{{ currentTitle }}</span>
      <v-avatar
        color="primary lighten-2"
        class="subheading white--text"
        size="40"
      >
        <v-icon color="white">
          {{ currentIcon }}
        </v-icon>
      </v-avatar>
    </v-card-title>
    <v-window v-model="step">
      <v-window-item :value="1">
        <form>
          <v-card>
            <v-card-text>
              <v-text-field
                required
                type="text"
                label="Full Name"
                color="green"
                v-model="form.FullName"
              ></v-text-field>

              <v-text-field
                required
                type="text"
                label="Username"
                color="green"
                v-model="form.Username"
              ></v-text-field>

              <v-text-field
                required
                type="text"
                label="Password"
                color="green"
                v-model="form.Password"
              ></v-text-field>

              <v-text-field
                :error="confirmPassword != form.Password"
                required
                type="text"
                label="Confirm Password"
                color="green"
                v-model="confirmPassword"
              ></v-text-field>
            </v-card-text>
          </v-card>
        </form>
      </v-window-item>
      <v-window-item :value="2">
        <v-card-text>
          <!-- list of clubs :p -->
          <!--             <v-card-actions>
              <v-btn color="green darken-2" @click="register" block>
                Join
              </v-btn>
            </v-card-actions> -->
          <v-card flat tile>
            <v-list>
              <v-list-item-group v-model="form.Clubs" multiple>
                <v-list-item
                  v-for="(club, i) in visibleClubs"
                  :value="club._id"
                  :input-value="
                    form.Clubs.filter(c => c === club._id).length > 0
                  "
                  :key="i"
                >
                  <template v-slot:default="{ active, toggle }">
                    <v-list-item-action>
                      <v-checkbox
                        color="green"
                        :true-value="club._id"
                        :input-value="active"
                        @click="toggle"
                      ></v-checkbox>
                    </v-list-item-action>

                    <v-list-item-content>
                      <v-list-item-title>{{ club.ClubCode }}</v-list-item-title>
                      <v-list-item-subtitle>
                        {{ club.Name }}
                      </v-list-item-subtitle>
                    </v-list-item-content>

                    <v-list-item-avatar>
                      <v-img
                        :src="`${api}/img/clubs/logos/${club.ClubCode}.png`"
                        width="40px"
                      ></v-img>
                    </v-list-item-avatar>
                  </template>
                </v-list-item>
              </v-list-item-group>
            </v-list>
            <v-card-actions>
              <v-pagination
                circle
                v-model="page"
                :length="Math.ceil(clubs.length / perPage)"
              ></v-pagination>
            </v-card-actions>
          </v-card>
        </v-card-text>
      </v-window-item>
    </v-window>

    <v-divider></v-divider>

    <v-card-actions>
      <v-btn :disabled="step === 1" text @click="step--">
        Back
      </v-btn>
      <v-spacer></v-spacer>
      <v-btn color="primary" depressed @click="step == 2 ? register() : step++">
        {{ step == 2 ? 'Submit' : 'Next' }}
      </v-btn>
    </v-card-actions>
  </v-card>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import { apiUrl } from '@/store';
@Component
export default class Register extends Vue {
  public api: string = apiUrl;
  private form = {
    FullName: '',
    Username: '',
    Password: '',
    Clubs: [],
  };
  private clubs = [];
  private page = 1;
  private perPage = 5;
  // private pages = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];
  private confirmPassword = '';
  private step = 1;
  private get currentTitle() {
    switch (this.step) {
      case 1:
        return 'Account Details';
      case 2:
        return 'Select Teams';
      default:
        return 'Account created';
    }
  }
  private get currentIcon() {
    switch (this.step) {
      case 1:
        return 'mdi-account';
      case 2:
        return 'mdi-shield';
      default:
        return 'Account created';
    }
  }

  private get visibleClubs() {
    return this.clubs.slice(
      (this.page - 1) * this.perPage,
      this.page * this.perPage
    );
  }
  private getClubs() {
    const query = JSON.stringify({ User: null });
    const select = JSON.stringify('Name ClubCode _id');
    this.$axios
      .get(`/clubs/fetch?q=${query}&select=${select}`)
      .then(res => {
        this.clubs = res.data.payload;
      })
      .catch(err => {
        console.log('Error! => ', err);
      });
  }
  private register() {
    this.$axios
      .post(
        '/users/join',
        { data: { ...this.form } },
        { withCredentials: true }
      )
      .then(response => {
        console.log('response =>', response);
        if (response.data.success) {
          this.$store.dispatch('SET_USER', {
            userID: response.data.payload._id,
            username: response.data.payload.Username,
            clubs: response.data.payload.Clubs,
            isAdmin: response.data.payload.isAdmin,
            session: response.data.payload.Session,
            avatar: response.data.payload.Avatar,
            fullname: response.data.payload.FullName,
          });

          this.$socket.client.emit('authenticate');

          this.$router.push('/u');
        }
      })
      .catch(response => {
        console.log('Error logging in! ', response);
      });
  }

  mounted() {
    this.getClubs();
  }
}
</script>

<style></style>
