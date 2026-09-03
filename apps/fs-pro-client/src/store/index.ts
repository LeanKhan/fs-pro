import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { client, apiUrl } from '@/services/api';
import { ICalendar } from '@/interfaces/calendar';
import type { Club, Place, Season } from '@repo/api-contract';

export { apiUrl };

type User = {
  userID: string;
  username: string;
  // Bare ids fresh from login/join; full Club objects once setUserClubs()
  // resolves them.
  clubs: (string | Club)[];
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
  const seasons = ref<Season[]>([]);
  const countries = ref<Place[]>([]);
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
      // `clubs` is bare ids fresh from login/join (see the User type doc
      // comment) - resolving `club._id` on those unconditionally used to
      // silently produce an all-undefined list here, so this never actually
      // resolved real Club objects.
      const ids = user.value.clubs
        .map((club) => (typeof club === 'string' ? club : club._id))
        .filter((id): id is string => Boolean(id));
      const response = await client.clubs.getClubs.query({
        query: { ids: ids.join(',') },
      });

      if (response.status === 200) {
        user.value.clubs = response.body.payload;
      }
    } catch (error) {
      console.error('Error fetching user clubs:', error);
    }
  }

  async function setCalendar() {
    try {
      const response = await client.calendar.getCurrentCalendar.query();
      if (response.status === 200) {
        calendar.value = response.body.payload;
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
      const response = await client.seasons.getSeasons.query({
        query: { current: true },
      });
      if (response.status === 200) {
        seasons.value = response.body.payload;
        lobby.value = response.body.payload.length === 0;
      }
    } catch (error) {
      console.error('Error fetching seasons:', error);
    }
  }

  async function getCountries() {
    try {
      const response = await client.places.getCountries.query();
      if (response.status === 200) {
        countries.value = response.body.payload;
      }
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
