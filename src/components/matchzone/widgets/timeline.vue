<template>
  <v-timeline>
    <v-timeline-item color="white" light>
      timeline item
    </v-timeline-item>
    <v-timeline-item light color="light" class="text-right">
      timeline item
    </v-timeline-item>
    <v-timeline-item light>timeline item</v-timeline-item>
  </v-timeline>
</template>
<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';

@Component({})
export default class Timeline extends Vue {}
</script>
