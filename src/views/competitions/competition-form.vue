<template>
  <div>
    <!-- Inset form here!  -->
    <v-dialog v-model="openClubModal" persistent max-width="800px">
      <clubs-table @close-club-modal="closeModal"></clubs-table>
    </v-dialog>
    <v-form @submit.prevent="submit">
      <v-card>
        <v-toolbar flat color="primary">
          <v-toolbar-title>
            Edit Competition
          </v-toolbar-title>
        </v-toolbar>

        <v-container>
          <v-row>
            <v-col cols="6">
              <v-text-field label="Name" v-model="form.Name"></v-text-field>
            </v-col>

            <v-col cols="6">
              <v-text-field
                label="Code"
                v-model="form.CompetitionCode"
              ></v-text-field>
            </v-col>

            <v-col cols="6">
              <v-radio-group label="Type" v-model="form.Type">
                <v-radio
                  v-for="(type, i) in types"
                  :key="i"
                  :label="type"
                  :value="type"
                ></v-radio>
              </v-radio-group>
            </v-col>

            <v-col cols="6">
              <v-select
                label="Country"
                :items="countries"
                v-model="form.Country"
              ></v-select>
            </v-col>

            <v-col cols="6">
              <v-text-field
                required
                type="number"
                label="Number of Teams"
                max="40"
                min="1"
                v-model="form.NumberOfTeams"
              ></v-text-field>
            </v-col>

            <v-col cols="6">
              <v-text-field
                required
                type="number"
                max="40"
                min="1"
                label="Number of Weeks"
                v-model="form.NumberOfWeeks"
              ></v-text-field>
            </v-col>

            <v-col cols="6">
              <club-list
                @open-club-modal="openClubModal = true"
                :clubs="competition.Clubs"
                :actions="true"
              ></club-list>
            </v-col>
          </v-row>
        </v-container>

        <v-divider></v-divider>

        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn @click="submit" :color="`${isUpdate ? 'warning' : 'success'}`">
            {{ isUpdate ? 'Update' : 'Create Competition' }}
          </v-btn>

          <v-btn @click="$router.push('/competitions')" color="secondary">
            Cancel
          </v-btn>

          <v-btn v-if="isUpdate" @click="deleteCompetition" color="error">
            Remove
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-form>
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import { Competition } from '../../models/competition';
import ClubList from '@/components/clubs/club-list.vue';
import ClubsTable from '@/components/clubs/clubs-table.vue';

@Component({
  components: {
    ClubList,
    ClubsTable,
  },
})
export default class ComponentForm extends Vue {
  @Prop({ required: false }) readonly isUpdate!: boolean;
  private competition: {} = {};
  private types = ['League', 'Cup', 'Tournament'];

  private openClubModal = false;

  private form: any = {
    Name: '',
    Type: '',
    CompetitionCode: '',
    NumberOfTeams: '',
    NumberOfWeeks: '',
    Country: '',
    League: false,
    Cup: false,
    Tournament: false,
    Clubs: [],
    Seasons: [],
  };

  public countries: string[] = [
    'Ashter',
    'Bellean',
    'UPP',
    'Kiyoto',
    'Ekhastan',
  ];

  private mounted(): void {
    if (this.isUpdate) {
      const competitionID = this.$route.params['id'];
      // const competitionCode = this.$route.params['code'];

      this.$axios
        .get(`/competitions/${competitionID}`)
        .then(response => {
          this.competition = response.data.payload._doc as Competition;
          this.form = response.data.payload._doc as Competition;
        })
        .catch(response => {
          console.log('Response => ', response);
        });
    }
  }

  private submit(): void {
    const competitionID = this.$route.params['id'];

    const url = this.isUpdate
      ? `/competitions/update/${competitionID}`
      : '/competitions/new?model=competition';

    this.$axios
      .post(url, { data: this.form })
      .then(response => {
        console.log('Response => ', response);
        this.$router.push('/competitions');
      })
      .catch(response => {
        console.log('Response => ', response);
      });
  }

  public closeModal(event: any): void {
    this.openClubModal = false;
    if (event) {
      const competitionID = this.$route.params['id'];
      const compCode = this.$route.params['code'].toUpperCase();

      this.$axios
        .post(`/competitions/${competitionID}/add-club`, {
          clubId: event.id,
          leagueCode: compCode,
        })
        .then(response => {
          console.log('Successfully added club to competition => ', response);
          // this.$router.push('/competitions');
        })
        .catch(response => {
          console.log('Error deleting comp =>', response.data);
        });
    }
  }

  private deleteCompetition() {
    const answer = confirm(
      'Are you sure you want to delete ' + this.form.Name + '?!!'
    );

    if (answer) {
      const competitionID = this.$route.params['id'];

      this.$axios
        .delete(`/competitions/${competitionID}`)
        .then(response => {
          console.log('Successfully deleted competition => ', response);
          this.$router.push('/competitions');
        })
        .catch(response => {
          console.log('Error deleting comp =>', response.data);
        });
    }
  }
}
</script>

<style></style>
