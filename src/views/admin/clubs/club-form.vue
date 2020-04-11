<template>
  <div>
    <!-- Inset form here!  -->
    <v-row>
      <v-col cols="12">
        <v-card>
          <v-toolbar flat color="amber darken-1">
            <v-btn icon @click="goBack">
              <v-icon>
                mdi-arrow-left
              </v-icon>
            </v-btn>

            <v-toolbar-title class="ml-1">
              {{ isUpdate ? 'Update Club' : 'Create Club' }}
            </v-toolbar-title>
          </v-toolbar>
        </v-card>
      </v-col>
    </v-row>
    <v-form @submit.prevent="submit">
      <v-card>
        <!-- <v-toolbar flat color="amber darken-1">
          <v-toolbar-title>
            Create Club
          </v-toolbar-title>
        </v-toolbar> -->

        <v-container>
          <v-row>
            <v-col cols="6">
              <v-text-field
                color="amber darken-1"
                label="Name"
                v-model="form.Name"
              ></v-text-field>
            </v-col>

            <v-col cols="6">
              <v-text-field
                color="amber darken-1"
                label="Code"
                v-model="form.ClubCode"
              ></v-text-field>
            </v-col>

            <v-col cols="6">
              <v-text-field
                color="amber darken-1"
                label="Manager"
                v-model="form.Manager"
              ></v-text-field>
              <div class="subtitle-1">Stadium</div>
              <div class="d-flex flex-column">
                <v-text-field
                  color="amber darken-1"
                  label="Name"
                  v-model="form.Stadium.Name"
                ></v-text-field>

                <v-text-field
                  color="amber darken-1"
                  label="Capacity"
                  v-model="form.Stadium.Capacity"
                ></v-text-field>

                <v-text-field
                  color="amber darken-1"
                  label="Location"
                  v-model="form.Stadium.Location"
                ></v-text-field>
              </div>
            </v-col>

            <v-col class="px-2" cols="6">
              <div class="subtitle-1">Address</div>
              <div class="d-flex flex-column">
                <v-text-field
                  color="amber darken-1"
                  label="Section"
                  v-model="form.Address.Section"
                ></v-text-field>

                <v-text-field
                  color="amber darken-1"
                  label="City"
                  v-model="form.Address.City"
                ></v-text-field>

                <v-select
                  color="amber darken-1"
                  label="Country"
                  :items="countries"
                  v-model="form.Address.Country"
                ></v-select>
              </div>
            </v-col>
          </v-row>
        </v-container>

        <v-divider></v-divider>

        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn @click="submit" :color="`${isUpdate ? 'warning' : 'success'}`">
            {{ isUpdate ? 'Update' : 'Create Club' }}
          </v-btn>

          <v-btn @click="$router.push('../clubs')" color="secondary">
            Cancel
          </v-btn>

          <v-btn v-if="isUpdate" @click="deleteClub" color="error">
            Remove
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-form>
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import { Club } from '@/models/club';

@Component({})
export default class ClubForm extends Vue {
  @Prop({ required: false }) readonly isUpdate!: boolean;
  private club: {} = {};

  private form: any = {
    Name: '',
    ClubCode: '',
    Manager: '',
    Address: {
      Section: '',
      City: '',
      Country: '',
    },
    Stadium: {
      Name: '',
      Capacity: '',
      Location: '',
    },
  };

  // TODO: upload files to server!

  public countries: string[] = [
    'Ashter',
    'Bellean',
    'UPP',
    'Kiyoto',
    'Ekhastan',
  ];

  private mounted(): void {
    if (this.isUpdate) {
      const clubID = this.$route.params['id'];
      // const clubCode = this.$route.params['code'];
      this.$axios
        .get(`/clubs/${clubID}`)
        .then(response => {
          this.club = response.data.payload as Club;
          this.form = response.data.payload as Club;
        })
        .catch(response => {
          console.log('Response => ', response);
        });
    }
  }

  private submit(): void {
    const clubID = this.$route.params['id'];

    const url = this.isUpdate ? `/clubs/${clubID}/update` : '/clubs/new';

    this.$axios
      .post(url, { data: this.form })
      .then(response => {
        console.log('Response => ', response);
        this.$router.push({ name: 'Clubs Home' });
      })
      .catch(response => {
        console.log('Response => ', response);
      });
  }

  private goBack() {
    this.$router.back();
  }

  private deleteClub() {
    const answer = confirm(
      'Are you sure you want to delete ' + this.form.Name + '?!!'
    );

    if (answer) {
      const clubID = this.$route.params['id'];

      this.$axios
        .delete(`/clubs/${clubID}`)
        .then(response => {
          console.log('Successfully deleted Club => ', response);
          this.$router.push({ name: 'Clubs Home' });
        })
        .catch(response => {
          console.log('Error deleting comp =>', response.data);
        });
    }
  }
}
</script>

<style></style>
