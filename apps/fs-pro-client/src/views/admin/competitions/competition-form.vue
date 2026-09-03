<template>
  <div>
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
                @update:model-value="typeChanged"
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
                item-title="Name"
                item-value="_id"
                v-model="form.CountryId"
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
                  color="pink-lighten-1"
                  height="100%"
                  width="100%"
                  class="px-3 py-2 text-center"
                  style="white-space: no-wrap"
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
          <v-btn @click="submit" :color="isUpdate ? 'warning' : 'success'">
            {{ isUpdate ? 'Update' : 'Create Competition' }}
          </v-btn>

          <v-btn @click="router.push('/competitions')" color="secondary">
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

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useStore } from '@/store';
import { client } from '@/services/api';
import ClubList from '@/components/clubs/club-list.vue';
import ClubsTable from '@/components/clubs/clubs-table.vue';
import type { Competition } from '@repo/api-contract';

const props = defineProps<{
  isUpdate?: boolean;
}>();

const router = useRouter();
const route = useRoute();
const store = useStore();

const competition = ref<any>({});
const types = ['League', 'Cup', 'Tournament'];
const divisions = [1, 2, 3, 4, 0];
const openClubModal = ref(false);

const form = ref<any>({
  Name: '',
  Type: '',
  CompetitionCode: '',
  NumberOfTeams: '',
  NumberOfWeeks: '',
  TeamsPromoted: '',
  TeamsRelegated: '',
  CountryId: null,
  League: false,
  Cup: false,
  Tournament: false,
  Division: null,
});

const countries = computed(() => store.countries);

function typeChanged(type: string) {
  switch (type) {
    case 'league':
      form.value.League = true;
      form.value.Cup = false;
      form.value.Tournament = false;
      break;
    case 'cup':
      form.value.Cup = true;
      form.value.League = false;
      form.value.Tournament = false;
      break;
    case 'tournament':
      form.value.Tournament = true;
      form.value.League = false;
      form.value.Cup = false;
      break;
  }
}

async function submit() {
  const competitionID = String(route.params.id);

  try {
    let id: string;
    let code: string;
    if (props.isUpdate) {
      await client.competitions.updateCompetition.mutation({
        params: { id: competitionID },
        body: form.value,
      });
      // The Mongoose-era `_doc` unwrap and `route.params._id`/
      // `CompetitionCode` this used to read never matched this route's
      // actual `:id`/`:code` params (see deleteCompetition below, which
      // already used the right ones) - navigation after update/create was
      // silently broken. Fixed to use the real param names / response shape.
      id = competitionID;
      code = String(route.params.code);
    } else {
      const response = await client.competitions.createCompetition.mutation({
        body: form.value,
      });
      if (response.status !== 200) {
        throw new Error(response.body.message);
      }
      id = response.body.payload._id ?? '';
      code = response.body.payload.CompetitionCode;
    }
    router.push({ name: 'View Competition', params: { id, code } });
  } catch (error) {
    console.error('Error submitting competition:', error);
  }
}

function closeModal(event: any) {
  openClubModal.value = false;
  if (event) {
    const competitionID = String(route.params.id);

    client.competitions.addClubToCompetition
      .mutation({
        params: { id: competitionID },
        body: { clubId: event.id },
      })
      .then((response) => {
        console.log('Successfully added club to competition:', response);
      })
      .catch((error) => {
        console.error('Error adding club:', error);
      });
  }
}

async function deleteCompetition() {
  const answer = confirm(
    'Are you sure you want to delete ' + form.value.Name + '?!!'
  );

  if (answer) {
    const competitionID = String(route.params.id);
    try {
      await client.competitions.deleteCompetition.mutation({
        params: { id: competitionID },
      });
      router.push('/a/competitions');
    } catch (error) {
      console.error('Error deleting competition:', error);
    }
  }
}

onMounted(async () => {
  if (props.isUpdate) {
    const competitionID = String(route.params.id);
    try {
      const response = await client.competitions.getCompetition.query({
        params: { id: competitionID },
        query: { populate: 'false' },
      });
      if (response.status === 200) {
        competition.value = response.body.payload as Competition;
        form.value = response.body.payload;
      }
    } catch (error) {
      console.error('Error fetching competition:', error);
    }
  }
});
</script>
