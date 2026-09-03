import axios from 'axios';
import { initQueryClient } from '@ts-rest/vue-query';
import { apiContract } from '@repo/api-contract';

export const apiUrl = import.meta.env.VITE_APP_API_BASE_URL || '';

export const $axios = axios.create({
  baseURL: `${apiUrl}/api`,
});

export const client = initQueryClient(apiContract, {
  baseUrl: `${apiUrl}/api`,
  baseHeaders: {},
  credentials: 'include',
});
