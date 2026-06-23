import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GradientBox } from './GradientBox';
import { colors, radius, spacing } from '@/src/theme';

type IconName = keyof typeof Ionicons.glyphMap;

/** En-tête dégradé arrondi, cohérent avec les autres rôles (parent, admin…). */
export function GradientHeader({ title, subtitle, icon, right }: {
  title: string; subtitle?: string; icon?: IconName; right?: React.ReactNode;
}) {
  return (
    <GradientBox colors={colors.gradientPrimary} style={styles.header}>
      <View style={styles.row}>
        {icon ? (
          <View style={styles.iconWrap}><Ionicons name={icon} size={22} color="#fff" /></View>
        ) : null}
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
        {right}
      </View>
    </GradientBox>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingTop: 56, paddingBottom: 18, paddingHorizontal: spacing.lg,
    borderBottomLeftRadius: radius.xl, borderBottomRightRadius: radius.xl,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconWrap: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 26, fontWeight: '800', color: '#fff', letterSpacing: -0.5 },
  subtitle: { fontSize: 13, color: 'rgba(255,255,255,0.85)', marginTop: 2 },
});
