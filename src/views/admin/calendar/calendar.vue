<template>
  <div>
    <v-card>
      <v-card-title>New Calendar...</v-card-title>
      <v-card-text>
        <v-row>
          <v-col cols="6">
            <v-select
              label="Month"
              :items="months"
              v-model="month"
              hint="Month for new calendar year..."
            ></v-select>
          </v-col>
          <v-col cols="6">
            <v-input readonly value="2020"></v-input>
          </v-col>
        </v-row>
      </v-card-text>

      <v-snackbar color="success" v-model="success">
        success!
      </v-snackbar>
    </v-card>
  </div>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';

@Component
export default class Calendar extends Vue {
  private month = '';

  private success = false;

  private 'competitions' = [
    {
      id: '5e836ada3a4ecf2a083ca9aa',
      code: 'EFL',
      division: 'first',
      type: 'league',
    },
    {
      id: '5ede1b8528320509bcb601da',
      code: 'EBSL',
      division: 'second',
      type: 'league',
    },
  ];

  private create() {
    this.$axios
      .post('/calendar/new?month=JUN&year=2020', { ...this.competitions })
      .then(response => {
        console.log('Response => ', response);
      })
      .catch(response => {
        console.log('Response => ', response);
      });
  }
}
</script>
