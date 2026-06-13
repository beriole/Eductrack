import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from '@/src/lib/api';
import { translations, Lang, TranslationKey } from './translations';

const STORAGE_KEY = 'app_lang';

interface I18nState {
  lang: Lang;
  /** Charge la langue persistée au démarrage. */
  loadLang: () => Promise<void>;
  /** Change la langue, la persiste localement et la synchronise avec le backend. */
  setLang: (lang: Lang) => Promise<void>;
  /** Traduit une clé dans la langue courante. */
  t: (key: TranslationKey) => string;
}

export const useI18n = create<I18nState>((set, get) => ({
  lang: 'fr',

  loadLang: async () => {
    try {
      const saved = await AsyncStorage.getItem(STORAGE_KEY);
      if (saved === 'fr' || saved === 'en') {
        set({ lang: saved });
      }
    } catch {
      // Valeur par défaut : français
    }
  },

  setLang: async (lang) => {
    set({ lang });
    try {
      await AsyncStorage.setItem(STORAGE_KEY, lang);
    } catch {}
    // Synchronise la préférence côté serveur (non bloquant).
    try {
      await api.patch('/users/me/', { langue: lang });
    } catch {}
  },

  t: (key) => {
    const { lang } = get();
    return translations[lang][key] ?? translations.fr[key] ?? key;
  },
}));
