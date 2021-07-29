<template>
  <div>
    <v-card>
      <v-card-title>
        Manager
      </v-card-title>
      <v-card-text>
        <template v-if="club.Manager && club.Manager.FirstName">
          {{ club.Manager.FirstName }} {{ club.Manager.LastName }}
        </template>
        <template v-else>
          <p>No manager yet. Hire one!</p>
        </template>
      </v-card-text>
      <v-card-actions>
        <v-btn v-if="club.Manager" color="error" @click="fireManager" depressed>
          Fire Manager
        </v-btn>
        <v-btn v-else @click="hireManager" color="info" depressed>
          Hire Manager
        </v-btn>
      </v-card-actions>
    </v-card>

    <manager-picker
      :show.sync="openManagerPicker"
      @update-available="$emit('update-available')"
      :club="club._id"
    ></manager-picker>
    <manager-firer
      :show.sync="openFireManager"
      :manager="club.Manager"
      :club="club._id"
    ></manager-firer>
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import { ManagerPicker, ManagerFirer } from '@/components/clubzone';
@Component({
  components: {
    ManagerPicker,
    ManagerFirer,
  },
})
export default class ClubZone extends Vue {
  @Prop({ required: true }) club!: any;

  private openManagerPicker = false;
  private openFireManager = false;

  private hireManager() {
    // hiring manager, thank you Jesus!
    this.openManagerPicker = !this.openManagerPicker;
  }

  private fireManager() {
    this.openFireManager = !this.openFireManager;
  }

  private refresh() {
    this.$emit('update-available');
  }
}
</script>

<style></style>
