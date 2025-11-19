<template>
  <div>
    <v-row>
      <v-col cols="12">
        <v-card>
          <v-toolbar flat color="indigo darken-1">
            <v-btn icon @click="goBack">
              <v-icon>mdi-arrow-left</v-icon>
            </v-btn>
            <v-toolbar-title class="ml-1">
              {{ isUpdate ? 'Update Player' : 'Create Player' }}
            </v-toolbar-title>
          </v-toolbar>
        </v-card>
      </v-col>
    </v-row>

    <v-form @submit.prevent="submit">
      <v-row>
        <v-col cols="3">
          <v-card height="300" width="245" style="position: fixed">
            <v-card-title>Player</v-card-title>
            <v-card-text class="d-flex justify-center pb-0 accent">
              <player-avatar :appearance="form.Appearance"></player-avatar>
            </v-card-text>
            <v-card-actions>Rating: {{ rating }}</v-card-actions>
          </v-card>
        </v-col>

        <v-col cols="9">
          <v-card>
            <v-container>
              <v-row>
                <v-col cols="6">
                  <v-text-field
                    color="indigo darken-1"
                    label="First Name"
                    v-model="form.FirstName"
                  ></v-text-field>
                </v-col>

                <v-col cols="6">
                  <v-text-field
                    color="indigo darken-1"
                    label="Last Name"
                    v-model="form.LastName"
                  ></v-text-field>
                </v-col>

                <v-col cols="6">
                  <v-text-field
                    color="indigo darken-1"
                    type="number"
                    min="16"
                    max="45"
                    label="Age"
                    v-model="form.Age"
                  ></v-text-field>

                  <v-select
                    color="indigo darken-1"
                    label="Nationality"
                    :items="countries"
                    item-text="Name"
                    item-value="_id"
                    v-model="form.Nationality"
                  ></v-select>

                  <v-select
                    color="indigo darken-1"
                    label="Position"
                    :items="positions"
                    v-model="form.Position"
                  ></v-select>

                  <v-radio-group
                    v-if="availableRoles.length"
                    label="Role"
                    v-model="form.Role"
                  >
                    <v-radio
                      v-for="role in availableRoles"
                      :key="role"
                      :label="role"
                      :value="role"
                    ></v-radio>
                  </v-radio-group>

                  <v-radio-group
                    label="Preferred Foot"
                    v-model="form.Attributes.PreferredFoot"
                  >
                    <v-radio label="Left" value="left"></v-radio>
                    <v-radio label="Right" value="right"></v-radio>
                  </v-radio-group>

                  <div class="subtitle-1">Mindset</div>
                  <v-checkbox
                    v-model="form.Attributes.AttackingMindset"
                    label="Attacking"
                  ></v-checkbox>
                  <v-checkbox
                    v-model="form.Attributes.DefensiveMindset"
                    label="Defensive"
                  ></v-checkbox>

                  <div class="subtitle-1">Appearance</div>
                  <div v-for="(f, x) in appearances" :key="x">
                    <span>{{ f.feature }}</span>
                    <ul v-for="(v, y) in f.variants" :key="y">
                      <li>{{ v }} - {{ f.styles[y] }}</li>
                    </ul>
                  </div>
                </v-col>

                <v-col class="px-2" cols="6">
                  <div class="subtitle-1">Attributes</div>
                  <v-list two-line>
                    <v-list-item v-for="(attr, i) in attributes" :key="i">
                      <template v-slot:default>
                        <v-list-item-avatar>
                          <v-avatar
                            width="65"
                            height="65"
                            :color="attrColor(form.Attributes[attr])"
                          >
                            {{ form.Attributes[attr] }}
                          </v-avatar>
                        </v-list-item-avatar>
                        <v-list-item-content>
                          <v-list-item-subtitle class="pl-2">
                            {{ attr }}
                          </v-list-item-subtitle>
                          <v-list-item-subtitle class="px-2">
                            <v-slider
                              dense
                              v-model="form.Attributes[attr]"
                              color="indigo"
                              track-color="grey"
                              min="0"
                              max="99"
                            >
                              <template v-slot:prepend>
                                <v-icon
                                  color="indigo lighten-3"
                                  @click="form.Attributes[attr]--"
                                >
                                  mdi-minus
                                </v-icon>
                              </template>
                              <template v-slot:append>
                                <v-icon
                                  color="indigo lighten-3"
                                  @click="form.Attributes[attr]++"
                                >
                                  mdi-plus
                                </v-icon>
                              </template>
                            </v-slider>
                          </v-list-item-subtitle>
                        </v-list-item-content>
                      </template>
                    </v-list-item>
                  </v-list>
                </v-col>
              </v-row>
            </v-container>

            <v-divider></v-divider>

            <v-card-actions>
              <v-spacer></v-spacer>
              <v-btn @click="submit" :color="isUpdate ? 'warning' : 'success'">
                {{ isUpdate ? 'Update' : 'Create Player' }}
              </v-btn>
              <v-btn @click="router.push('../players')" color="secondary">
                Cancel
              </v-btn>
              <v-btn v-if="isUpdate" @click="deletePlayer" color="error">
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
import { ref, computed, onMounted, watch } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useStore } from '@/store';
import { $axios } from '@/main';
import PlayerAvatar from '@/components/players/player-avatar.vue';
import { calculatePlayerRating } from '@/helpers/players';

const props = defineProps<{
  isUpdate?: boolean;
}>();

const router = useRouter();
const route = useRoute();
const store = useStore();

const player = ref({});
const appearances = ref<any>([]);
const positions = ['GK', 'ATT', 'DEF', 'MID'];
const roles: any = {
  ATT: ['LW', 'RW', 'ST'],
  DEF: ['LB', 'RB', 'CB'],
  MID: ['CM', 'CAM', 'CDM', 'RM', 'LM'],
  GK: ['GK'],
};

const form = ref<any>({
  FirstName: '',
  LastName: '',
  Nationality: '',
  Age: '',
  Position: '',
  Role: '',
  Attributes: {
    Speed: 0,
    Shooting: 0,
    LongPass: 0,
    ShortPass: 0,
    Mental: 0,
    Control: 0,
    Tackling: 0,
    Strength: 0,
    Stamina: 0,
    Keeping: 0,
    Dribbling: 0,
    SetPiece: 0,
    Vision: 0,
    PreferredFoot: '',
    AttackingMindset: null,
    DefensiveMindset: null,
  },
  Appearance: {
    head: { variant: 'default', style: 'light' },
    complexion: 'light',
    hair: { variant: 'default', style: 'brown' },
    eyes: { variant: 'default', style: 'black' },
    eyebrows: { variant: 'default', style: 'brown' },
    nose: { variant: 'default', style: 'light' },
    mouth: { variant: 'default', style: 'light' },
  },
});

const attributes = [
  'Keeping',
  'Speed',
  'Shooting',
  'LongPass',
  'ShortPass',
  'SetPiece',
  'Dribbling',
  'Mental',
  'Control',
  'Vision',
  'Tackling',
  'Strength',
  'Stamina',
];

const countries = computed(() => store.countries);
const availableRoles = computed(() =>
  form.value.Position ? roles[form.value.Position] : []
);
const rating = computed(() =>
  calculatePlayerRating(form.value.Attributes, form.value.Position)
);

function attrColor(value: number): string {
  if (value <= 50) return 'red';
  if (value < 80) return 'orange';
  return 'green';
}

function goBack() {
  router.back();
}

async function submit() {
  const playerId = route.params.id;
  const url = props.isUpdate
    ? `/players/${playerId}/update`
    : '/players/new?model=player';

  try {
    const response = await $axios.post(url, {
      data: { ...form.value, Rating: rating.value },
    });
    router.push({ name: 'Players Home' });
  } catch (error) {
    console.error('Error submitting player:', error);
  }
}

async function deletePlayer() {
  const answer = confirm(
    `Are you sure you want to delete ${form.value.FirstName} ${form.value.LastName}?!!`
  );

  if (answer) {
    const playerId = route.params.id;
    try {
      await $axios.delete(`/players/${playerId}`);
      router.push({ name: 'Players Home' });
    } catch (error) {
      console.error('Error deleting player:', error);
    }
  }
}

onMounted(async () => {
  if (props.isUpdate) {
    const playerId = route.params.id;
    try {
      const response = await $axios.get(`/players/${playerId}`);
      player.value = response.data.payload;
      form.value = response.data.payload;
    } catch (error) {
      console.error('Error fetching player:', error);
    }
  }

  try {
    const response = await $axios.get('/players/appearance');
    appearances.value = response.data.payload;
  } catch (error) {
    console.error('Error fetching appearance:', error);
  }
});
</script>
