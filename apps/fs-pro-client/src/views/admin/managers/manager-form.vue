<template>
  <div>
    <v-row>
      <v-col cols="12">
        <v-card>
          <v-toolbar flat color="cyan-darken-2">
            <v-btn icon @click="goBack">
              <v-icon>mdi-arrow-left</v-icon>
            </v-btn>
            <v-toolbar-title class="ml-1">
              {{ isUpdate ? 'Update Manager' : 'Create Manager' }}
            </v-toolbar-title>
          </v-toolbar>
        </v-card>
      </v-col>
    </v-row>

    <v-form @submit.prevent="submit">
      <v-row>
        <v-col cols="12">
          <v-card>
            <v-container>
              <v-row>
                <v-col cols="6">
                  <v-text-field
                    color="cyan-darken-1"
                    label="First Name"
                    v-model="form.FirstName"
                  ></v-text-field>
                </v-col>

                <v-col cols="6">
                  <v-text-field
                    color="cyan-darken-1"
                    label="Last Name"
                    v-model="form.LastName"
                  ></v-text-field>
                </v-col>

                <v-col cols="6">
                  <v-select
                    color="cyan-darken-1"
                    label="Nationality"
                    :items="countries"
                    item-title="Name"
                    item-value="_id"
                    v-model="form.NationalityId"
                  ></v-select>
                </v-col>

                <v-col cols="6">
                  <v-text-field
                    color="cyan-darken-1"
                    type="number"
                    min="25"
                    max="70"
                    label="Age"
                    v-model="form.Age"
                  ></v-text-field>
                </v-col>
              </v-row>
            </v-container>

            <v-divider></v-divider>

            <v-card-actions>
              <v-spacer></v-spacer>
              <v-btn
                @click="submit"
                :loading="submitLoading"
                :disabled="submitLoading"
                :color="isUpdate ? 'warning' : 'success'"
              >
                {{ isUpdate ? 'Update' : 'Create Manager' }}
              </v-btn>

              <v-btn @click="router.push('../managers')" color="secondary">
                Cancel
              </v-btn>

              <v-btn v-if="isUpdate" @click="deleteManager" color="error">
                Remove
              </v-btn>
            </v-card-actions>
          </v-card>
        </v-col>
      </v-row>
    </v-form>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useStore } from '@/store';
import { client } from '@/services/api';

const props = defineProps<{
  isUpdate?: boolean;
}>();

const router = useRouter();
const route = useRoute();
const store = useStore();

const manager = ref<any>({});
const submitLoading = ref(false);
const form = ref<any>({
  FirstName: '',
  LastName: '',
  NationalityId: '',
  Age: '',
});

const countries = computed(() => store.countries as any);

function goBack() {
  router.back();
}

async function submit() {
  const managerId = String(route.params.id);

  submitLoading.value = true;

  try {
    if (props.isUpdate) {
      await client.managers.updateManager.mutation({
        params: { id: managerId },
        body: form.value,
      });
      router.push({
        name: 'View Manager',
        params: { id: managerId },
      });
    } else {
      await client.managers.createManager.mutation({ body: form.value });
      router.push({ name: 'Managers Home' });
    }
  } catch (error) {
    console.error('Error submitting manager:', error);
  } finally {
    submitLoading.value = false;
  }
}

async function deleteManager() {
  const answer = confirm(
    `Are you sure you want to delete ${form.value.FirstName} ${form.value.LastName}?!!`
  );

  if (answer) {
    const managerId = String(route.params.id);
    try {
      await client.managers.deleteManager.mutation({
        params: { id: managerId },
      });
      router.push({ name: 'Managers Home' });
    } catch (error) {
      console.error('Error deleting manager:', error);
    }
  }
}

onMounted(async () => {
  if (props.isUpdate) {
    const managerId = String(route.params.id);
    try {
      const response = await client.managers.getManager.query({
        params: { id: managerId },
      });
      if (response.status === 200) {
        manager.value = response.body.payload;
        form.value = response.body.payload;
      }
    } catch (error) {
      console.error('Error fetching manager:', error);
    }
  }
});
</script>
