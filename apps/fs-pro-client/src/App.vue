<template>
  <router-view></router-view>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';

@Component({})
export default class App extends Vue {
  created(): void {
    this.$vuetify.theme.dark = true;
    this.$vuetify.theme.currentTheme.primary = '#7535ed';
    this.$vuetify.theme.currentTheme.accent = '#c23361';
    this.$vuetify.theme.currentTheme.anchor = '#340f78';
  }
}
</script>
