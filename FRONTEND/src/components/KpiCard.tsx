import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing, shadow } from '@/src/theme';

type IconName = keyof typeof Ionicons.glyphMap;

/** Tuile KPI réutilisable : icône teintée + valeur + libellé (+ tendance optionnelle). */
export function KpiCard({
  icon, label, value, color = colors.primary, delta, suffix,
}: {
  icon: IconName; label: string; value: string | number; color?: string;
  delta?: number | null; suffix?: string;
}) {
  const up = delta != null && delta > 0;
  return (
    <View style={styles.card}>
      <View style={[styles.icon, { backgroundColor: `${color}15` }]}>
        <Ionicons name={icon} size={18} color={color} />
      </View>
      <Text style={styles.value}>{value}{suffix ? <Text style={styles.suffix}>{suffix}</Text> : null}</Text>
      <View style={styles.labelRow}>
        <Text style={styles.label} numberOfLines={1}>{label}</Text>
        {delta != null && delta !== 0 ? (
          <View style={styles.delta}>
            <Ionicons name={up ? 'arrow-up' : 'arrow-down'} size={11} color={up ? colors.success : colors.danger} />
            <Text style={[styles.deltaText, { color: up ? colors.success : colors.danger }]}>{Math.abs(delta)}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '47.5%', flexGrow: 1, backgroundColor: colors.surface, borderRadius: radius.lg,
    padding: 14, borderWidth: 1, borderColor: colors.border, ...shadow.sm,
  },
  icon: { width: 34, height: 34, borderRadius: 10, justifyContent: 'center', alignItems: 'center', marginBottom: 10 },
  value: { fontSize: 20, fontWeight: '800', color: colors.text, letterSpacing: -0.5 },
  suffix: { fontSize: 12, fontWeight: '700', color: colors.textMuted },
  labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 },
  label: { fontSize: 12, color: colors.textMuted, fontWeight: '600', flex: 1 },
  delta: { flexDirection: 'row', alignItems: 'center', gap: 1 },
  deltaText: { fontSize: 11.5, fontWeight: '800' },
});
