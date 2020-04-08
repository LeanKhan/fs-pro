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
            <v-icon>{{ item.icon }}</v-icon>
          </v-list-item-icon>

          <v-list-item-content>
            <v-list-item-title>{{ item.title }}</v-list-item-title>
          </v-list-item-content>
        </v-list-item>
      </v-list>
    </v-navigation-drawer>

    <v-app-bar app dense clipped-left>
      <v-app-bar-nav-icon @click.stop="drawer = !drawer" />
      <img class="mx-4" width="40px" src="http://localhost:3000/img/logo.png" />
      <v-toolbar-title class="mr-12 align-center">
        <span class="title">FS Pro</span>
      </v-toolbar-title>
    </v-app-bar>

    <v-content>
      <v-container fluid>
        <router-view></router-view>
      </v-container>
    </v-content>

    <v-footer app>
      <span>&copy; 2019</span>
    </v-footer>
  </v-app>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';

@Component({})
export default class AppView extends Vue {
  private drawer = true;

  private show = false;

  // private items(): any[] {
  //   if(this.$route.fullPath.split('/'))
  // }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private items: any[] = [
    { title: 'Home', icon: 'mdi-soccer', link: '/a' },
    { title: 'Clubs', icon: 'mdi-security', link: '/a/clubs' },
    { title: 'Players', icon: 'mdi-account', link: '/a/players' },
    { title: 'Competitions', icon: 'mdi-trophy', link: '/a/competitions' },
  ];

  private mini = true;

  get userMode(): boolean {
    return this.$route.path.split('/')[1] == 'u';
  }

  created(): void {
    this.$vuetify.theme.dark = true;
    this.$vuetify.theme.currentTheme.primary = '#7535ed';
    this.$vuetify.theme.currentTheme.accent = '#c23361';
    this.$vuetify.theme.currentTheme.anchor = '#340f78';
  }

  mounted() {
    console.log('Path => ', this.$route.path.split('/'));
  }
}
</script>
