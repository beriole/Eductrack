/**
 * Dictionnaire de traductions FR / EN.
 * Clés organisées par domaine. Utilisées via le hook useI18n().t('cle').
 */
export type Lang = 'fr' | 'en';

export const translations = {
  fr: {
    // ── Commun ──
    'common.loading': 'Chargement…',
    'common.save': 'Enregistrer',
    'common.cancel': 'Annuler',
    'common.back': '← Retour',
    'common.retry': 'Réessayer',
    'common.error': 'Erreur',
    'common.success': 'Succès',
    'common.seeAll': 'Voir tout →',
    'common.required': 'Ce champ est requis',

    // ── Authentification ──
    'auth.login.title': 'Connexion',
    'auth.login.subtitle': 'Heureux de te revoir !',
    'auth.login.email': 'Adresse email',
    'auth.login.password': 'Mot de passe',
    'auth.login.submit': 'Se connecter',
    'auth.login.noAccount': "Pas encore de compte ?",
    'auth.login.register': "S'inscrire",
    'auth.login.forgot': 'Mot de passe oublié ?',

    // ── Dashboard ──
    'dashboard.greeting': 'Bonjour',
    'dashboard.subtitle': "Prêt à travailler aujourd'hui ?",
    'dashboard.parentSpace': 'Espace parent',
    'dashboard.stat.score': 'Score global',
    'dashboard.stat.xp': 'Points XP',
    'dashboard.stat.sessions': 'Sessions',
    'dashboard.stat.success': 'Réussite',
    'dashboard.shortcut.focus': 'Focus',
    'dashboard.shortcut.planning': 'Planning',
    'dashboard.shortcut.diagnostic': 'Diagnostic',
    'dashboard.shortcut.notifs': 'Notifs',
    'dashboard.shortcut.top': 'Top',
    'dashboard.shortcut.chatbot': 'EduBot',
    'dashboard.coursRecents': 'Cours récents',
    'dashboard.lacunes': 'Lacunes à travailler',
    'dashboard.sessionsRecentes': 'Dernières sessions',
    'dashboard.empty.title': 'Tout est prêt !',
    'dashboard.empty.sub': 'Commence une épreuve pour voir tes statistiques ici.',

    // ── Profil ──
    'profil.account': 'Informations du compte',
    'profil.edit': 'Modifier le profil',
    'profil.editBtn': 'Modifier',
    'profil.quickAccess': 'Accès rapide',
    'profil.language': 'Langue',
    'profil.logout': 'Se déconnecter',
    'profil.logoutConfirm': 'Êtes-vous sûr ?',
    'profil.field.firstName': 'Prénom',
    'profil.field.lastName': 'Nom',
    'profil.field.phone': 'Téléphone',
    'profil.field.city': 'Ville',
    'profil.field.school': 'Établissement',
    'profil.link.notifications': 'Notifications',
    'profil.link.focus': 'Session Focus (Pomodoro)',
    'profil.link.planning': "Planning d'études",
    'profil.link.diagnostic': 'Test de diagnostic',
    'profil.link.classement': 'Classement',
    'profil.link.abonnement': 'Abonnements',
    'profil.link.children': 'Suivi de mes enfants',
    'profil.saved': 'Profil mis à jour.',

    // ── Langue ──
    'lang.fr': 'Français',
    'lang.en': 'Anglais',
    'lang.changed': 'Langue changée en Français',
  },
  en: {
    // ── Common ──
    'common.loading': 'Loading…',
    'common.save': 'Save',
    'common.cancel': 'Cancel',
    'common.back': '← Back',
    'common.retry': 'Retry',
    'common.error': 'Error',
    'common.success': 'Success',
    'common.seeAll': 'See all →',
    'common.required': 'This field is required',

    // ── Authentication ──
    'auth.login.title': 'Sign in',
    'auth.login.subtitle': 'Glad to see you again!',
    'auth.login.email': 'Email address',
    'auth.login.password': 'Password',
    'auth.login.submit': 'Sign in',
    'auth.login.noAccount': "Don't have an account?",
    'auth.login.register': 'Sign up',
    'auth.login.forgot': 'Forgot password?',

    // ── Dashboard ──
    'dashboard.greeting': 'Hello',
    'dashboard.subtitle': 'Ready to study today?',
    'dashboard.parentSpace': 'Parent area',
    'dashboard.stat.score': 'Overall score',
    'dashboard.stat.xp': 'XP points',
    'dashboard.stat.sessions': 'Sessions',
    'dashboard.stat.success': 'Success rate',
    'dashboard.shortcut.focus': 'Focus',
    'dashboard.shortcut.planning': 'Planner',
    'dashboard.shortcut.diagnostic': 'Diagnostic',
    'dashboard.shortcut.notifs': 'Alerts',
    'dashboard.shortcut.top': 'Top',
    'dashboard.shortcut.chatbot': 'EduBot',
    'dashboard.coursRecents': 'Recent lessons',
    'dashboard.lacunes': 'Gaps to work on',
    'dashboard.sessionsRecentes': 'Latest sessions',
    'dashboard.empty.title': 'All set!',
    'dashboard.empty.sub': 'Start a test to see your statistics here.',

    // ── Profile ──
    'profil.account': 'Account information',
    'profil.edit': 'Edit profile',
    'profil.editBtn': 'Edit',
    'profil.quickAccess': 'Quick access',
    'profil.language': 'Language',
    'profil.logout': 'Log out',
    'profil.logoutConfirm': 'Are you sure?',
    'profil.field.firstName': 'First name',
    'profil.field.lastName': 'Last name',
    'profil.field.phone': 'Phone',
    'profil.field.city': 'City',
    'profil.field.school': 'School',
    'profil.link.notifications': 'Notifications',
    'profil.link.focus': 'Focus session (Pomodoro)',
    'profil.link.planning': 'Study planner',
    'profil.link.diagnostic': 'Diagnostic test',
    'profil.link.classement': 'Leaderboard',
    'profil.link.abonnement': 'Subscriptions',
    'profil.link.children': 'My children tracking',
    'profil.saved': 'Profile updated.',

    // ── Language ──
    'lang.fr': 'French',
    'lang.en': 'English',
    'lang.changed': 'Language changed to English',
  },
} as const;

export type TranslationKey = keyof typeof translations.fr;
