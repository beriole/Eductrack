import axios from 'axios';
import * as SecureStore from 'expo-secure-store';

const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://10.0.2.2:8000/api/v1';

export const api = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

// Injecte le token Bearer à chaque requête
api.interceptors.request.use(async (config) => {
  const token = await SecureStore.getItemAsync('access_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Un seul refresh à la fois : les requêtes 401 simultanées attendent la même
// promesse, ce qui évite la course (rotation + blacklist invalidaient le 2e
// refresh). On stocke aussi le refresh token rotaté renvoyé par le backend.
let refreshPromise: Promise<string> | null = null;

async function rafraichirToken(): Promise<string> {
  const refresh = await SecureStore.getItemAsync('refresh_token');
  if (!refresh) throw new Error('No refresh token');
  const { data } = await axios.post(`${BASE_URL}/auth/refresh/`, { refresh });
  await SecureStore.setItemAsync('access_token', data.access);
  if (data.refresh) await SecureStore.setItemAsync('refresh_token', data.refresh);
  return data.access;
}

// Refresh automatique si 401
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;
      try {
        if (!refreshPromise) {
          refreshPromise = rafraichirToken().finally(() => { refreshPromise = null; });
        }
        const access = await refreshPromise;
        original.headers.Authorization = `Bearer ${access}`;
        return api(original);
      } catch {
        await SecureStore.deleteItemAsync('access_token');
        await SecureStore.deleteItemAsync('refresh_token');
      }
    }
    return Promise.reject(error);
  }
);
