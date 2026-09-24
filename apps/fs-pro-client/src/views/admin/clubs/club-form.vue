<template>
  <div>
    <v-row>
      <v-col cols="12">
        <v-card>
          <v-toolbar flat color="amber-darken-1">
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
                    color="amber-darken-1"
                    label="Name"
                    v-model="form.Name"
                  ></v-text-field>
                </v-col>

                <v-col cols="6">
                  <v-text-field
                    color="amber-darken-1"
                    label="Code"
                    v-model="form.ClubCode"
                  ></v-text-field>
                </v-col>

                <v-col cols="6">
                  <div class="text-subtitle-1">Stadium</div>
                  <div class="d-flex flex-column">
                    <v-text-field
                      color="amber-darken-1"
                      label="Name"
                      v-model="form.Stadium.Name"
                    ></v-text-field>

                    <v-text-field
                      color="amber-darken-1"
                      label="Capacity"
                      v-model="form.Stadium.Capacity"
                    ></v-text-field>

                    <v-text-field
                      color="amber-darken-1"
                      label="Location"
                      v-model="form.Stadium.Location"
                    ></v-text-field>

                    <div class="d-flex align-center">
                      <v-text-field
                        color="amber-darken-1"
                        label="Stadium place (world)"
                        :model-value="anchorLabel.stadium"
                        readonly
                        hide-details
                      ></v-text-field>
                      <v-btn color="primary" class="ml-2" @click="openPicker('stadium')">
                        Pick
                      </v-btn>
                    </div>
                  </div>
                </v-col>

                <v-col class="px-2" cols="6">
                  <div class="text-subtitle-1">Address</div>
                  <div class="d-flex flex-column">
                    <v-text-field
                      color="amber-darken-1"
                      label="Section"
                      v-model="form.Address.Section"
                    ></v-text-field>

                    <v-text-field
                      color="amber-darken-1"
                      label="City"
                      v-model="form.Address.City"
                    ></v-text-field>

                    <v-select
                      color="amber-darken-1"
                      label="Campus layout"
                      :items="[
                        { title: 'City', value: 'city' },
                        { title: 'Coastal', value: 'coastal' },
                        { title: 'Hillside', value: 'hillside' },
                      ]"
                      hint="Only moves the campus scene and plots, never the facilities"
                      persistent-hint
                      class="mb-2"
                      v-model="form.CampusLayout"
                    ></v-select>

                    <v-select
                      color="amber-darken-1"
                      label="Country"
                      :items="countries"
                      item-title="Name"
                      item-value="_id"
                      v-model="form.AddressCountryId"
                    ></v-select>

                    <div class="d-flex align-center mt-2">
                      <v-text-field
                        color="amber-darken-1"
                        label="Address place (world)"
                        :model-value="anchorLabel.address"
                        readonly
                        hide-details
                      ></v-text-field>
                      <v-btn color="primary" class="ml-2" @click="openPicker('address')">
                        Pick
                      </v-btn>
                    </div>
                    <div class="text-caption mt-1" v-if="anchorNote">{{ anchorNote }}</div>
                    <v-btn
                      v-if="missingCountry"
                      size="small"
                      class="mt-1"
                      color="warning"
                      @click="importMissingCountry"
                    >
                      Import {{ missingCountry.name }} from the world
                    </v-btn>
                  </div>
                </v-col>
              </v-row>
            </v-container>

            <PlacePickerModal
              v-model="showPlacePicker"
              :world-slug="worldSlug"
              @select="onPlaceSelected"
            />

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
import { client } from '@/services/api';
import ImageUploader from '@/components/helpers/image-uploader.vue';
import PlacePickerModal from '@/components/PlacePickerModal.vue';
import type { Club } from '@repo/api-contract';
import { WORLD_SLUG, type PickedPlace } from '@/utils/worldPlace';

const props = defineProps<{
  isUpdate?: boolean;
}>();

const router = useRouter();
const route = useRoute();
const store = useStore();

const club = ref<Club>({} as Club);
const api = apiUrl;
const countries = computed<any[]>(() => store.countries);
const showPlacePicker = ref(false);
const worldSlug = WORLD_SLUG;
const pickTarget = ref<'address' | 'stadium'>('address');
const anchorLabels = ref({ address: '', stadium: '' });
const anchorNote = ref('');
const missingCountry = ref<{ entity_id: string; name: string } | null>(null);

const form = ref<Partial<Club>>({
  Name: '',
  ClubCode: '',
  AddressCountryId: '',
  Address: {
    Section: '',
    City: '',
  },
  Stadium: {
    Name: '',
    Capacity: '',
    Location: '',
  },
});

/** Shows the picked place's name when known, otherwise the raw id. */
const anchorLabel = computed(() => ({
  address: anchorLabels.value.address || form.value.Address?.entity_id || '',
  stadium: anchorLabels.value.stadium || form.value.Stadium?.entity_id || '',
}));

function openPicker(target: 'address' | 'stadium') {
  pickTarget.value = target;
  showPlacePicker.value = true;
}

async function onPlaceSelected(place: PickedPlace) {
  const entityId = place.entity_id ?? place.id;
  if (pickTarget.value === 'stadium') {
    form.value.Stadium = { ...form.value.Stadium, entity_id: entityId };
    if (!form.value.Stadium?.Name) form.value.Stadium.Name = place.name;
    anchorLabels.value.stadium = place.name;
    return;
  }
  form.value.Address = { ...form.value.Address, entity_id: entityId };
  anchorLabels.value.address = place.name;
  await resolveAddress(entityId);
}

/** City and country derive from the anchor place's ancestors in the world. */
async function resolveAddress(entityId: string) {
  anchorNote.value = '';
  missingCountry.value = null;
  try {
    const response = await client.places.resolveAnchor.mutation({
      body: { entity_id: entityId },
    });
    if (response.status !== 200 || !response.body.payload.resolved) {
      anchorNote.value = 'The world could not be reached; city and country were not derived.';
      return;
    }
    const derived = response.body.payload;
    if (derived.city) form.value.Address = { ...form.value.Address, City: derived.city };
    if (derived.countryId) form.value.AddressCountryId = derived.countryId;
    missingCountry.value = derived.missingCountry;
    anchorNote.value = derived.breadcrumbs.join(' > ');
  } catch (error) {
    console.error('Error resolving anchor:', error);
  }
}

async function importMissingCountry() {
  if (!missingCountry.value) return;
  try {
    const response = await client.places.importFromWorld.mutation({
      body: { entity_id: missingCountry.value.entity_id },
    });
    if (response.status === 200) {
      await store.getCountries();
      form.value.AddressCountryId = response.body.payload._id;
      missingCountry.value = null;
    } else {
      anchorNote.value = String((response.body as any).payload ?? 'Import failed');
    }
  } catch (error) {
    console.error('Error importing country:', error);
  }
}

function goBack() {
  router.back();
}

async function submit() {
  const clubID = String(route.params.id);

  try {
    if (props.isUpdate) {
      await client.clubs.updateClub.mutation({
        params: { id: clubID },
        body: form.value,
      });
    } else {
      await client.clubs.createClub.mutation({ body: form.value });
    }
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
    const clubID = String(route.params.id);
    try {
      await client.clubs.deleteClub.mutation({ params: { id: clubID } });
      router.push({ name: 'Clubs Home' });
    } catch (error) {
      console.error('Error deleting club:', error);
    }
  }
}

onMounted(async () => {
  if (props.isUpdate) {
    const clubID = String(route.params.id);
    try {
      const response = await client.clubs.getClub.query({
        params: { id: clubID },
      });
      if (response.status === 200) {
        club.value = response.body.payload;
        form.value = response.body.payload;
      }
    } catch (error) {
      console.error('Error fetching club:', error);
    }
  }
});
</script>
