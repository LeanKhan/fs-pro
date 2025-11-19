<template>
  <div>
    <v-row>
      <v-col cols="12">
        <v-card>
          <v-toolbar flat color="amber darken-1">
            <v-btn icon @click="goBack">
              <v-icon>mdi-arrow-left</v-icon>
            </v-btn>
            <v-toolbar-title class="ml-1">
              {{ isUpdate ? 'Update Club' : 'Create Club' }}
            </v-toolbar-title>
          </v-toolbar>
        </v-card>
      </v-col>
    </v-row>

    <v-row>
      <v-col cols="3">
        <image-uploader
          v-if="form.ClubCode"
          v-bind:card="{
            title: 'Upload Club Logo',
            class: 'mb-3',
            height: 'auto',
          }"
          v-bind:cardSheet="{ height: 'auto' }"
          v-bind:previewImage="{
            src: isUpdate ? `${api}/img/clubs/logos/${form.ClubCode}.png` : '',
            contain: true,
          }"
          :fileName="form.ClubCode"
          :filePath="'/clubs/logos/'"
        ></image-uploader>

        <image-uploader
          v-if="form.ClubCode"
          v-bind:card="{ title: 'Upload Club Kit', height: 400 }"
          v-bind:cardSheet="{ height: 400 }"
          v-bind:previewImage="{
            src: isUpdate
              ? `${api}/img/clubs/kits/${form.ClubCode}-kit.png`
              : '',
            contain: true,
          }"
          :fileName="`${form.ClubCode}-kit`"
          :filePath="'/clubs/kits/'"
        ></image-uploader>
      </v-col>

      <v-col cols="9">
        <v-form @submit.prevent="submit">
          <v-card>
            <v-container>
              <v-row>
                <v-col cols="6">
                  <v-text-field
                    color="amber darken-1"
                    label="Name"
                    v-model="form.Name"
                  ></v-text-field>
                </v-col>

                <v-col cols="6">
                  <v-text-field
                    color="amber darken-1"
                    label="Code"
                    v-model="form.ClubCode"
                  ></v-text-field>
                </v-col>

                <v-col cols="6">
                  <div class="subtitle-1">Stadium</div>
                  <div class="d-flex flex-column">
                    <v-text-field
                      color="amber darken-1"
                      label="Name"
                      v-model="form.Stadium.Name"
                    ></v-text-field>

                    <v-text-field
                      color="amber darken-1"
                      label="Capacity"
                      v-model="form.Stadium.Capacity"
                    ></v-text-field>

                    <v-text-field
                      color="amber darken-1"
                      label="Location"
                      v-model="form.Stadium.Location"
                    ></v-text-field>
                  </div>
                </v-col>

                <v-col class="px-2" cols="6">
                  <div class="subtitle-1">Address</div>
                  <div class="d-flex flex-column">
                    <v-text-field
                      color="amber darken-1"
                      label="Section"
                      v-model="form.Address.Section"
                    ></v-text-field>

                    <v-text-field
                      color="amber darken-1"
                      label="City"
                      v-model="form.Address.City"
                    ></v-text-field>

                    <v-select
                      color="amber darken-1"
                      label="Country"
                      :items="countries"
                      item-text="Name"
                      item-value="_id"
                      v-model="form.Address.Country"
                    ></v-select>
                  </div>
                </v-col>
              </v-row>
            </v-container>

            <v-divider></v-divider>

            <v-card-actions>
              <v-spacer></v-spacer>
              <v-btn @click="submit" :color="isUpdate ? 'warning' : 'success'">
                {{ isUpdate ? 'Update' : 'Create Club' }}
              </v-btn>

              <v-btn @click="router.push('../clubs')" color="secondary">
                Cancel
              </v-btn>

              <v-btn v-if="isUpdate" @click="deleteClub" color="error">
                Remove
              </v-btn>
            </v-card-actions>
          </v-card>
        </v-form>
      </v-col>
    </v-row>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { apiUrl, useStore } from '@/store';
import { $axios } from '@/main';
import ImageUploader from '@/components/helpers/image-uploader.vue';
import type { Club } from '@/interfaces/club';

const props = defineProps<{
  isUpdate?: boolean;
}>();

const router = useRouter();
const route = useRoute();
const store = useStore();

const club = ref<Club>({} as Club);
const api = apiUrl;
const countries = computed<any[]>(() => store.countries);

const form = ref({
  Name: '',
  ClubCode: '',
  Manager: '',
  Address: {
    Section: '',
    City: '',
    Country: '',
  },
  Stadium: {
    Name: '',
    Capacity: '',
    Location: '',
  },
});

function goBack() {
  router.back();
}

async function submit() {
  const clubID = route.params.id;
  const url = props.isUpdate ? `/clubs/${clubID}/update` : '/clubs/new';

  try {
    const response = await $axios.post(url, { data: form.value });
    router.push({ name: 'Clubs Home' });
  } catch (error) {
    console.error('Error submitting club:', error);
  }
}

async function deleteClub() {
  const answer = confirm(
    'Are you sure you want to delete ' + form.value.Name + '?!!'
  );

  if (answer) {
    const clubID = route.params.id;
    try {
      await $axios.delete(`/clubs/${clubID}`);
      router.push({ name: 'Clubs Home' });
    } catch (error) {
      console.error('Error deleting club:', error);
    }
  }
}

onMounted(async () => {
  if (props.isUpdate) {
    const clubID = route.params.id;
    try {
      const response = await $axios.get(`/clubs/${clubID}`);
      club.value = response.data.payload;
      form.value = response.data.payload;
    } catch (error) {
      console.error('Error fetching club:', error);
    }
  }
});
</script>
