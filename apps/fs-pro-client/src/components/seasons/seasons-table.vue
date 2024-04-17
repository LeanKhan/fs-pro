<template>
  <v-card>
    <v-card-title>
      Seasons
      <v-spacer></v-spacer>
      <v-btn append-icon="mdi-plus" color="success" @click="openSeasonForm">
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
          <v-icon small @click="viewSeason(item._id, item.SeasonCode)">
            mdi-eye
          </v-icon>
        </v-btn>
        <v-btn text icon color="blue lighten-2">
          <v-icon small @click="editSeason(item._id)">
            mdi-pencil
          </v-icon>
        </v-btn>
      </template>
    </v-data-table>
  </v-card>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import { Season } from '@/interfaces/season';

@Component({})
export default class SeasonsTable extends Vue {
  @Prop({ required: true }) readonly seasons!: Season;
  @Prop({ required: true }) readonly competitionId!: string;

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
    { text: 'Title', value: 'Title' },
    { text: 'Start Date', value: 'StartDate', filterable: true },
    { text: 'Actions', value: 'Actions', filterable: false, sortable: false },
  ];

  private search = '';

  private openSeasonForm(): void {
    this.$router.push({
      name: 'New Season',
      params: { compId: this.competitionId },
    });
  }

  private viewSeason(seasonId: string, seasonCode: string): void {
    this.$router.push({
      name: 'View Season',
      params: { compId: this.competitionId, seasonId, seasonCode },
    });
  }
}
</script>

<style></style>
