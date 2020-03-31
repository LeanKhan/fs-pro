<template>
  <v-card>
    <v-card-title>
      Seasons
      <v-spacer></v-spacer>
      <v-btn append-icon="mdi-plus" color="success">
        Add
      </v-btn>
    </v-card-title>

    <v-data-table
      :headers="headers"
      :items="seasons"
      :search="search"
      loading-text="Fetching Seasons..."
      no-data-text="No Seasons here, click add to create one"
      class="elevation-1"
    >
      <template v-slot:item.Actions="{ item }">
        <v-btn text icon color="success lighten-2">
          <v-icon small @click="viewSeason(item)">
            mdi-eye
          </v-icon>
        </v-btn>
        <v-btn text icon color="blue lighten-2">
          <v-icon small @click="editSeason(item)">
            mdi-pencil
          </v-icon>
        </v-btn>
      </template>
    </v-data-table>
  </v-card>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import { Season } from '../../models/season';

@Component({})
export default class SeasonsTable extends Vue {
  @Prop({ required: true }) readonly seasons!: Season;

  private headers: any[] = [
    {
      text: 'ID',
      align: 'start',
      value: 'SeasonID',
    },
    {
      text: 'Code',
      value: 'SeasonCode',
    },
    { text: 'Title', value: 'SeasonTitle' },
    { text: 'Start Date', value: 'StartDate', filterable: true },
    { text: 'End Date', value: 'EndDate', filterable: true },
  ];

  private search = '';
}
</script>

<style></style>
