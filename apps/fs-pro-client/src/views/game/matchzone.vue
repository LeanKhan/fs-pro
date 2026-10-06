<template>
  <matchzone-view
    :fixture-id="demo ? undefined : String(route.params.fixture)"
    :demo="demo"
    :can-simulate-rest="isAdmin"
    @close="leave"
  />
</template>

<script setup lang="ts">
import { useRoute, useRouter } from 'vue-router';
import MatchzoneView from '@/components/matchzone/matchzone-view.vue';

/** The Matchzone as a page (fixtures, calendar, challenges link here). The
 * campus opens the same view as an overlay. */
defineProps<{ demo?: boolean }>();
const route = useRoute();
const router = useRouter();

const isAdmin = (() => {
  try {
    return !!JSON.parse(localStorage.getItem('fspro-user') || 'null')?.isAdmin;
  } catch {
    return false;
  }
})();

function leave() {
  // Back to wherever in the app this was opened from; a fresh tab goes home.
  if (window.history.state?.back) router.back();
  else router.push('/u');
}
</script>
