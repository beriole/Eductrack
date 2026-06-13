import { View, ViewStyle, StyleProp } from 'react-native';
import { ReactNode } from 'react';

interface Props {
  /** Dégradé [debut, ..., fin]. On utilise la couleur finale comme base
   *  et la première comme halo lumineux pour un effet « mesh » premium. */
  colors: readonly string[];
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
}

/**
 * Remplacement 100% JS de LinearGradient (aucun module natif).
 * Rendu : couleur de base riche + deux halos translucides superposés
 * qui donnent une impression de dégradé diagonal moderne.
 */
export function GradientBox({ colors, style, children }: Props) {
  const base = colors[colors.length - 1];
  const glow = colors[0];

  return (
    <View style={[{ backgroundColor: base, overflow: 'hidden' }, style]}>
      {/* Halo haut-gauche (couleur de début) */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute', top: -120, left: -80,
          width: 360, height: 360, borderRadius: 180,
          backgroundColor: glow, opacity: 0.55,
        }}
      />
      {/* Halo bas-droite plus doux */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute', bottom: -140, right: -100,
          width: 320, height: 320, borderRadius: 160,
          backgroundColor: glow, opacity: 0.25,
        }}
      />
      {/* Voile sombre pour unifier et garder le texte lisible */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: base, opacity: 0.25,
        }}
      />
      {children}
    </View>
  );
}
