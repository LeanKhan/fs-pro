<template>
  <v-list-item
    style="min-height: 30px !important;height: 40px !important"
    dense
    two-line
  >
    <!-- <v-badge>
    <template v-slot:default>
      
    </template>
  </v-badge> -->
    <v-list-item-avatar tile size="20px" color="transparent" class="caption">
      <span :class="positionColor">
        {{ position }}
      </span>
    </v-list-item-avatar>
    <v-list-item-content class="pa-0">
      <v-list-item-subtitle>
        {{ player.FirstName }}
        {{ player.LastName }}

        <b class="font-weight-bold white--text">
          {{ Math.round(player.Rating) }}
        </b>
      </v-list-item-subtitle>
    </v-list-item-content>
  </v-list-item>
</template>
<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';

@Component({})
export default class SquadPlayer extends Vue {
  @Prop({ required: true, type: Object }) player!: any;

  get position() {
    return this.player.Position;
  }

  get positionColor() {
    switch (this.position) {
      case 'GK':
        return 'deep-orange--text text--accent-3';
      case 'DEF':
        return 'red--text text--accent-3';
      case 'MID':
        return 'green--text text--accent-3';
      case 'ATT':
        return 'blue--text text--accent-3';
      default:
        return 'secondary';
    }
  }

  public ratingColor(rating: number): string {
    if (rating >= 80) return 'green';
    else if (rating >= 50) return 'orange';
    else return 'red';
  }
}
</script>
