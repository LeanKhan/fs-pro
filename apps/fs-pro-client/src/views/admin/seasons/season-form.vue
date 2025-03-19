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
import { $axios } from '@/main';

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
  console.log('Delete Season function not implmeneted??')
}

async function submit() {
  const Competition = route.params.id;
  const CompetitionCode = route.params.code;

  const url = props.isUpdate
    ? `/${Competition}/seasons/update/`
    : '/seasons?model=season';

  try {
    const response = await $axios.post(url, { 
      data: { 
        ...form.value, 
        CompetitionCode, 
        Competition 
      } 
    });
    
    console.log('Response => ', response.data.payload);
    router.push({
      name: 'View Competition',
      params: { Competition, CompetitionCode },
    });
  } catch (error) {
    console.error('Error submitting season:', error);
  }
}
</script>