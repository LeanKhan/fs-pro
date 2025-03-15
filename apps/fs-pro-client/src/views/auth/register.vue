<template>
  <v-card>
    <v-card-title class="title font-weight-regular justify-space-between">
      <span>{{ currentTitle }}</span>
      <v-avatar color="primary lighten-2" class="subheading white--text" size="40">
        <v-icon color="white">{{ currentIcon }}</v-icon>
      </v-avatar>
    </v-card-title>

    <v-window v-model="step">
      <v-window-item :value="1">
        <form>
          <v-card>
            <v-card-text>
              <v-text-field
                required
                type="text"
                label="Full Name"
                color="green"
                v-model="form.FullName"
              ></v-text-field>

              <v-text-field
                required
                type="text"
                label="Username"
                color="green"
                v-model="form.Username"
              ></v-text-field>

              <v-text-field
                required
                type="text"
                label="Password"
                color="green"
                v-model="form.Password"
              ></v-text-field>

              <v-text-field
                :error="confirmPassword != form.Password"
                required
                type="text"
                label="Confirm Password"
                color="green"
                v-model="confirmPassword"
              ></v-text-field>
            </v-card-text>
          </v-card>
        </form>
      </v-window-item>

      <v-window-item :value="2">
        <v-card-text>
          <v-card flat tile>
            <v-list>
              <v-list-item-group v-model="form.Clubs" multiple>
                <v-list-item
                  v-for="(club, i) in visibleClubs"
                  :value="club._id"
                  :input-value="form.Clubs.filter(c => c === club._id).length > 0"
                  :key="i"
                >
                  <template v-slot:default="{ isActive, select }">
                    <v-list-item-action>
                      <v-checkbox
                        color="green"
                        :true-value="club._id"
                        :input-value="isActive"
                        @click="select"
                      ></v-checkbox>
                    </v-list-item-action>

                    <v-list-item-content>
                      <v-list-item-title>{{ club.ClubCode }}</v-list-item-title>
                      <v-list-item-subtitle>{{ club.Name }}</v-list-item-subtitle>
                    </v-list-item-content>

                    <v-list-item-avatar>
                      <v-img :src="`${api}/img/clubs/logos/${club.ClubCode}.png`" width="40px"></v-img>
                    </v-list-item-avatar>
                  </template>
                </v-list-item>
              </v-list-item-group>
            </v-list>
            <v-card-actions>
              <v-pagination
                circle
                v-model="page"
                :length="Math.ceil(clubs.length / perPage)"
              ></v-pagination>
            </v-card-actions>
          </v-card>
        </v-card-text>
      </v-window-item>
    </v-window>

    <v-divider></v-divider>

    <v-card-actions>
      <v-btn :disabled="step === 1" text @click="step--">Back</v-btn>
      <v-spacer></v-spacer>
      <v-btn color="primary" depressed @click="step == 2 ? register() : step++">
        {{ step == 2 ? 'Submit' : 'Next' }}
      </v-btn>
    </v-card-actions>
  </v-card>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useStore, apiUrl } from '@/store';
import { $axios } from '@/main';

const router = useRouter();
const store = useStore();

const form = ref({
  FullName: '',
  Username: '',
  Password: '',
  Clubs: [],
});

const clubs = ref<any>([]);
const page = ref(1);
const perPage = ref(5);
const confirmPassword = ref('');
const step = ref(1);

const api = apiUrl;

const currentTitle = computed(() => {
  switch (step.value) {
    case 1:
      return 'Account Details';
    case 2:
      return 'Select Teams';
    default:
      return 'Account created';
  }
});

const currentIcon = computed(() => {
  switch (step.value) {
    case 1:
      return 'mdi-account';
    case 2:
      return 'mdi-shield';
    default:
      return 'Account created';
  }
});

const visibleClubs = computed(() => {
  return clubs.value.slice(
    (page.value - 1) * perPage.value,
    page.value * perPage.value
  );
});

async function getClubs() {
  try {
    const query = JSON.stringify({ User: null });
    const select = JSON.stringify('Name ClubCode LeagueCode _id');
    const response = await $axios.get(`/clubs/fetch?q=${query}&select=${select}`);
    clubs.value = response.data.payload;
  } catch (error) {
    console.error('Error fetching clubs:', error);
  }
}

async function register() {
  try {
    const response = await $axios.post(
      '/users/join',
      { data: { ...form.value } },
      { withCredentials: true }
    );

    if (response.data.success) {
      store.setUser({
        userID: response.data.payload._id,
        username: response.data.payload.Username,
        clubs: response.data.payload.Clubs,
        isAdmin: response.data.payload.isAdmin,
        session: response.data.payload.Session,
        avatar: response.data.payload.Avatar,
        fullname: response.data.payload.FullName,
      });

      router.push('/u');
    }
  } catch (error) {
    console.error('Error registering:', error);
  }
}

onMounted(() => {
  getClubs();
});
</script>