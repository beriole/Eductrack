import { create } from 'zustand';
import { Platform, AppState } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { api } from '@/src/lib/api';
import { programmerRappels, aEtudieAujourdhui } from '@/src/lib/reminders';

// (Re)programme les relances locales de révision — élèves uniquement.
// On tient compte du fait qu'il a déjà étudié aujourd'hui (pas de rappel de série).
function planifierRappels(user?: { role?: string } | null) {
  if (user?.role !== 'eleve') return;
  aEtudieAujourdhui().then((etudie) => programmerRappels({ aEtudieAujourdhui: etudie }));
}

export interface User {
  id_utilisateur: string;
  email: string;
  nom: string;
  prenom: string;
  role: 'eleve' | 'parent' | 'enseignant' | 'admin';
  langue: 'fr' | 'en';
  avatar_url?: string;
  email_verifie: boolean;
  telephone?: string;
  // Élève spécifique
  niveau_scolaire?: string;
  serie?: string;
  region?: string;
  ville?: string;
  etablissement?: string;
  score_global?: number;
  streak_jours?: number;
  points_gamification?: number;
}

export interface RegisterData {
  email: string;
  password: string;
  nom: string;
  prenom: string;
  telephone?: string;
  role: 'eleve' | 'parent' | 'enseignant';
  // Champs élève
  niveau_scolaire?: string;
  region?: string;
  serie?: string;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  /** null = pas encore lu depuis le stockage. */
  hasSeenOnboarding: boolean | null;
  login: (email: string, password: string) => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  logout: () => Promise<void>;
  loadUser: () => Promise<void>;
  refreshUser: () => Promise<void>;
  loadOnboarding: () => Promise<void>;
  setOnboardingSeen: () => Promise<void>;
}

// Enregistre le token Expo Push sur le backend (non-bloquant).
// On utilise le service Expo Push (token « ExponentPushToken[…] ») : il fonctionne
// dans Expo Go (Android, SDK 52) et le backend sait le router (utils.send_push_notification).
async function registerPushToken() {
  try {
    const Notifications = await import('expo-notifications');

    // Canal Android obligatoire pour afficher les notifications (heads-up).
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Rappels SmartSchool',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#4F46E5',
      });
    }

    const existing = await Notifications.getPermissionsAsync();
    let granted = existing.granted;
    if (!granted) {
      const asked = await Notifications.requestPermissionsAsync();
      granted = asked.granted;
    }
    if (!granted) return;

    // Token Expo Push (« ExponentPushToken[…] ») : le backend l'envoie via le
    // service Expo (utils._send_via_expo). Fonctionne dans Expo Go SDK 52 dès qu'un
    // projet Expo est lié (npx eas init → projectId). Sans projectId, échoue
    // proprement (catch) sans bloquer — les rappels locaux restent actifs.
    const projectId =
      (Constants?.expoConfig as any)?.extra?.eas?.projectId ??
      (Constants as any)?.easConfig?.projectId;
    if (!projectId) return; // pas encore de projet Expo lié : on n'enregistre pas de token serveur
    const tokenResp = await Notifications.getExpoPushTokenAsync({ projectId });
    if (tokenResp?.data) {
      await api.post('/users/me/push-token/', { push_token: tokenResp.data });
    }
  } catch (e) {
    // Non-fatal : les notifications push sont optionnelles.
    console.log('[push] enregistrement échoué:', (e as Error)?.message);
  }
}

// Configure le handler de notifications reçues en premier plan
try {
  const Notifications = require('expo-notifications');
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });
} catch {}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  hasSeenOnboarding: null,

  loadOnboarding: async () => {
    try {
      const val = await AsyncStorage.getItem('hasSeenOnboarding');
      set({ hasSeenOnboarding: val === 'true' });
    } catch {
      set({ hasSeenOnboarding: false });
    }
  },

  setOnboardingSeen: async () => {
    set({ hasSeenOnboarding: true });
    try {
      await AsyncStorage.setItem('hasSeenOnboarding', 'true');
    } catch {}
  },

  login: async (email, password) => {
    const { data } = await api.post('/auth/login/', { email, password });
    await SecureStore.setItemAsync('access_token', data.tokens.access);
    await SecureStore.setItemAsync('refresh_token', data.tokens.refresh);
    set({ user: data.user, isAuthenticated: true });
    registerPushToken();
    planifierRappels(data.user);
  },

  register: async (registerData) => {
    const { data } = await api.post('/auth/register/', registerData);
    await SecureStore.setItemAsync('access_token', data.tokens.access);
    await SecureStore.setItemAsync('refresh_token', data.tokens.refresh);
    set({ user: data.user, isAuthenticated: true });
    registerPushToken();
    planifierRappels(data.user);
  },

  logout: async () => {
    try {
      const refresh = await SecureStore.getItemAsync('refresh_token');
      if (refresh) await api.post('/auth/logout/', { refresh });
    } finally {
      await SecureStore.deleteItemAsync('access_token');
      await SecureStore.deleteItemAsync('refresh_token');
      set({ user: null, isAuthenticated: false });
    }
  },

  loadUser: async () => {
    try {
      const token = await SecureStore.getItemAsync('access_token');
      if (!token) return set({ isLoading: false });
      const { data } = await api.get('/users/me/');
      set({ user: data, isAuthenticated: true });
      planifierRappels(data);
    } catch {
      set({ user: null, isAuthenticated: false });
    } finally {
      set({ isLoading: false });
    }
  },

  refreshUser: async () => {
    try {
      const { data } = await api.get('/users/me/');
      set({ user: data });
    } catch {}
  },
}));

// Au retour de l'app au premier plan, on rafraîchit les relances d'inactivité
// (repoussées depuis « maintenant ») pour un élève connecté.
try {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') planifierRappels(useAuthStore.getState().user);
  });
} catch {}
