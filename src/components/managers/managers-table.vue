<template>
  <v-card>
    <v-card-title>
      Managers
      <v-spacer></v-spacer>
      <v-text-field
        v-model="search"
        append-icon="mdi-magnify"
        color="indigo darken-1"
        label="Search"
        single-line
        hide-details
        :clearable="true"
      ></v-text-field>
      <!--    <v-btn
       
        append-icon="mdi-plus"
        color="success"
        @click="$emit('add-manager')"
      >
        Add
      </v-btn> -->
      <!-- TODO: Add filter for isSigned -->
      <!-- <v-checkbox v-model="isSigned" label="Signed">
        Signed
      </v-checkbox> -->
    </v-card-title>
    <v-data-table
      :headers="headers"
      :items="managers"
      :loading="!managers"
      no-data-text="No Managers fetched"
      no-results-text="No Managers found"
      :search="search"
      loading-text="Fetching Managers..."
      class="elevation-1"
    >
      <!-- Manager's Country -->
      <template v-slot:item.Country="{ item }">
        {{ item.Nationality.Name }}
      </template>

       <!-- Manager's Club Name -->
      <template v-slot:item.Club="{ item }">
      <span :title="item.Club.Name">
        {{ item.Club.ClubCode }}
      </span>
      </template>

      <!-- Players actions -->
      <template v-slot:item.Actions="{ item }">
        <v-btn @click="viewManager(item._id)" icon color="success lighten-2">
          <v-icon small>
            mdi-eye-outline
          </v-icon>
        </v-btn>
        <v-btn icon color="blue lighten-2" @click="updateManager(item._id)">
          <v-icon small>
            mdi-pencil-outline
          </v-icon>
        </v-btn>
        <!-- remove player -->
        <v-btn @click="deleteManager(item._id)" icon color="red lighten-2">
          <v-icon small>
            mdi-delete-outline
          </v-icon>
        </v-btn>
      </template>
    </v-data-table>
  </v-card>
</template>
<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
// import { Player } from '@/interfaces/player';

@Component({})
export default class ManagersTable extends Vue {
  @Prop({ required: true }) readonly managers!: any[];
  //   @Prop({ required: true, default: false }) readonly viewClub!: boolean;

  private headers: any[] = [
    {
      text: 'First Name',
      align: 'start',
      value: 'FirstName',
    },
    {
      text: 'Last Name',
      value: 'LastName',
    },
     {
      text: 'League',
      value: 'Club.LeagueCode',
    },
    { text: 'Club', value: 'Club' },
    { text: 'Country', value: 'Nationality.Name', filterable: false },
    {
      text: 'Employed',
      value: 'isEmployed',
      sortable: false,
      filter: (value: boolean) => {
        if (!this.isEmployed) return true;

        return value == this.isEmployed;
      },
    },
    { text: 'Actions', value: 'Actions', filterable: false, sortable: false },
  ];

  private search = '';

  private isEmployed = null;

  public viewManager(id: string) {
    this.$router.push({ name: 'View Manager', params: { id } });
  }

  public updateManager(id: string) {
    this.$router.push({ name: 'Update Manager', params: { id } });
  }

  public removePlayer(id: string) {
    this.$emit('remove-player', id);
  }
}
</script>
<style scoped></style>
