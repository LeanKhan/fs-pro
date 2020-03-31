<template>
  <div>
    <v-form @submit.prevent="submit">
      <v-card>
        <v-toolbar flat color="primary">
          <v-toolbar-title>
            {{ isUpdate ? 'Update Season' : 'Create Season' }}
          </v-toolbar-title>
        </v-toolbar>

        <v-container>
          <v-row>
            <v-col cols="6">
              <v-text-field label="Title" v-model="form.Title"></v-text-field>
            </v-col>

            <v-col cols="6">
              <v-text-field
                label="Start Date"
                v-model="form.StartDate"
              ></v-text-field>
            </v-col>
          </v-row>
        </v-container>

        <v-divider></v-divider>

        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn @click="submit" :color="`${isUpdate ? 'warning' : 'success'}`">
            {{ isUpdate ? 'Update' : 'Create Season' }}
          </v-btn>

          <v-btn v-if="isUpdate" @click="deleteSeason" color="danger">
            Remove
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-form>
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';

@Component
export default class SeasonsForm extends Vue {
  @Prop({ required: false }) readonly isUpdate!: boolean;
  private season: {} = {};

  private openClubModal = false;

  private form: any = {
    Title: '',
    StartDate: '',
  };

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
}
</script>

<style></style>
