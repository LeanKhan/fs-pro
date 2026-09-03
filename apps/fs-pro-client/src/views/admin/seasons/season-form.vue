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
              <v-date-picker v-model="form.StartDate"></v-date-picker>
            </v-col>
          </v-row>
        </v-container>

        <v-divider></v-divider>

        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn @click="submit" :color="isUpdate ? 'warning' : 'success'">
            {{ isUpdate ? 'Update' : 'Create Season' }}
          </v-btn>
          <v-btn @click="router.push('/a/competitions')" color="secondary">
            Cancel
          </v-btn>
          <v-btn v-if="isUpdate" @click="deleteSeason" color="error">
            Remove
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-form>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { client } from '@/services/api';

const props = defineProps<{
  isUpdate?: boolean;
}>();

const route = useRoute();
const router = useRouter();

const season = ref({});
const openClubModal = ref(false);
const form = ref({
  Title: '',
  StartDate: '',
});

async function deleteSeason() {
  console.log('Delete Season function not implmeneted??');
}

async function submit() {
  const CompetitionId = String(route.params.id);
  const CompetitionCode = String(route.params.code);

  if (props.isUpdate) {
    // No "Update Season" route is registered anywhere in the router (only
    // "New Season" is), so this branch has never been reachable from the
    // UI - matches deleteSeason() above, a known pre-existing gap rather
    // than something this pass adds.
    console.log('Update Season not implemented');
    return;
  }

  try {
    const response = await client.seasons.createSeason.mutation({
      body: {
        ...form.value,
        CompetitionCode,
        CompetitionId,
      },
    });

    console.log('Response => ', response.body);
    router.push({
      name: 'View Competition',
      params: { id: CompetitionId, code: CompetitionCode },
    });
  } catch (error) {
    console.error('Error submitting season:', error);
  }
}
</script>
