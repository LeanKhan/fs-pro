<template>
  <v-simple-table>
    <template v-slot:default>
      <thead>
        <tr>
          <th class="text-left">Title</th>
          <th class="text-left">Result</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="fx in fixtures" :key="fx._id" @click="goToMatch(fx._id)">
          <td>
            <v-icon large>${{ fx.Home }}</v-icon>
            {{ fx.Title }}
            <v-icon large>${{ fx.Away }}</v-icon>
          </td>
          <td>{{ fx.Played ? fx.Details.FullTimeScore : '- : -' }}</td>
        </tr>
      </tbody>
    </template>
  </v-simple-table>
</template>

<script lang="ts">
// import { Component, Vue, }
// TODO: Highlight the winner of the match
// TODO: Allow filtering, maybe show only played matches?
// TODO: Should be able to visit the Match page of played matches
// TODO: Should show Day information...
import { Component, Vue, Prop } from 'vue-property-decorator';

@Component({
  name: 'Fixtures',
})
export default class FixturesTable extends Vue {
  @Prop({ required: true }) fixtures!: any;

  /**
   * ID -  Fixture Id
   */
  private goToMatch(id: string) {
    this.$router.push('/matchzone/' + id);
  }
}
</script>

<style scoped>
tr {
  cursor: pointer;
}
</style>
