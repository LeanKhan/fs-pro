<template>
  <v-list dense two-line>
    <squad-player
      v-for="(player, i) in squad"
      :key="i"
      :player="player"
      :matchFinished="matchFinished"
    ></squad-player>
  </v-list>
</template>
<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import SquadPlayer from './squadlist-player.vue';

@Component({
  components: {
    SquadPlayer,
  },
})
export default class SquadList extends Vue {
  @Prop({ required: true, type: Array }) squad!: any;
  @Prop({ required: false, default: false }) matchFinished!: any;

  get list() {
    return this.squad.sort();
  }
}
</script>
