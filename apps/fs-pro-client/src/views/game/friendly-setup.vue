<template>
  <div>
    <v-row>
      <v-col cols="12">
        <v-card>
          <v-toolbar flat color="green-accent-3">
            <v-btn icon @click="router.back()">
              <v-icon>mdi-arrow-left</v-icon>
            </v-btn>
            <v-toolbar-title class="ml-1">Play a Friendly</v-toolbar-title>
          </v-toolbar>
        </v-card>
      </v-col>
    </v-row>

    <v-row>
      <v-col cols="6">
        <v-card>
          <v-card-title>Home</v-card-title>
          <v-card-text>
            <v-select
              label="Club"
              :items="clubs"
              item-title="Name"
              item-value="_id"
              v-model="homeClubId"
            ></v-select>
            <v-select
              label="Formation"
              :items="formations"
              v-model="homeFormation"
            ></v-select>
            <v-select
              label="Playing Style"
              :items="styles"
              v-model="homeStyle"
            ></v-select>
          </v-card-text>
        </v-card>
      </v-col>

      <v-col cols="6">
        <v-card>
          <v-card-title>Away</v-card-title>
          <v-card-text>
            <v-select
              label="Club"
              :items="clubs"
              item-title="Name"
              item-value="_id"
              v-model="awayClubId"
            ></v-select>
            <v-select
              label="Formation"
              :items="formations"
              v-model="awayFormation"
            ></v-select>
            <v-select
              label="Playing Style"
              :items="styles"
              v-model="awayStyle"
            ></v-select>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>

    <v-row>
      <v-col cols="12">
        <v-card>
          <v-card-text class="d-flex align-center">
            <v-switch
              v-model="saveStats"
              label="Count toward player/club stats history"
              hide-details
            ></v-switch>
            <v-spacer></v-spacer>
            <span v-if="error" class="text-error mr-4">{{ error }}</span>
            <v-btn
              color="green-accent-3"
              :loading="creating"
              :disabled="!canSubmit || creating"
              @click="createFriendly"
            >
              Play
            </v-btn>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { $axios } from '@/services/api';

const router = useRouter();

const clubs = ref<any[]>([]);
const formations = ref<string[]>([]);
const styles = ref<string[]>([]);

const homeClubId = ref('');
const awayClubId = ref('');
const homeFormation = ref('');
const homeStyle = ref('');
const awayFormation = ref('');
const awayStyle = ref('');
const saveStats = ref(false);
const creating = ref(false);
const error = ref('');

const canSubmit = computed(
  () => homeClubId.value && awayClubId.value && homeClubId.value !== awayClubId.value
);

async function loadClubs() {
  try {
    const response = await $axios.get('/clubs/all');
    clubs.value = response.data.payload;
  } catch (err) {
    console.error('Error loading clubs:', err);
  }
}

async function loadTacticOptions() {
  try {
    const response = await $axios.get('/game/tactic-options');
    formations.value = response.data.payload.formations;
    styles.value = response.data.payload.styles;
    homeFormation.value = formations.value[0];
    homeStyle.value = styles.value[0];
    awayFormation.value = formations.value[0];
    awayStyle.value = styles.value[0];
  } catch (err) {
    console.error('Error loading tactic options:', err);
  }
}

async function createFriendly() {
  if (!canSubmit.value) {
    error.value = 'Pick two different clubs';
    return;
  }

  error.value = '';
  creating.value = true;

  try {
    const response = await $axios.post('/game/friendly', {
      homeClubId: homeClubId.value,
      awayClubId: awayClubId.value,
      homeTactic: { formationName: homeFormation.value, styleName: homeStyle.value },
      awayTactic: { formationName: awayFormation.value, styleName: awayStyle.value },
      saveStats: saveStats.value,
    });

    const { fixture_id } = response.data.payload;
    router.push(`/matchzone/${fixture_id}`);
  } catch (err) {
    console.error('Error creating friendly match:', err);
    error.value = 'Could not create the friendly match';
  } finally {
    creating.value = false;
  }
}

onMounted(() => {
  loadClubs();
  loadTacticOptions();
});
</script>
