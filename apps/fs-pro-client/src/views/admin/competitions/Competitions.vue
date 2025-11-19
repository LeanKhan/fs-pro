<template>
  <div>
    <v-breadcrumbs :items="crumbs"></v-breadcrumbs>
    <router-view></router-view>
  </div>
</template>

<script lang="ts">
import { defineComponent, computed } from 'vue';
import { useRoute } from 'vue-router';

export default defineComponent({
  name: 'Competitions',
  setup() {
    const route = useRoute();
    const crumbs = computed(() => {
      return route.matched.map((path) => {
        return {
          exact: true,
          disabled: false,
          to:
            typeof path.meta.to == 'function'
              ? path.meta(route).to()
              : path.path,
          text: path.meta.title || path.name || path.meta(route).title,
        };
      });
    });

    return { crumbs };
  },
});
</script>

<style></style>
