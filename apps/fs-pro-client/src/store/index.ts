import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { Club } from '@/interfaces/club';
import { $axios } from '../main';
import { ICalendar } from '@/interfaces/calendar';

export const apiUrl = import.meta.env.VITE_APP_API_BASE_URL;

export interface User {
  username: string;
  clubs: string[];
  isAdmin: boolean;
  userID: string;
  session: string;
  avatar: string;
  fullname: string;
}

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
  const yearString = ref('');
  const allClubs = ref<Club[]>([]);
  const user = ref<User>({
    username: '',
    clubs: [],
    isAdmin: false,
    userID: '',
    session: '',
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
  const currentYear = computed(() => yearString.value);

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
      session: '',
      avatar: '',
      fullname: '',
    };
  }

  function getUser() {
    const savedUser = window.localStorage.getItem('fspro-user');
    if (savedUser) {
      user.value = JSON.parse(savedUser);
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
      const query = JSON.stringify({ _id: { $in: user.value.clubs } });
      const select = JSON.stringify('ClubCode Name _id');
      const response = await $axios.get(
        `/clubs/fetch?q=${query}&select=${select}`
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
      const response = await $axios.get(
        '/calendar/current?page=1&limit=14&populate=false'
      );
      if (response.data.success) {
        calendar.value = response.data.payload;
        lobby.value = !response.data.payload.YearString;
      }
    } catch (error) {
      console.error('Error fetching calendar:', error);
    }
  }

  async function setSeasons() {
    if (calendar.value?.YearString) {
      try {
        const response = await $axios.get(
          `/seasons/${calendar.value.YearString}/current`
        );
        seasons.value = response.data.payload;
      } catch (error) {
        console.error('Error fetching seasons:', error);
      }
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

  return {
    // State
    yearString,
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
    currentYear,

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
  };
});
