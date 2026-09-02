import axios from 'axios';

export const apiUrl = import.meta.env.VITE_APP_API_BASE_URL || '';

export const $axios = axios.create({
  baseURL: `${apiUrl}/api`,
});
