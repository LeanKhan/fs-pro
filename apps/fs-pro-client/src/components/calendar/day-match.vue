<template>
  <v-list-item>
    <v-list-item-avatar size="20px" color="amber">
      {{ match ? match.Time : 'No Time :P' }}
    </v-list-item-avatar>
    <v-list-item-title class="caption">
      {{
        match ? `${match.Fixture.Home} vs ${match.Fixture.Away}` : 'No Match :P'
      }}
    </v-list-item-title>

    <v-list-item-icon size="20px" color="green" v-if="match?.Fixture?.Played">
      <v-icon color="green accent-3">mdi-check</v-icon>
    </v-list-item-icon>
  </v-list-item>
</template>

<script setup lang="ts">
interface Props {
  match: any;
  home: boolean;
}

defineProps<Props>();
</script>
