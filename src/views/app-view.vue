<template>
  <v-app id="app">
    <v-navigation-drawer v-model="drawer" app clipped>
      <v-list-item class="px-2 mt-2">
        <v-list-item-avatar>
          <v-img
            :src="
              `${
                userMode
                  ? 'https://randomuser.me/api/portraits/women/84.jpg'
                  : 'https://randomuser.me/api/portraits/men/85.jpg'
              }`
            "
          ></v-img>
        </v-list-item-avatar>

        <v-list-item-title>
          {{ userMode ? 'Manager' : 'Admin' }}
        </v-list-item-title>

        <v-btn icon @click="show = !show">
          <v-icon>{{ show ? 'mdi-chevron-up' : 'mdi-chevron-down' }}</v-icon>
        </v-btn>
      </v-list-item>

      <v-expand-transition>
        <div v-show="show">
          <v-divider></v-divider>

          <v-list-item
            class="px-2 grey darken-4"
            :to="`${!userMode ? '/u' : '/a'}`"
            link
          >
            <v-list-item-avatar>
              <v-img
                :src="
                  `${
                    !userMode
                      ? 'https://randomuser.me/api/portraits/women/84.jpg'
                      : 'https://randomuser.me/api/portraits/men/85.jpg'
                  }`
                "
              ></v-img>
            </v-list-item-avatar>

            <v-list-item-title>
              {{ !userMode ? 'Manager' : 'Admin' }}
            </v-list-item-title>
          </v-list-item>
        </div>
      </v-expand-transition>

      <v-divider></v-divider>

      <v-list dense>
        <v-list-item
          v-for="item in navItems"
          :key="item.title"
          :to="item.link"
          :exact="true"
          link
        >
          <v-list-item-icon>
            <v-icon :color="item.color">{{ item.icon }}</v-icon>
          </v-list-item-icon>

          <v-list-item-content>
            <v-list-item-title>{{ item.title }}</v-list-item-title>
          </v-list-item-content>
        </v-list-item>
      </v-list>
    </v-navigation-drawer>

    <v-app-bar app dense clipped-left v-if="!MatchZone">
      <v-app-bar-nav-icon @click.stop="drawer = !drawer" />
      <img class="mx-4" width="40px" :src="`${api}/img/logo-new.png`" />
      <v-toolbar-title class="mr-12 align-center">
        <span class="title">FS Pro</span>
      </v-toolbar-title>

      <v-spacer></v-spacer>

      <v-badge
        bordered
        bottom
        :color="$socket.connected ? 'deep-purple accent-4' : 'grey'"
        dot
        offset-x="10"
        offset-y="10"
      >
        <v-avatar size="30">
          <v-img
            :src="
              `${
                userMode
                  ? 'https://randomuser.me/api/portraits/women/84.jpg'
                  : 'https://randomuser.me/api/portraits/men/85.jpg'
              }`
            "
          ></v-img>
        </v-avatar>
      </v-badge>

      <span class="ml-2">
        {{ user ? user.username : 'User' }}
      </span>

      <v-btn class="ml-2" small icon>
        <v-icon small color="error" @click="logout">
          mdi-logout
        </v-icon>
      </v-btn>
    </v-app-bar>

    <v-main>
      <v-container fluid>
        <router-view></router-view>
      </v-container>
    </v-main>

    <!-- TODO: add a global snackbar to app -->
    <!-- <v-snackbar color="dark" timeout="2000" :value="showSnackbar">
      Hi!
    </v-snackbar> -->

    <v-snackbar v-model="toast.show" :timeout="3000" :color="toast.style">
      {{ toast.message }}
    </v-snackbar>

    <!-- TODO: clean this up! -->
    <v-overlay v-model="errorOverlay">
      <v-sheet class="text-center pa-2" width="500px" height="300px">
        Error!
        <br />
        <v-btn color="green" @click="goBackToPreviousState">
          Go Back
        </v-btn>
      </v-sheet>
    </v-overlay>

    <!-- <v-footer app>
      <v-row dir="row">

        <v-col col="12">
          <span>&copy; {{ new Date().getFullYear() }} Leankhan &amp; Tobi</span>
        </v-col>
      </v-row>
    </v-footer> -->
  </v-app>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import { Route, RawLocation } from 'vue-router';
import { apiUrl } from '@/store';

@Component({
  beforeRouteUpdate(
    to: Route,
    from: Route,
    next: (to?: RawLocation | false | ((vm: AppView) => any) | void) => void
  ): void {
    if (to.name == 'MatchZone') {
      this.drawer = false;
      this.appBar = false;
    } else {
      this.drawer = true;
      this.appBar = true;
    }
    next();
  },
})
export default class AppView extends Vue {
  private drawer = true;

  private appBar = true;

  private show = false;

  public api: string = apiUrl;

  // public errorOverlay = false;

  // private items(): any[] {
  //   if(this.$route.fullPath.split('/'))
  // }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private adminNavItems: any[] = [
    { title: 'Home', icon: 'mdi-soccer', link: '/a', color: 'primary' },
    { title: 'Clubs', icon: 'mdi-security', link: '/a/clubs', color: 'amber' },
    {
      title: 'Calendar',
      icon: 'mdi-calendar',
      link: '/a/calendar',
      color: 'indigo',
    },
    {
      title: 'Players',
      icon: 'mdi-account',
      link: '/a/players',
      color: 'indigo',
    },
    {
      title: 'Competitions',
      icon: 'mdi-trophy',
      link: '/a/competitions',
      color: 'yellow',
    },
    {
      title: 'Managers',
      icon: 'mdi-account',
      link: '/a/managers',
      color: 'cyan',
    },
  ];

  // private userNavItems: any[] = [
  //   { title: 'Home', icon: 'mdi-soccer', link: '/u', color: 'primary' },
  //   { title: 'Clubs', icon: 'mdi-security', link: '/u/clubs', color: 'amber' },
  // ];

  private logout() {
    this.$axios
      .delete(`/users/${this.user.userID}/logout`)
      .then(response => {
        console.log('Response => ', response.data);
        if (response.data.success) {
          this.$socket.client.disconnect();
          this.$store.dispatch('UNSET_USER');
          this.$router.push('/auth');
        }
      })
      .catch(response => {
        console.log('Error logging out! ', response.data);
      });
  }

  private goBackToPreviousState() {
    this.$store.commit('TOGGLE_ERROR_OVERLAY');
    this.$router.back();
  }

  get user() {
    return this.$store.getters.user;
  }

  get errorOverlay() {
    return this.$store.getters.errorOverlay;
  }

  get toast() {
    return this.$store.getters.toast;
  }

  get userNavItems(): any[] {
    let routes = [
      { title: 'Home', icon: 'mdi-soccer', link: '/u', color: 'primary' },
    ];

    if (typeof this.user.clubs[0] == 'object') {
      console.log('Clubs dey');
      const clubRoutes = this.user.clubs.map((club: any) => {
        return {
          title: club.Name,
          icon: `$${club.ClubCode}`,
          link: `/u/clubs/${club._id}/${club.ClubCode}`,
          color: 'pink darken-2',
        };
      });

      routes = [...routes, ...clubRoutes];
    }

    return routes;

    // { title: 'Clubs', icon: 'mdi-security', link: '/u/clubs', color: 'amber' },
  }

  private mini = true;

  get userMode(): boolean {
    return this.$route.path.split('/')[1] == 'u';
  }

  get MatchZone(): boolean {
    return this.$route.name == 'MatchZone';
  }

  get navItems() {
    if (!this.userMode) {
      return this.adminNavItems;
    }

    return this.userNavItems;
  }

  private enter() {
    const { userID, session: sessionID } = this.user;

    console.log('user => ', this.user);

    this.$axios
      .post(
        '/users/enter',
        { user: { userID, sessionID } },
        { withCredentials: true }
      )
      .then(response => {
        this.$store.dispatch('SET_USER', {
          ...this.user,
          session: response.data.sessionID,
        });
      })
      .catch(response => {
        console.log('Error entering in! ', response.data.error);
      });
  }

  mounted() {
    // console.log('Path => ', this.$route.path.split('/'));
    // if userMode then fetch User's clubs and stuff...

    if(this.MatchZone){
      this.drawer = false;
    }

    this.$store.dispatch('GET_USER');

    this.$store.dispatch('GET_COUNTRIES');

    // Enter app :p wait for getting user first! XD
    this.enter();

    this.$socket.client.open();
  }
}
</script>
