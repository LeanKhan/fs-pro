<template>
  <v-card>
    <v-card-title class="text-h6 font-weight-regular justify-space-between">
      <span>{{ currentTitle }}</span>
      <v-avatar
        color="primary-lighten-2"
        class="text-subtitle-1 text-white"
        size="40"
      >
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
          <v-card flat>
            <v-list>
              <v-list-item
                v-for="(club, i) in visibleClubs"
                :value="club._id"
                :key="i"
              >
                <template v-slot:prepend>
                  <v-checkbox
                    color="green"
                    :model-value="form.Clubs.includes(club._id)"
                    @update:model-value="toggleClub(club._id)"
                  ></v-checkbox>
                </template>

                <v-list-item-title>{{ club.ClubCode }}</v-list-item-title>
                <v-list-item-subtitle>
                  {{ club.Name }}
                </v-list-item-subtitle>

                <template v-slot:append>
                  <v-avatar>
                    <v-img
                      :src="`${api}/img/clubs/logos/${club.ClubCode}.png`"
                      width="40px"
                    ></v-img>
                  </v-avatar>
                </template>
              </v-list-item>
            </v-list>
            <v-card-actions>
              <v-pagination
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
      <v-btn :disabled="step === 1" variant="text" @click="step--">Back</v-btn>
      <v-spacer></v-spacer>
      <v-btn color="primary" variant="flat" @click="step == 2 ? register() : step++">
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

function toggleClub(clubId: string) {
  const index = form.value.Clubs.indexOf(clubId);
  if (index > -1) {
    form.value.Clubs.splice(index, 1);
  } else {
    form.value.Clubs.push(clubId);
  }
}

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
    const response = await $axios.get(
      `/clubs/fetch?q=${query}&select=${select}`
    );
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
