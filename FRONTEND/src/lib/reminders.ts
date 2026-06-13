/**
 * Relances locales « style Duolingo » : notifications récurrentes + adaptées à
 * l'activité réelle de l'élève, pour le pousser à réviser — même app fermée.
 *
 * 100 % local (expo-notifications) → fonctionne dans Expo Go (Android, SDK 52)
 * sans compte Expo, sans build, sans Firebase. Indépendant du push serveur.
 *
 * Deux types de rappels :
 *  1) Quotidiens à heures fixes (matin/midi/soir) — messages qui tournent chaque jour.
 *  2) « Inactivité » — programmés à J+1 et J+2 à partir de la dernière activité ;
 *     comme on les reprogramme à chaque ouverture, ils ne se déclenchent QUE si
 *     l'élève ne revient pas. + un rappel de série le soir, annulé s'il a déjà
 *     étudié aujourd'hui.
 */
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';

interface Msg { title: string; body: string }

const POOLS: Record<'matin' | 'midi' | 'soir' | 'streak', Msg[]> = {
  matin: [
    { title: 'Bonjour 👋', body: '5 minutes de révision avant les cours, et tu pars gagnant(e).' },
    { title: 'Le matin a de l\'or 🌅', body: 'Ton cerveau est frais : une petite question pour démarrer ?' },
    { title: 'Réveil studieux 📖', body: 'Un objectif simple aujourd\'hui : une session terminée. On y va ?' },
  ],
  midi: [
    { title: 'Pause = progression ☕', body: 'Un exercice maintenant vaut mieux que deux ce soir.' },
    { title: 'On garde le rythme 💪', body: 'Juste 5 minutes de révision pendant la pause ?' },
    { title: 'Petit effort à midi 📈', body: 'Grand résultat ce soir. Une question rapide ?' },
  ],
  soir: [
    { title: '📚 C\'est l\'heure d\'étudier !', body: 'Tes camarades révisent déjà… ne reste pas à la traîne 👀' },
    { title: 'La meilleure soirée ✨', body: 'commence par 15 minutes de révision. Lance une session !' },
    { title: 'Objectif du jour 🎯', body: 'Pas encore atteint ? Il te reste largement le temps. On s\'y met ?' },
  ],
  streak: [
    { title: '🔥 Ta série va sauter !', body: 'Vite, une session avant minuit pour garder ton streak.' },
    { title: 'Ne casse pas ta série 🔥', body: 'Juste un exercice et elle est sauvée. Tu peux le faire !' },
    { title: 'Plus que quelques heures ⏳', body: 'Garde ton streak 🔥 — une dernière révision et au lit.' },
  ],
};

const HORAIRES: Record<'matin' | 'midi' | 'soir' | 'streak', [number, number]> = {
  matin: [7, 0], midi: [13, 30], soir: [18, 30], streak: [20, 45],
};

const INACTIVITE: { heures: number; msg: Msg }[] = [
  { heures: 22, msg: { title: 'Tu nous manques 🦉', body: 'Reviens réviser, même 5 minutes comptent pour ta réussite.' } },
  { heures: 46, msg: { title: 'Ça fait 2 jours… 😢', body: 'Ne laisse pas tomber maintenant. Ta moyenne compte sur toi !' } },
];

export interface RappelsOptions {
  /** Si l'élève a déjà étudié aujourd'hui, on n'envoie pas le rappel de série du soir. */
  aEtudieAujourdhui?: boolean;
}

/** Message du jour : tourne au fil des jours pour ne jamais répéter la veille. */
function duJour(pool: Msg[]): Msg {
  const debutAnnee = new Date(new Date().getFullYear(), 0, 0).getTime();
  const jour = Math.floor((Date.now() - debutAnnee) / 86_400_000);
  return pool[jour % pool.length];
}

async function assurerCanal() {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('rappels', {
      name: 'Rappels de révision',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#6C63FF',
      sound: 'default',
    });
  }
}

async function assurerPermission(): Promise<boolean> {
  const actuelle = await Notifications.getPermissionsAsync();
  if (actuelle.granted) return true;
  const demande = await Notifications.requestPermissionsAsync();
  return demande.granted;
}

async function planifierQuotidien(id: string, [hour, minute]: [number, number], msg: Msg) {
  await Notifications.scheduleNotificationAsync({
    identifier: `rappel-${id}`,
    content: { title: msg.title, body: msg.body, sound: 'default' },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour, minute },
  });
}

async function planifierDate(id: string, date: Date, msg: Msg) {
  await Notifications.scheduleNotificationAsync({
    identifier: `inactif-${id}`,
    content: { title: msg.title, body: msg.body, sound: 'default' },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date },
  });
}

/**
 * (Re)programme TOUTES les relances. Idempotent : on annule d'abord. À appeler
 * à chaque ouverture de l'app (élève connecté) et après une session d'étude.
 */
export async function programmerRappels(opts: RappelsOptions = {}): Promise<boolean> {
  try {
    await assurerCanal();
    if (!(await assurerPermission())) return false;
    await Notifications.cancelAllScheduledNotificationsAsync();

    // 1) Rappels quotidiens à heures fixes (messages tournants).
    await planifierQuotidien('matin', HORAIRES.matin, duJour(POOLS.matin));
    await planifierQuotidien('midi', HORAIRES.midi, duJour(POOLS.midi));
    await planifierQuotidien('soir', HORAIRES.soir, duJour(POOLS.soir));

    // 2) Rappel de série du soir — seulement s'il n'a pas encore étudié aujourd'hui.
    if (!opts.aEtudieAujourdhui) {
      await planifierQuotidien('streak', HORAIRES.streak, duJour(POOLS.streak));
    }

    // 3) Relances d'inactivité, calculées depuis MAINTENANT. Reprogrammées à
    //    chaque ouverture → ne se déclenchent que si l'élève ne revient pas.
    for (let i = 0; i < INACTIVITE.length; i++) {
      const { heures, msg } = INACTIVITE[i];
      await planifierDate(`${i}`, new Date(Date.now() + heures * 3_600_000), msg);
    }

    await AsyncStorage.setItem('derniere_activite', String(Date.now()));
    return true;
  } catch (e) {
    console.log('[rappels] programmation échouée:', (e as Error)?.message);
    return false;
  }
}

/** Désactive toutes les relances (réglage « ne plus me harceler »). */
export async function annulerRappels() {
  try { await Notifications.cancelAllScheduledNotificationsAsync(); } catch {}
}

/**
 * À appeler quand l'élève termine une session d'étude : marque l'activité du jour
 * et reprogramme (annule le rappel de série du soir, repousse l'inactivité).
 */
export async function signalerEtude() {
  await AsyncStorage.setItem('etude_du_jour', new Date().toDateString());
  await programmerRappels({ aEtudieAujourdhui: true });
}

/** Indique si l'élève a déjà étudié aujourd'hui (persisté localement). */
export async function aEtudieAujourdhui(): Promise<boolean> {
  return (await AsyncStorage.getItem('etude_du_jour')) === new Date().toDateString();
}

/** Notification de test immédiate (vérifier que tout fonctionne sur l'appareil). */
export async function notificationTest(secondes = 5) {
  await assurerCanal();
  if (!(await assurerPermission())) return false;
  await Notifications.scheduleNotificationAsync({
    content: { title: '🎯 EduTrack', body: 'Les notifications fonctionnent ! On va te faire réviser 😉', sound: 'default' },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: secondes },
  });
  return true;
}
