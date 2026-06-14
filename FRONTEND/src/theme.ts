/**
 * Système de design SmartSchool — thème CLAIR moderne.
 * Surfaces blanches, fond gris très clair, accent indigo, ombres douces.
 * Pensé pour le confort de lecture (application d'études).
 */
import { Ionicons } from '@expo/vector-icons';

type IoniconName = keyof typeof Ionicons.glyphMap;

export const colors = {
  // Marque / accents
  primary: '#4F46E5',        // indigo 600
  primaryDark: '#4338CA',    // indigo 700
  primaryLight: '#EEF0FF',   // teinte indigo très claire (fonds d'icônes)
  accent: '#0EA5E9',         // sky 500
  emerald: '#10B981',
  amber: '#F59E0B',
  rose: '#F43F5E',
  violet: '#8B5CF6',

  // Surfaces
  bg: '#F6F7FB',             // fond général gris très clair
  surface: '#FFFFFF',
  surfaceAlt: '#F9FAFB',
  border: '#ECEEF3',
  borderStrong: '#E2E5EC',

  // Texte
  text: '#0F172A',           // slate 900
  textMuted: '#64748B',      // slate 500
  textLight: '#94A3B8',      // slate 400
  white: '#FFFFFF',

  // États
  success: '#10B981',
  danger: '#EF4444',
  warning: '#F59E0B',
  info: '#3B82F6',

  // Dégradés (composant GradientBox, rendu JS)
  gradientPrimary: ['#6366F1', '#4F46E5'] as const,
  gradientSky: ['#38BDF8', '#0EA5E9'] as const,
};

export const radius = {
  sm: 10,
  md: 14,
  lg: 18,
  xl: 24,
  full: 999,
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
};

/**
 * Identité visuelle par matière (couleur + icône Ionicons), partagée par les
 * écrans cours, sélection et planning. La clé est le `code` matière (ex. MATH).
 */
const SUBJECT_THEME: Record<string, { color: string; icon: IoniconName }> = {
  // ── Francophone (MINESEC) ──
  FRAN: { color: '#8B5CF6', icon: 'book' },
  ANGL: { color: '#14B8A6', icon: 'language' },
  MATH: { color: '#6366F1', icon: 'calculator' },
  SVT:  { color: '#10B981', icon: 'leaf' },
  PHY:  { color: '#3B82F6', icon: 'magnet' },
  CHI:  { color: '#06B6D4', icon: 'flask' },
  PCT:  { color: '#0EA5E9', icon: 'flask' },
  HG:   { color: '#F59E0B', icon: 'earth' },
  HIS:  { color: '#F59E0B', icon: 'time' },
  GEO:  { color: '#EF4444', icon: 'earth' },
  ECM:  { color: '#F43F5E', icon: 'people' },
  PHIL: { color: '#D97706', icon: 'bulb' },
  ECO:  { color: '#22C55E', icon: 'stats-chart' },
  INFO: { color: '#0EA5E9', icon: 'code-slash' },
  ESP:  { color: '#E11D48', icon: 'language' },
  ALL:  { color: '#7C3AED', icon: 'language' },
  EPS:  { color: '#16A34A', icon: 'barbell' },
  // ── Anglophone (GCE Board) ──
  ENG:      { color: '#14B8A6', icon: 'language' },
  LITE:     { color: '#A855F7', icon: 'library' },
  FRE:      { color: '#8B5CF6', icon: 'book' },
  MATH_EN:  { color: '#6366F1', icon: 'calculator' },
  FMATH_EN: { color: '#4338CA', icon: 'calculator' },
  BIO:      { color: '#10B981', icon: 'leaf' },
  CHEM:     { color: '#06B6D4', icon: 'flask' },
  PHY_EN:   { color: '#3B82F6', icon: 'magnet' },
  CSC:      { color: '#0EA5E9', icon: 'code-slash' },
  HIST:     { color: '#F59E0B', icon: 'time' },
  GEOG:     { color: '#EF4444', icon: 'earth' },
  ECON:     { color: '#22C55E', icon: 'stats-chart' },
  CITZ:     { color: '#F43F5E', icon: 'people' },
  COMM:     { color: '#0891B2', icon: 'cart' },
  ACCT:     { color: '#65A30D', icon: 'calculator' },
  RELS:     { color: '#9333EA', icon: 'heart' },
};

const FALLBACK_SUBJECT: { color: string; icon: IoniconName } = { color: '#64748B', icon: 'library' };

/** Couleur de marque associée au code matière (ex. 'MATH' → indigo). */
export function subjectColor(code?: string): string {
  if (!code) return FALLBACK_SUBJECT.color;
  return (SUBJECT_THEME[code.toUpperCase()] ?? FALLBACK_SUBJECT).color;
}

/** Nom d'icône Ionicons associé au code matière (ex. 'SVT' → 'leaf'). */
export function subjectIconName(code?: string): IoniconName {
  if (!code) return FALLBACK_SUBJECT.icon;
  return (SUBJECT_THEME[code.toUpperCase()] ?? FALLBACK_SUBJECT).icon;
}

/** Ombres douces (iOS + Android), discrètes pour un rendu clair épuré. */
export const shadow = {
  sm: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  md: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },
  lg: {
    shadowColor: '#4F46E5',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 18,
    elevation: 6,
  },
};
