<template>
  <div>
    <!-- Inset form here!  -->
    <v-row>
      <v-col cols="12">
        <v-card>
          <v-toolbar flat color="cyan darken-2">
            <v-btn icon @click="goBack">
              <v-icon>
                mdi-arrow-left
              </v-icon>
            </v-btn>

            <v-toolbar-title class="ml-1">
              {{ isUpdate ? 'Update Manager' : 'Create Manager' }}
            </v-toolbar-title>
          </v-toolbar>
        </v-card>
      </v-col>
    </v-row>
    <v-form @submit.prevent="submit">
      <v-row>
        <v-col cols="12">
          <v-card>
            <v-container>
              <v-row>
                <v-col cols="6">
                  <v-text-field
                    color="cyan darken-1"
                    label="First Name"
                    v-model="form.FirstName"
                  ></v-text-field>
                </v-col>

                <v-col cols="6">
                  <v-text-field
                    color="cyan darken-1"
                    label="Last Name"
                    v-model="form.LastName"
                  ></v-text-field>
                </v-col>

                <v-col cols="6">
                  <v-select
                    color="cyan darken-1"
                    label="Nationality"
                    :items="countries"
                    item-text="Name"
                    item-value="_id"
                    v-model="form.Nationality"
                  ></v-select>
                </v-col>

                <v-col cols="6">
                  <v-text-field
                    color="cyan darken-1"
                    type="number"
                    min="25"
                    max="70"
                    label="Age"
                    v-model="form.Age"
                  ></v-text-field>
                </v-col>
              </v-row>
            </v-container>

            <v-divider></v-divider>

            <v-card-actions>
              <v-spacer></v-spacer>
              <v-btn
                @click="submit"
                :loading="submitLoading"
                :disabled="submitLoading"
                :color="`${isUpdate ? 'warning' : 'success'}`"
              >
                {{ isUpdate ? 'Update' : 'Create Manager' }}
              </v-btn>

              <v-btn @click="$router.push('../managers')" color="secondary">
                Cancel
              </v-btn>

              <v-btn v-if="isUpdate" @click="deleteManager" color="error">
                Remove
              </v-btn>
            </v-card-actions>
          </v-card>
        </v-col>
      </v-row>
    </v-form>
  </div>
</template>

<script lang="ts">
/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { Component, Vue, Prop } from 'vue-property-decorator';

@Component({})
export default class ManagerForm extends Vue {
  @Prop({ required: false, default: false }) readonly isUpdate!: boolean;

  // TODO: add function to upload pictures of Managers

  private manager: any = {};

  private submitLoading = false;

  private form: any = {
    FirstName: '',
    LastName: '',
    Nationality: '',
    Age: '',
  };

  /** COMPUTED */
  get countries(): string[] {
    return this.$store.getters.countries;
  }

  /** METHODS */
  private submit(): void {
    const managerId = this.$route.params['id'];
    const url = this.isUpdate
      ? `/managers/${managerId}`
      : '/managers?model=manager';

    const method = this.isUpdate ? 'PUT' : 'POST';

    this.submitLoading = true;

    this.$axios
      .request({ url, method, data: { data: this.form } })
      .then(response => {
        console.log('Response => ', response);
        // TODO: show a toast here...
        if (this.isUpdate) {
          this.$router.push({
            name: 'View Manager',
            params: { id: managerId },
          });
        } else {
          this.$router.push({ name: 'Managers Home' });
        }
      })
      .catch(response => {
        console.log('Response => ', response);
        // TODO: also show a toast...
      })
      .finally(() => {
        this.submitLoading = false;
      });
  }

  private goBack() {
    this.$router.back();
  }

  //   private deleteManager() {
  //     const answer = confirm(
  //       'Are you sure you want to delete ' +
  //         this.form.FirstName +
  //         ' ' +
  //         this.form.LastName +
  //         '?!!'
  //     );

  //     if (answer) {
  //       const playerId = this.$route.params['id'];

  //       this.$axios
  //         .delete(`/players/${playerId}`)
  //         .then(response => {
  //           console.log('Successfully deleted Player => ', response);
  //           this.$router.push({ name: 'Players Home' });
  //         })
  //         .catch(response => {
  //           console.log('Error deleting Player =>', response.data);
  //         });
  //     }
  //   }

  private mounted(): void {
    if (this.isUpdate) {
      const managerId = this.$route.params['id'];
      // const clubCode = this.$route.params['code'];
      this.$axios
        .get(`/managers/${managerId}`)
        .then(response => {
          this.manager = response.data.payload;
          this.form = response.data.payload;
        })
        .catch(response => {
          console.log('Response => ', response);
        });
    }
  }
}
</script>

<style></style>
