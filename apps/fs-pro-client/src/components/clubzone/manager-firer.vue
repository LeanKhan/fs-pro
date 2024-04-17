<template>
  <v-dialog :value="show" @input="$emit('update:show', $event)" width="700">
    <v-card class="pa-0">
      <v-card-title class="headline grey lighten-2" primary-title>
        Relieve Manager
      </v-card-title>
      <v-card-text>
        <v-row no-gutters>
          <v-col cols="12">
            <v-card flat tile>
              <v-img></v-img>
              <v-card-title>
                {{ manager.FirstName }} {{ manager.LastName }}
              </v-card-title>
              <v-list flat dense>
                <v-list-item>
                  <strong>
                    <v-icon>mdi-globe</v-icon>
                    Nationality:
                  </strong>
                  {{ manager.Nationality ? manager.Nationality.Name : '-' }}
                </v-list-item>
                <v-list-item>
                  <strong>
                    <v-icon>mdi-number</v-icon>
                    Age:
                  </strong>
                  {{ manager.Age }}
                </v-list-item>
              </v-list>

              <v-card-text>
                <v-textarea
                  label="Details on Manager leaving"
                  hint="Details about this manager's leaving"
                  v-model="reason"
                  placeholder="Why is he leaving?"
                  id="reason"
                ></v-textarea>
              </v-card-text>

              <v-card-actions>
                <v-btn
                  @click="fireManager"
                  :loading="loading"
                  :disabled="loading"
                >
                  Fire
                </v-btn>
              </v-card-actions>
            </v-card>
          </v-col>
        </v-row>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
// import { apiUrl } from '@/store';

@Component({})
export default class ManagerFire extends Vue {
  @Prop({ required: true }) show!: any;
  @Prop({ required: true }) manager!: any;
  @Prop({ required: true }) club!: string;

  private loading = false;

  private reason = '';

  private fireManager() {
    this.loading = true;
    this.$axios
      .delete(
        `/clubs/${this.club}/manager?reason=${JSON.stringify(this.reason)}`
      )
      .then(() => {
        this.$router.push('..');
      })
      .catch(err => {
        console.log('Error! => ', err);
      })
      .finally(() => {
        this.loading = false;
      });
  }

  //   public mounted() {
  //     this.$axios
  //       .get('/manager/id')
  //       .then(res => {
  //         this.manager = res.data.payload;
  //       })
  //       .catch(err => {
  //         console.log('Error! => ', err);
  //       });
  //   }
}
</script>
