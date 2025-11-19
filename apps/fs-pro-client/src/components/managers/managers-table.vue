<template>
  <v-card>
    <v-card-title>
      Managers
      <v-spacer></v-spacer>
      <v-text-field
        v-model="search"
        append-icon="mdi-magnify"
        color="indigo darken-1"
        label="Search"
        single-line
        hide-details
        :clearable="true"
      ></v-text-field>
      <!--    <v-btn
       
        append-icon="mdi-plus"
        color="success"
        @click="$emit('add-manager')"
      >
        Add
      </v-btn> -->
      <!-- TODO: Add filter for isSigned -->
      <!-- <v-checkbox v-model="isSigned" label="Signed">
        Signed
      </v-checkbox> -->
    </v-card-title>
    <v-data-table
      :headers="headers"
      :items="managers"
      :loading="!managers"
      no-data-text="No Managers fetched"
      no-results-text="No Managers found"
      :search="search"
      loading-text="Fetching Managers..."
      class="elevation-1"
    >
      <!-- Manager's Country -->
      <template v-slot:item.Country="{ item }">
        {{ item.Nationality.Name }}
      </template>

      <!-- Manager's Club Name -->
      <template v-slot:item.Club="{ item }">
        <span :title="item.Club.Name">
          {{ item.Club.ClubCode }}
        </span>
      </template>

      <!-- Players actions -->
      <template v-slot:item.Actions="{ item }">
        <v-btn @click="viewManager(item._id)" icon color="success lighten-2">
          <v-icon small>mdi-eye-outline</v-icon>
        </v-btn>
        <v-btn icon color="blue lighten-2" @click="updateManager(item._id)">
          <v-icon small>mdi-pencil-outline</v-icon>
        </v-btn>
        <!-- remove player -->
        <v-btn @click="deleteManager(item._id)" icon color="red lighten-2">
          <v-icon small>mdi-delete-outline</v-icon>
        </v-btn>
      </template>
    </v-data-table>
  </v-card>
</template>
<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';

interface Props {
  managers: any[];
}

defineProps<Props>();

const emit = defineEmits<{
  'remove-manager': [id: string];
}>();

const router = useRouter();

const search = ref('');
const isEmployed = ref<boolean | null>(null);

const headers = ref<any[]>([
  {
    text: 'First Name',
    align: 'start',
    value: 'FirstName',
  },
  {
    text: 'Last Name',
    value: 'LastName',
  },
  {
    text: 'League',
    value: 'Club.LeagueCode',
  },
  { text: 'Club', value: 'Club' },
  { text: 'Country', value: 'Nationality.Name', filterable: false },
  {
    text: 'Employed',
    value: 'isEmployed',
    sortable: false,
    filter: (value: boolean) => {
      if (!isEmployed.value) return true;
      return value == isEmployed.value;
    },
  },
  { text: 'Actions', value: 'Actions', filterable: false, sortable: false },
]);

const viewManager = (id: string) => {
  router.push({ name: 'View Manager', params: { id } });
};

const updateManager = (id: string) => {
  router.push({ name: 'Update Manager', params: { id } });
};

const deleteManager = (id: string) => {
  emit('remove-manager', id);
};
</script>
<style scoped></style>
