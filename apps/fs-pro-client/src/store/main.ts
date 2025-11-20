import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { $axios } from '../main';

export const apiUrl = import.meta.env.VITE_APP_API_BASE_URL || '';

export const useMainStore = defineStore('main', () => {
  const user = ref(null);
  const calendar = ref(null);
  const countries = ref([]);
  const selectedLeague = ref(null);
  const errorOverlay = ref(false);
  const toast = ref({
    show: false,
    message: '',
    style: 'success',
  });

  const isAuthenticated = computed(() => !!user.value);

  async function setUser(userData: any) {
    user.value = userData;
    localStorage.setItem('user', JSON.stringify(userData));
  }

  async function getUser() {
    const savedUser = localStorage.getItem('user');
    if (savedUser) {
      user.value = JSON.parse(savedUser);
    }
  }

  async function setCalendar() {
    try {
      const response = await $axios.get('/calendar/current');
      calendar.value = response.data.payload;
    } catch (error) {
      console.error('Error fetching calendar:', error);
    }
  }

  async function getCountries() {
    try {
      const response = await $axios.get('/countries');
      countries.value = response.data.payload;
    } catch (error) {
      console.error('Error fetching countries:', error);
    }
  }

  function showToast(message: string, style: string = 'success') {
    toast.value = {
      show: true,
      message,
      style,
    };
  }

  function toggleErrorOverlay() {
    errorOverlay.value = !errorOverlay.value;
  }

  return {
    user,
    calendar,
    countries,
    selectedLeague,
    errorOverlay,
    toast,
    isAuthenticated,
    setUser,
    getUser,
    setCalendar,
    getCountries,
    showToast,
    toggleErrorOverlay,
  };
});
