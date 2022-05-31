<template>
  <v-card>
    <v-card-title>
      Clubs
      <v-spacer></v-spacer>

      <v-text-field
        v-model="search"
        append-icon="mdi-magnify"
        label="Search"
        color="amber darken-1"
        single-line
        hide-details
        clearable
      ></v-text-field>
    </v-card-title>

    <v-data-table
      :headers="headers"
      :items="clubs"
      item-key="ClubCode"
      :search="search"
      :loading="!clubs.length > 0"
      loading-text="Fetching Clubs..."
      no-data-text="No Clubs"
      class="elevation-1"
    >
      <template v-slot:item.Name="{ item }">
        <v-list-item>
          <v-list-item-avatar>
            <v-img
              :src="`${apiUrl}/img/clubs/logos/${item.ClubCode}.png`"
              width="40px"
            ></v-img>
          </v-list-item-avatar>
          <v-list-item-content>
            <v-list-item-title v-text="item.Name"></v-list-item-title>
          </v-list-item-content>
        </v-list-item>
      </template>

      <template v-slot:item.Manager="{ item }">
        <template v-if="item.Manager && item.Manager.FirstName">
          {{ item.Manager.FirstName.charAt(0) }} {{ item.Manager.LastName }}
        </template>

        <template v-else>
          No Manager :/
        </template>
      </template>

      <template v-slot:item.Address="{ item }">
        {{ item.Address.City }}, {{ item.Address.Country.Name }}
      </template>

      <template v-slot:item.Stadium="{ item }">
        {{ item.Stadium.Name }}
      </template>

      <template v-slot:item.Players="{ item }">
        {{ item.Players.length }}
      </template>

      <template v-slot:item.Actions="{ item }">
        <v-btn text icon title="View Club" color="success lighten-2">
          <v-icon small @click="viewClub(item._id, item.ClubCode)">
            mdi-eye
          </v-icon>
        </v-btn>
        <v-btn text icon title="Update Club" color="blue lighten-2">
          <v-icon small @click="updateClub(item._id, item.ClubCode)">
            mdi-pencil
          </v-icon>
        </v-btn>
      </template>
    </v-data-table>
  </v-card>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import { Club } from '@/interfaces/club';

@Component({})
export default class AllClubsTable extends Vue {
  @Prop({ required: true }) readonly clubs!: Club;

  // TODO: searches should be navigable. change url
  private search = '';

  get apiUrl() {
    return this.$store.getters.apiUrl;
  }

  private headers: any[] = [
    {
      text: 'Name',
      align: 'start',
      value: 'Name',
    },
    { text: 'Address', value: 'Address', filterable: true, sortable: true },
    { text: 'Manager', value: 'Manager', filterable: true, sortable: false },
    { text: 'Stadium', value: 'Stadium', filterable: true, sortable: false },
    { text: 'League', value: 'LeagueCode', filterable: true, sortable: true },
    { text: 'Players', value: 'Players', filterable: true, sortable: false },
    { text: 'Actions', value: 'Actions', filterable: false, sortable: false },
  ];

  private updateClub(clubId: string, clubCode: string): void {
    this.$router.push({
      name: 'Update Club',
      params: { id: clubId, code: clubCode },
    });
  }

  private viewClub(clubId: string, clubCode: string): void {
    this.$router.push({
      name: 'View Club',
      params: { id: clubId, code: clubCode },
    });
  }
}
</script>

<style></style>
