import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
// import { Club } from '@/interfaces/club';
import { $axios, apiUrl } from '@/services/api';
import { ICalendar } from '@/interfaces/calendar';

export { apiUrl };

type Country = {
  _id: string;
  Fullname: string;
  Name: string;
  Code: string;
  Region: string;
  Type: string;
};

type Address = {
  Country: Country;
};

type Club = {
  _id: string;
  Name: string;
  ClubCode: string;
  Address: Address;
};

type User = {
  userID: string;
  username: string;
  clubs: Club[];
  isAdmin: boolean;
  avatar: string;
  fullname: string;
};
export interface Toast {
  show: boolean;
  style: string;
  actionText: string;
  actionLink: string;
  message: string;
  withAction: boolean;
}

export const useStore = defineStore('main', () => {
  // State
  const allClubs = ref<Club[]>([]);
  const user = ref<User>({
    username: '',
    clubs: [],
    isAdmin: false,
    userID: '',
    // session: '',
    avatar: '',
    fullname: '',
  });
  const calendar = ref<ICalendar | null>(null);
  const seasons = ref([]);
  const countries = ref([]);
  const toast = ref<Toast>({
    show: false,
    message: '',
    style: '',
    actionText: '',
    actionLink: '',
    withAction: false,
  });
  const errorOverlay = ref(false);
  const lobby = ref(false);
  const selectedLeague = ref('');

  // Getters
  const isAuthenticated = computed(() => !!user.value.username);

  // Actions
  function setUser(payload: User) {
    window.localStorage.setItem('fspro-user', JSON.stringify(payload));
    user.value = payload;
  }

  function unsetUser() {
    window.localStorage.removeItem('fspro-user');
    user.value = {
      username: '',
      clubs: [],
      isAdmin: false,
      userID: '',
      // session: '',
      avatar: '',
      fullname: '',
    };
  }

  function getUser() {
    const savedUser = window.localStorage.getItem('fspro-user');
    if (savedUser) {
      try {
        user.value = JSON.parse(savedUser);
      } catch (error) {
        console.error('Error parsing saved user:', error);
        unsetUser();
      }
    }
  }

  function setSelectedLeague(leagueId: string) {
    selectedLeague.value = leagueId;
  }

  function unsetSelectedLeague() {
    selectedLeague.value = '';
  }

  async function setUserClubs() {
    if (user.value.clubs.length === 0) {
      return;
    }

    try {
      console.log('Clubs => ', user.value);
      const response = await $axios.get(
        `/clubs/all?ids=${user.value.clubs.map((club) => club._id).join(',')}`
      );

      if (response.data.success) {
        user.value.clubs = response.data.payload;
      }
    } catch (error) {
      console.error('Error fetching user clubs:', error);
    }
  }

  async function setCalendar() {
    try {
      const response = await $axios.get('/calendar/current');
      if (response.data.success) {
        calendar.value = response.data.payload;
      }
    } catch (error) {
      console.error('Error fetching calendar:', error);
    }
  }

  /** Every currently in-progress Season (across all Competitions) - also
   * doubles as the "lobby" gate: if nothing has been started yet (a fresh
   * game world, or between season cycles), the user is sent to the lobby
   * screen to wait for an admin to start one. */
  async function setSeasons() {
    try {
      const response = await $axios.get('/seasons?current=true');
      seasons.value = response.data.payload;
      lobby.value = response.data.payload.length === 0;
    } catch (error) {
      console.error('Error fetching seasons:', error);
    }
  }

  async function getCountries() {
    try {
      const response = await $axios.get('/places/country');
      countries.value = response.data.payload;
    } catch (error) {
      console.error('Error fetching countries:', error);
    }
  }

  function showToast(payload: Partial<Toast>) {
    toast.value = {
      show: true,
      message: payload.message || '',
      style: payload.style || '',
      actionText: payload.actionText || '',
      actionLink: payload.actionLink || '',
      withAction: payload.withAction || false,
    };
  }

  function hideToast() {
    toast.value = {
      show: false,
      message: '',
      style: '',
      actionText: '',
      actionLink: '',
      withAction: false,
    };
  }

  function toggleErrorOverlay() {
    errorOverlay.value = !errorOverlay.value;
  }

  function setErrorOverlay(value: boolean) {
    errorOverlay.value = value;
  }

  return {
    // State
    allClubs,
    user,
    calendar,
    seasons,
    countries,
    toast,
    errorOverlay,
    lobby,
    selectedLeague,

    // Getters
    isAuthenticated,

    // Actions
    setUser,
    unsetUser,
    getUser,
    setSelectedLeague,
    unsetSelectedLeague,
    setUserClubs,
    setCalendar,
    setSeasons,
    getCountries,
    showToast,
    hideToast,
    toggleErrorOverlay,
    setErrorOverlay,
  };
});
