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
  private routes: any[] = [];

  private get crumbs(): any[] {
    const pathArray = this.$route.path.split('/');
    pathArray.shift();
    const breadcrumbs = this.$route.matched.map(path => {
      return {
        path: path.path,
        disabled: false,
        to: path.path,
        text: path.meta.title || path.name,
      };
    });
    breadcrumbs[breadcrumbs.length - 1].disabled = true;
    return breadcrumbs;
  }

  private mounted() {
    this.routes = this.crumbs;
  }
}
</script>

<style></style>
