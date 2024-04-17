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
        
        <b class="font-weight-bold pink--text">
          [{{ Math.round(player.Rating) }}]
        </b>

        <template v-if="matchFinished">
          <template v-if="player.stats.Goals > 0">
            <v-icon class="ml-1" small color="blue accent--3">
              mdi-soccer
            </v-icon>
            x {{ player.stats.Goals }}
          </template>

          <template v-if="player.stats.Saves > 0">
            <v-icon class="ml-1" small color="purple accent--3">
              mdi-pan
            </v-icon>
            x {{ player.stats.Saves }}
          </template>

          <template v-if="player.stats.Assists > 0">
            <v-icon class="ml-1" small color="green accent--3">
              mdi-fullscreen
            </v-icon>
            x {{ player.stats.Assists }}
          </template>
        </template>
      </v-list-item-subtitle>
    </v-list-item-content>

    <v-list-item-avatar
      v-if="matchFinished"
      tile
      size="40px"
      :color="matchRatingColor(Math.round(player.stats.Points))"
      class="caption"
    >
      <span class="white--text font-weight-bold">
        {{ Math.round(player.stats.Points) }}
      </span>
    </v-list-item-avatar>
  </v-list-item>
</template>
<script lang="ts">
// TODO: Should show players after the Match rating
// TODO: Should indicate MOTM also
// TODO: Should also show who scored and how many goals. How do we add a pitch there?
import { Component, Vue, Prop } from 'vue-property-decorator';

@Component({})
export default class SquadPlayer extends Vue {
  @Prop({ required: true, type: Object }) player!: any;
  @Prop({ required: false, default: false }) matchFinished!: any;

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

  public matchRatingColor(rating: number): string {
    if (rating >= 8) return 'green';
    else if (rating >= 5) return 'orange';
    else return 'red';
  }
}
</script>
