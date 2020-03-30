<template>
  <v-app id="app">
    <v-navigation-drawer v-model="drawer" app clipped>
      <v-list-item class="px-2">
        <v-list-item-avatar>
          <v-img src="https://randomuser.me/api/portraits/men/85.jpg"></v-img>
        </v-list-item-avatar>

        <v-list-item-title>Admin</v-list-item-title>

        <v-btn icon>
          <v-icon>mdi-chevron-down</v-icon>
        </v-btn>
      </v-list-item>

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
export default class App extends Vue {
  private drawer = true;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private items: any[] = [
    { title: 'Home', icon: 'mdi-soccer', link: '/' },
    { title: 'Clubs', icon: 'mdi-security', link: '/clubs' },
    { title: 'Players', icon: 'mdi-group', link: '/players' },
    { title: 'Competitions', icon: 'mdi-home', link: '/competitions' },
  ];

  private mini = true;

  created(): void {
    this.$vuetify.theme.dark = true;
  }
}
</script>
