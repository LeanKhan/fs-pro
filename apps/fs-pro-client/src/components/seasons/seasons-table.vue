<template>
  <v-card>
    <v-card-title>
      Seasons
      <v-spacer></v-spacer>
      <v-btn append-icon="mdi-plus" color="success" @click="openSeasonForm">
        Add
      </v-btn>
    </v-card-title>

    <v-data-table
      :headers="headers"
      :items="seasons"
      :search="search"
      loading-text="Fetching Seasons..."
      no-data-text="No Seasons here, click add to create one"
      class="elevation-1"
    >
      <template v-slot:item.Actions="{ item }">
        <v-btn variant="text" icon color="success-lighten-2">
          <v-icon size="small" @click="viewSeason(item._id, item.SeasonCode)">
            mdi-eye
          </v-icon>
        </v-btn>
        <v-btn variant="text" icon color="blue-lighten-2">
          <v-icon size="small" @click="editSeason(item._id)">mdi-pencil</v-icon>
        </v-btn>
      </template>
    </v-data-table>
  </v-card>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { Season } from '@/interfaces/season';

interface Props {
  seasons: Season[];
  competitionId: string;
}

const props = defineProps<Props>();
const router = useRouter();

const headers = ref<any[]>([
  {
    title: 'ID',
    align: 'start',
    key: 'SeasonID',
  },
  {
    title: 'Code',
    key: 'SeasonCode',
  },
  { title: 'Title', key: 'Title' },
  { title: 'Start Date', key: 'StartDate', filterable: true },
  { title: 'Actions', key: 'Actions', filterable: false, sortable: false },
]);

const search = ref('');

const openSeasonForm = (): void => {
  router.push({
    name: 'New Season',
    params: { compId: props.competitionId },
  });
};

const viewSeason = (seasonId: string, seasonCode: string): void => {
  router.push({
    name: 'View Season',
    params: { compId: props.competitionId, seasonId, seasonCode },
  });
};

const editSeason = (seasonId: string): void => {
  router.push({
    name: 'Edit Season',
    params: { compId: props.competitionId, seasonId },
  });
};
</script>

<style></style>
