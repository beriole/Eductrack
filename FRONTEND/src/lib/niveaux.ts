/**
 * Niveaux scolaires par sous-système du programme camerounais.
 * Partagé par l'inscription et les écrans enseignant (import / création).
 */
export type Systeme = 'francophone' | 'anglophone';

export const SYSTEMES = [
  { key: 'francophone', label: 'Francophone' },
  { key: 'anglophone', label: 'Anglophone' },
] as const;

// { v: valeur backend, l: libellé affiché }
export const NIVEAUX_FR = [
  { v: '6e', l: '6e' }, { v: '5e', l: '5e' }, { v: '4e', l: '4e' }, { v: '3e', l: '3e' },
  { v: '2nde', l: '2nde' }, { v: '1ere', l: '1ère' }, { v: 'Tle', l: 'Tle' },
];

export const NIVEAUX_EN = [
  { v: 'Form1', l: 'Form 1' }, { v: 'Form2', l: 'Form 2' }, { v: 'Form3', l: 'Form 3' },
  { v: 'Form4', l: 'Form 4' }, { v: 'Form5', l: 'Form 5' },
  { v: 'LowerSixth', l: 'Lower Sixth' }, { v: 'UpperSixth', l: 'Upper Sixth' },
];

export function niveauxFor(systeme: Systeme) {
  return systeme === 'anglophone' ? NIVEAUX_EN : NIVEAUX_FR;
}
