<template>
  <div id="end-of-season">
    <v-container fluid class="pa-0">
      <p>Hi! The season is overrrr</p>

      <v-row no-gutters>
        <v-col>
          <v-subheader>Season Stats</v-subheader>
          <ul>
            <li>
              Winner:
            </li>

            <li>
              Promotion (if available)
            </li>

            <li>
              Relegated
            </li>

            <li>Player of the year</li>
            <li>Manager of the year</li>
          </ul>
        </v-col>
      </v-row>
    </v-container>
  </div>
</template>

<script>
import { Component, Vue } from 'vue-property-decorator';

@Component
export default class EndOfSeason extends Vue {
  // after end of season, check if the Year is alos over (that is, all the seasons are finished...)
  // then go to End Of Year...

    get season_id() {
    return this.$route.params.season_id;
  }

  mounted() {
    console.log('Ending Season now...');

    this.$axios
      .get(`/seasons/${this.season_id}/end`)
      .then(response => {
        console.log(response.data);

        // after this is done, route to the Season finishing page.

        // if season is just over, go to  Season finishing page,

        // The season could already be over... so maybe save the rundown that you generate
        // initially and send it back...
  
      })
      .catch(response => {
        console.log('Error playing match => ', response);
      });
  }

}
</script>

<style></style>
