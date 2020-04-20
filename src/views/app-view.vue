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
          v-for="item in items"
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

    <v-app-bar app dense clipped-left>
      <v-app-bar-nav-icon @click.stop="drawer = !drawer" />
      <img class="mx-4" width="40px" :src="`${api}/img/logo-new.png`" />
      <v-toolbar-title class="mr-12 align-center">
        <span class="title">FS Pro</span>
      </v-toolbar-title>

      <v-spacer></v-spacer>

      <v-avatar size="30px">
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

      <span>
        {{ user ? user.username : 'User' }}
      </span>

      <v-btn icon>
        <v-icon color="yellow ">
          mdi-account-variant
        </v-icon>
      </v-btn>
    </v-app-bar>

    <v-content>
      <v-container fluid>
        <router-view></router-view>
      </v-container>
    </v-content>

    <v-footer app>
      <v-row dir="row">
        <!-- <v-col cols="12">
          <v-slide-group multiple show-arrows>
            <v-slide-item
              v-for="n in 25"
              :key="n"
              v-slot:default="{ active, toggle }"
            >
              <v-btn
                class="mx-2"
                :input-value="active"
                active-class="purple white--text"
                depressed
                rounded
                @click="toggle"
              >
                Options {{ n }}
              </v-btn>
            </v-slide-item>
          </v-slide-group>
        </v-col> -->
        <v-col col="12">
          <span>&copy; {{ new Date().getFullYear() }} Leankhan &amp; Tobi</span>
        </v-col>
      </v-row>
    </v-footer>
  </v-app>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import { apiUrl } from '@/store';

@Component({})
export default class AppView extends Vue {
  private drawer = true;

  private show = false;

  public api: string = apiUrl;

  // private items(): any[] {
  //   if(this.$route.fullPath.split('/'))
  // }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private items: any[] = [
    { title: 'Home', icon: 'mdi-soccer', link: '/a', color: 'primary' },
    { title: 'Clubs', icon: 'mdi-security', link: '/a/clubs', color: 'amber' },
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
      color: 'pink',
    },
  ];

  get user() {
    return JSON.parse(window.localStorage.getItem('fs-pro-user') as string);
  }

  private mini = true;

  get userMode(): boolean {
    return this.$route.path.split('/')[1] == 'u';
  }

  mounted() {
    console.log('Path => ', this.$route.path.split('/'));
  }
}
</script>
