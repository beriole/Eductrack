import { View, Text, StyleSheet } from 'react-native';
import { colors, radius, spacing, shadow } from '@/src/theme';

export interface BarPoint { label: string; valeur: number | null }

/**
 * Petit graphe à barres sans dépendance. Réutilisé par le suivi parent et
 * le tableau de bord admin (inscriptions / revenus par semaine).
 */
export function MiniBarChart({
  data, hint, color = colors.primary, format = (v) => `${v}`, height = 96,
}: {
  data: BarPoint[]; hint?: string; color?: string;
  format?: (v: number) => string; height?: number;
}) {
  const max = Math.max(1, ...data.map((d) => d.valeur ?? 0));
  return (
    <View style={styles.card}>
      <View style={[styles.chart, { height: height + 30 }]}>
        {data.map((p, i) => {
          const v = p.valeur ?? 0;
          const h = v > 0 ? Math.max(4, (v / max) * height) : 2;
          return (
            <View key={i} style={styles.col}>
              <Text style={styles.val} numberOfLines={1}>{v ? format(v) : ''}</Text>
              <View style={[styles.bar, { height: h, backgroundColor: v > 0 ? color : colors.border }]} />
              <Text style={styles.label}>{p.label}</Text>
            </View>
          );
        })}
      </View>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, borderWidth: 1, borderColor: colors.border, ...shadow.sm },
  chart: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', paddingTop: 6 },
  col: { flex: 1, alignItems: 'center', justifyContent: 'flex-end' },
  bar: { width: 22, borderRadius: 6, marginTop: 4 },
  val: { fontSize: 9.5, fontWeight: '700', color: colors.textMuted, height: 13 },
  label: { fontSize: 10, color: colors.textLight, marginTop: 6, fontWeight: '600' },
  hint: { fontSize: 11.5, color: colors.textLight, textAlign: 'center', marginTop: 10 },
});
