<template>
  <v-dialog
    :model-value="show"
    @update:model-value="$emit('update:show', $event)"
    width="700"
    persistent
  >
    <v-card class="pa-0" :loading="loading">
      <v-card-title class="headline cyan darken-2" primary-title>
        Hire a new Manager
        <v-spacer></v-spacer>
        <v-btn small icon @click="close">
          <v-icon small>mdi-close</v-icon>
        </v-btn>
      </v-card-title>
      <v-card-text>
        <v-row dense no-gutters>
          <v-col dense cols="6">
            <v-card flat tile v-if="selectedManager" class="pa-0">
              <!-- <v-img></v-img> -->
              <v-card-title class="subtitle">
                {{ selectedManager.FirstName }} {{ selectedManager.LastName }}
              </v-card-title>
              <v-list flat dense>
                <v-list-item>
                  <strong>
                    <v-icon>mdi-globe</v-icon>
                    Nationality: &nbsp;
                  </strong>
                  {{ selectedManager.Nationality ? selectedManager.Nationality.Name : '-' }}
                </v-list-item>
                <v-list-item>
                  <strong>
                    <v-icon>mdi-number</v-icon>
                    Age:
                  </strong>
                  47
                </v-list-item>
                <v-list-item>
                  <strong>
                    <v-icon>mdi-trophy</v-icon>
                    Titles:
                  </strong>
                  12
                </v-list-item>
              </v-list>
            </v-card>
            <v-sheet v-else height="100">
              Select a manager to hire!
            </v-sheet>
          </v-col>

          <v-col cols="6">
            <v-list dense max-height="400px" flat>
              <v-list-item-group :model-value="managerModel" @update:model-value="managerModel = $event" color="cyan darken-1">
                <v-list-item v-for="(m, i) in managers" :key="i">
                  <v-list-item-avatar size="30px" color="yellow">
                    <span>
                      {{ m.FirstName.charAt(0) + m.LastName.charAt(0) }}
                    </span>
                  </v-list-item-avatar>
                  <v-list-item-content>
                    <v-list-item-title>
                      {{ m.FirstName }}
                      {{ m.LastName }}
                    </v-list-item-title>
                    <!-- <v-list-item-subtitle>
                      <strong>12</strong>
                      Titles |
                      <strong>2</strong>
                      Clubs |
                      <strong>47</strong>
                      Years Old |
                    </v-list-item-subtitle> -->
                  </v-list-item-content>
                </v-list-item>
              </v-list-item-group>
            </v-list>
          </v-col>

          <v-col cols="12">
            <v-text-field
              color="cyan darken-1"
              label="Details"
              v-model="form.details"
              hint="The press release for the Manager's appointment"
            ></v-text-field>
          </v-col>
        </v-row>
      </v-card-text>

      <v-card-actions>
        <v-btn @click="hireManager" :loading="loading" :disabled="loading">
          Hire
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, getCurrentInstance } from 'vue';

interface Props {
  show: any;
  club: string;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  'update:show': [value: boolean];
  'update-available': [];
}>();

const instance = getCurrentInstance();
const $axios = instance?.appContext.config.globalProperties.$axios;

const managerModel = ref(0);
const managers = ref<any[]>([]);
const loading = ref(false);

const form = ref({
  details: '',
});

const selectedManager = computed(() => {
  return managers.value[managerModel.value];
});

const close = () => {
  emit('update:show', false);
};

const hireManager = () => {
  loading.value = true;
  $axios
    .put(`/clubs/${props.club}/manager`, {
      ...form.value,
      manager: selectedManager.value._id,
    })
    .then(() => {
      console.log('Club Manager appointed successfully!');
      emit('update:show', false);
      emit('update-available');
    })
    .catch((err: any) => {
      console.log('Error adding manager', err);
    })
    .finally(() => {
      loading.value = false;
    });
};

onMounted(() => {
  const query = JSON.stringify({ isEmployed: false });
  $axios
    .get(`/managers?options=${query}&populate=Club`)
    .then((res: any) => {
      managers.value = res.data.payload;
    })
    .catch((err: any) => {
      console.log('Error! => ', err);
    });
});
</script>
