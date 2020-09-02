<template>
  <v-list dense two-line>
    <squad-player
      v-for="(player, i) in squad"
      :key="i"
      :player="player"
    ></squad-player>
  </v-list>
</template>
<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import SquadPlayer from './player.vue';

@Component({
  components: {
    SquadPlayer,
  },
})
export default class SquadList extends Vue {
  @Prop({ required: true, type: Array }) squad!: any;

  get list() {
    return this.squad.sort();
  }
}
</script>
