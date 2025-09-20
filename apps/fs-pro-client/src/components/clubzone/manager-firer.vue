<template>
  <v-dialog :model-value="show" @update:model-value="$emit('update:show', $event)" width="700">
    <v-card class="pa-0">
      <v-card-title class="headline grey lighten-2" primary-title>
        Relieve Manager
      </v-card-title>
      <v-card-text>
        <v-row no-gutters>
          <v-col cols="12">
            <v-card flat tile>
              <v-img></v-img>
              <v-card-title>
                {{ manager.FirstName }} {{ manager.LastName }}
              </v-card-title>
              <v-list flat dense>
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
import { ref, getCurrentInstance } from 'vue';
import { useRouter } from 'vue-router';

interface Props {
  show: any;
  manager: any;
  club: string;
}

const props = defineProps<Props>();

const router = useRouter();
const instance = getCurrentInstance();
const $axios = instance?.appContext.config.globalProperties.$axios;

const loading = ref(false);
const reason = ref('');

const fireManager = () => {
  loading.value = true;
  $axios
    .delete(
      `/clubs/${props.club}/manager?reason=${JSON.stringify(reason.value)}`
    )
    .then(() => {
      router.push('..');
    })
    .catch((err: any) => {
      console.log('Error! => ', err);
    })
    .finally(() => {
      loading.value = false;
    });
};
</script>
