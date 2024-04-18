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
            {{ isUpdate ? 'Update' : 'Create' }} Competition
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
              <v-radio-group
                label="Type"
                v-model="form.Type"
                @change="typeChanged"
              >
                <v-radio
                  v-for="(type, i) in types"
                  :key="i"
                  :label="type"
                  :value="type.toLowerCase()"
                ></v-radio>
              </v-radio-group>
            </v-col>

            <v-col cols="6">
              <v-select
                label="Country"
                :items="countries"
                item-text="Name"
                item-value="_id"
                v-model="form.Country"
              ></v-select>
            </v-col>

            <v-col cols="6">
              <v-select
                label="Division"
                :items="divisions"
                v-model="form.Division"
                hint="Whether it's in the first division and so on..."
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

            <v-col cols="6" v-if="form.Division != 1">
              <v-text-field
                required
                type="number"
                label="TeamsPromoted"
                max="5"
                min="0"
                v-model="form.TeamsPromoted"
              ></v-text-field>
            </v-col>

            <v-col cols="6">
              <v-text-field
                required
                type="number"
                label="TeamsRelegated"
                max="5"
                min="0"
                v-model="form.TeamsRelegated"
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
                v-if="isUpdate"
                @open-club-modal="openClubModal = true"
                :clubs="competition.Clubs"
                :actions="true"
              ></club-list>

              <v-card v-else>
                <v-sheet
                  color="pink lighten-1"
                  height="100%"
                  width="100%"
                  class="px-3 py-2 text-center"
                  style="white-spaces: no-wrap"
                >
                  <div>
                    For now you can only add clubs to this competition after
                    creating it. Create the competition then update it :)
                  </div>
                </v-sheet>
              </v-card>
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
import { Competition } from '@/interfaces/competition';
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
  private divisions = [1, 2, 3, 4, 0];

  private openClubModal = false;

  private form: any = {
    Name: '',
    Type: '',
    CompetitionCode: '',
    NumberOfTeams: '',
    NumberOfWeeks: '',
    TeamsPromoted: '',
    TeamsRelegated: '',
    Country: '',
    League: false,
    Cup: false,
    Tournament: false,
    Division: '',
    Clubs: [],
    Seasons: [],
  };

  get countries(): string[] {
    return this.$store.getters.countries;
  }

  private mounted(): void {
    if (this.isUpdate) {
      const competitionID = this.$route.params['id'];
      // const competitionCode = this.$route.params['code'];

      this.$axios
        .get(`/competitions/${competitionID}?populate=false`)
        .then((response) => {
          this.competition = response.data.payload as Competition;
          this.form = response.data.payload as Competition;
        })
        .catch((response) => {
          console.log('Response => ', response);
        });
    }
  }

  private submit(): void {
    const competitionID = this.$route.params['id'];

    const url = this.isUpdate
      ? `/competitions/${competitionID}/update`
      : '/competitions/new?model=competition';

    this.$axios
      .post(url, { data: this.form })
      .then((response) => {
        console.log('Response => ', response);
        let id = '';
        let code = '';
        if (this.isUpdate) {
          id = this.$route.params._id;
          code = this.$route.params.CompetitionCode;
        } else {
          id = response.data.payload._doc._id;
          code = response.data.payload._doc.CompetitionCode;
        }
        this.$router.push({ name: 'View Competition', params: { id, code } });
      })
      .catch((response) => {
        console.log('Response => ', response);
      });
  }

  public typeChanged(type: string): void {
    switch (type) {
      case 'league':
        this.form.League = true;
        this.form.Cup = false;
        this.form.Tournament = false;
        break;
      case 'cup':
        this.form.Cup = true;
        this.form.League = false;
        this.form.Tournament = false;
        break;
      case 'tournament':
        this.form.Tournament = true;
        this.form.League = false;
        this.form.Cup = false;
        break;
      default:
        break;
    }
  }

  public closeModal(event: any): void {
    // SHIIIT Don't add clubs automatically while creating o! lol
    // TODO: Look into it! Abeg thank you Jesus
    this.openClubModal = false;
    if (event) {
      const competitionID = this.$route.params['id'];
      const compCode = this.$route.params['code'].toUpperCase();

      this.$axios
        .post(`/competitions/${competitionID}/add-club`, {
          clubId: event.id,
          leagueCode: compCode,
        })
        .then((response) => {
          console.log('Successfully added club to competition => ', response);
          // this.$router.push('/competitions');
        })
        .catch((response) => {
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
        .then((response) => {
          console.log('Successfully deleted competition => ', response);
          this.$router.push('/a/competitions');
        })
        .catch((response) => {
          console.log('Error deleting comp =>', response.data);
        });
    }
  }
}
</script>

<style></style>
