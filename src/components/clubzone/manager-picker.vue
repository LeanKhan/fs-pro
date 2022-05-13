<template>
  <v-dialog
    :value="show"
    @input="$emit('update:show', $event)"
    width="700"
    persistent
  >
    <v-card class="pa-0" :loading="loading">
      <v-card-title class="headline cyan darken-2" primary-title>
        Hire a new Manager
        <v-spacer></v-spacer>
        <v-btn small icon @click="close">
          <v-icon small>mdi-close</v-icon>
        </v-btn>
      </v-card-title>
      <v-card-text>
        <v-row dense no-gutters>
          <v-col dense cols="6">
            <v-card flat tile v-if="selectedManager" class="pa-0">
              <!-- <v-img></v-img> -->
              <v-card-title class="subtitle">
                {{ selectedManager.FirstName }} {{ selectedManager.LastName }}
              </v-card-title>
              <v-list flat dense>
                <v-list-item>
                  <strong>
                    <v-icon>mdi-globe</v-icon>
                    Nationality: &nbsp;
                  </strong>
                  {{ selectedManager.Nationality ? selectedManager.Nationality.Name : '-' }}
                </v-list-item>
                <v-list-item>
                  <strong>
                    <v-icon>mdi-number</v-icon>
                    Age:
                  </strong>
                  47
                </v-list-item>
                <v-list-item>
                  <strong>
                    <v-icon>mdi-trophy</v-icon>
                    Titles:
                  </strong>
                  12
                </v-list-item>
              </v-list>
            </v-card>
            <v-sheet v-else height="100">
              Select a manager to hire!
            </v-sheet>
          </v-col>

          <v-col cols="6">
            <v-list dense max-height="400px" flat>
              <v-list-item-group v-model="managerModel" color="cyan darken-1">
                <v-list-item v-for="(m, i) in managers" :key="i">
                  <v-list-item-avatar size="30px" color="yellow">
                    <span>
                      {{ m.FirstName.charAt(0) + m.LastName.charAt(0) }}
                    </span>
                  </v-list-item-avatar>
                  <v-list-item-content>
                    <v-list-item-title>
                      {{ m.FirstName }}
                      {{ m.LastName }}
                    </v-list-item-title>
                    <!-- <v-list-item-subtitle>
                      <strong>12</strong>
                      Titles |
                      <strong>2</strong>
                      Clubs |
                      <strong>47</strong>
                      Years Old |
                    </v-list-item-subtitle> -->
                  </v-list-item-content>
                </v-list-item>
              </v-list-item-group>
            </v-list>
          </v-col>

          <v-col cols="12">
            <v-text-field
              color="cyan darken-1"
              label="Details"
              v-model="form.details"
              hint="The press release for the Manager's appointment"
            ></v-text-field>
          </v-col>
        </v-row>
      </v-card-text>

      <v-card-actions>
        <v-btn @click="hireManager" :loading="loading" :disabled="loading">
          Hire
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
// import { apiUrl } from '@/store';

@Component({})
export default class ManagerPicker extends Vue {
  @Prop({ required: true }) show!: any;
  @Prop({ required: true }) club!: string;

  private managerModel = 0;
  private managers: any = [];
  private loading = false;

  private form = {
    details: '',
  };

  get selectedManager() {
    return this.managers[this.managerModel];
  }

  private close() {
    this.$emit('update:show', false);
  }

  //  @Watch('selectedManager')
  // onTabChanged(val: number) {
  //   console.log('Tab Changed! =>', val);
  // }

  private hireManager() {
    this.loading = true;
    this.$axios
      .put(`/clubs/${this.club}/manager`, {
        ...this.form,
        manager: this.selectedManager._id,
      })
      .then(() => {
        console.log('Club Mangager appointed successfully!');
        this.$emit('update:show', false);
        this.$emit('update-available');
      })
      .catch(err => {
        console.log('Error adding manager', err);
      })
      .finally(() => {
        this.loading = false;
      });
  }

  public mounted() {
  const query = JSON.stringify({isEmployed: false});
    this.$axios
      .get(`/managers?options=${query}&populate=Club`)
      .then(res => {
        this.managers = res.data.payload;
      })
      .catch(err => {
        console.log('Error! => ', err);
      });
  }
  }
</script>
