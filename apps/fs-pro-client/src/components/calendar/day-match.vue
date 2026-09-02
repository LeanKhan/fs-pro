<template>
  <v-list-item>
    <v-list-item size="20px" color="amber" avatar>
      {{ match ? `Week ${match.Week}` : 'No Match :P' }}
    </v-list-item>
    <v-list-item-title class="text-caption">
      {{ match ? `${match.Home} vs ${match.Away}` : 'No Match :P' }}
    </v-list-item-title>

    <v-list-item icon size="20px" color="green" v-if="match?.Played">
      <v-icon color="green-accent-3">mdi-check</v-icon>
    </v-list-item>
  </v-list-item>
</template>

<script setup lang="ts">
interface Props {
  match: any;
  home: boolean;
}

defineProps<Props>();
</script>
