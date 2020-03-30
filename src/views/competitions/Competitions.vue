<template>
  <div>
    <v-breadcrumbs :items="routes"></v-breadcrumbs>
    <router-view></router-view>
  </div>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';

@Component({})
export default class Competitions extends Vue {
  private routes: any[] = [
    {
      text: 'Dashboard',
      disabled: false,
      href: 'breadcrumbs_dashboard',
    },
    {
      text: 'Link 1',
      disabled: false,
      href: 'breadcrumbs_link_1',
    },
    {
      text: 'Link 2',
      disabled: true,
      href: 'breadcrumbs_link_2',
    },
  ];
}
</script>

<style></style>
