<template>
  <v-dialog
    :model-value="show"
    @update:model-value="$emit('update:show', $event)"
    width="700"
  >
    <v-card class="pa-0">
      <v-card-title class="text-h5 bg-grey-lighten-2" primary-title>
        Relieve Manager
      </v-card-title>
      <v-card-text>
        <v-alert v-if="error" type="error" variant="tonal" density="compact" class="mb-3">{{ error }}</v-alert>
        <v-row no-gutters>
          <v-col cols="12">
            <v-card flat tile>
              <v-img></v-img>
              <v-card-title>
                {{ manager.FirstName }} {{ manager.LastName }}
              </v-card-title>
              <v-list density="compact">
                <v-list-item>
                  <strong>
                    <v-icon>mdi-globe</v-icon>
                    Nationality:
                  </strong>
                  {{ manager.Nationality ? manager.Nationality.Name : '-' }}
                </v-list-item>
                <v-list-item>
                  <strong>
                    <v-icon>mdi-number</v-icon>
                    Age:
                  </strong>
                  {{ manager.Age }}
                </v-list-item>
              </v-list>

              <v-card-text>
                <v-textarea
                  label="Details on Manager leaving"
                  hint="Details about this manager's leaving"
                  v-model="reason"
                  placeholder="Why is he leaving?"
                  id="reason"
                ></v-textarea>
              </v-card-text>

              <v-card-actions>
                <v-btn
                  @click="fireManager"
                  :loading="loading"
                  :disabled="loading"
                >
                  Fire
                </v-btn>
              </v-card-actions>
            </v-card>
          </v-col>
        </v-row>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { client } from '@/services/api';

interface Props {
  show: any;
  manager: any;
  club: string;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  'update:show': [value: boolean];
  'update-available': [];
}>();

const loading = ref(false);
const error = ref('');
const reason = ref('');

/**
 * Release the manager through the owner program (`/program/:clubId/managers/:id/release`),
 * which a club owner may call. The old `clubs.fireManager` route is admin-only
 * and 403'd for owners (same defect class as U-01), swallowing the failure.
 * The free-text `reason` is kept for the record but the program endpoint does
 * not persist it yet.
 */
const fireManager = async () => {
  const managerId = props.manager?._id ?? props.manager?.id;
  if (!managerId) return;
  loading.value = true;
  error.value = '';
  try {
    const res = await client.program.releaseManager.mutation({
      params: { clubId: props.club, managerId },
      body: {},
    });
    if (res.status === 200) {
      emit('update-available');
      emit('update:show', false);
    } else {
      error.value = (res.body as { message?: string }).message ?? 'Could not release that manager.';
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Could not release that manager.';
  } finally {
    loading.value = false;
  }
};
</script>
