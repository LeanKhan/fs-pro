<template>
  <v-table>
    <thead>
      <tr>
        <th class="text-left">Title</th>
        <th class="text-left">Result</th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="fx in fixtures" :key="fx._id" @click="goToMatch(fx._id)">
        <td>
          <v-icon size="large">custom:{{ fx.Home }}</v-icon>
          {{ fx.Title }}
          <v-icon size="large">custom:{{ fx.Away }}</v-icon>
        </td>
        <td>{{ fx.Played ? fx.Details.FullTimeScore : '- : -' }}</td>
      </tr>
    </tbody>
  </v-table>
</template>

<script setup lang="ts">
// TODO: Highlight the winner of the match
// TODO: Allow filtering, maybe show only played matches?
// TODO: Should be able to visit the Match page of played matches
// TODO: Should show Day information...
import { useRouter } from 'vue-router';

interface Props {
  fixtures: any;
}

defineProps<Props>();

const router = useRouter();

/**
 * ID - Fixture Id
 */
const goToMatch = (id: string) => {
  router.push('/matchzone/' + id);
};
</script>

<style scoped>
tr {
  cursor: pointer;
}
</style>
