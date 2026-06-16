import { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '@/src/lib/api';
import { colors, radius, spacing, shadow } from '@/src/theme';

interface Enfant {
  id_utilisateur: string;
  nom: string;
  prenom: string;
  niveau_scolaire: string;
  region: string;
  score_global: number;
  streak_jours: number;
  points_gamification: number;
}

export default function EnfantsTab() {
  const router = useRouter();
  const [enfants, setEnfants] = useState<Enfant[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchEnfants = useCallback(async () => {
    try {
      const res = await api.get('/parents/enfants/');
      setEnfants(res.data.results ?? res.data);
    } catch {}
  }, []);

  useFocusEffect(useCallback(() => { fetchEnfants().finally(() => setLoading(false)); }, [fetchEnfants]));
  const onRefresh = async () => { setRefreshing(true); await fetchEnfants(); setRefreshing(false); };

  if (loading) {
    return <View style={styles.centered}><ActivityIndicator size="large" color={colors.primary} /></View>;
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Mes enfants</Text>
        <Text style={styles.subtitle}>{enfants.length} enfant{enfants.length > 1 ? 's' : ''} suivi{enfants.length > 1 ? 's' : ''}</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        {enfants.length === 0 ? (
          <View style={styles.emptyContainer}>
            <View style={styles.emptyIcon}><Ionicons name="people-outline" size={40} color={colors.primary} /></View>
            <Text style={styles.emptyTitle}>Aucun enfant lié</Text>
            <Text style={styles.emptyText}>
              Demande à ton enfant son code de liaison (dans son profil), puis lie-le ici.
            </Text>
            <TouchableOpacity style={styles.linkBtn} onPress={() => router.push('/parent/lier')}>
              <Ionicons name="add-circle" size={18} color={colors.white} />
              <Text style={styles.linkBtnText}>Lier un enfant</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {enfants.map((enfant) => (
              <TouchableOpacity
                key={enfant.id_utilisateur}
                style={styles.card}
                activeOpacity={0.85}
                onPress={() => router.push(`/parent/enfant/${enfant.id_utilisateur}` as any)}
              >
                <View style={styles.cardHeader}>
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{(enfant.prenom?.[0] ?? '') + (enfant.nom?.[0] ?? '')}</Text>
                  </View>
                  <View style={styles.nameBlock}>
                    <Text style={styles.enfantName}>{enfant.prenom} {enfant.nom}</Text>
                    <Text style={styles.enfantSub}>{enfant.niveau_scolaire}{enfant.region ? ` · ${enfant.region}` : ''}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={colors.textLight} />
                </View>

                <View style={styles.statsRow}>
                  <StatBox label="Score" value={`${enfant.score_global}/100`} color={colors.primary} />
                  <StatBox label="Régularité" value={`${enfant.streak_jours}j`} color={colors.amber} />
                  <StatBox label="XP" value={`${enfant.points_gamification}`} color={colors.emerald} />
                </View>

                <View style={styles.gaugeContainer}>
                  <View style={styles.gaugeBar}>
                    <View style={[styles.gaugeFill, { width: `${enfant.score_global}%`, backgroundColor: scoreColor(enfant.score_global) }]} />
                  </View>
                  <Text style={styles.gaugeLabel}>{scoreLabel(enfant.score_global)}</Text>
                </View>

                <View style={styles.cta}>
                  <Ionicons name="stats-chart" size={15} color={colors.primary} />
                  <Text style={styles.ctaText}>Voir le suivi détaillé</Text>
                </View>
              </TouchableOpacity>
            ))}

            <TouchableOpacity style={styles.addRow} onPress={() => router.push('/parent/lier')} activeOpacity={0.85}>
              <Ionicons name="add-circle-outline" size={18} color={colors.primary} />
              <Text style={styles.addRowText}>Lier un autre enfant</Text>
            </TouchableOpacity>
          </>
        )}
        <View style={{ height: 24 }} />
      </ScrollView>
    </View>
  );
}

function StatBox({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={styles.statBox}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}
function scoreColor(s: number): string { return s >= 70 ? colors.success : s >= 40 ? colors.warning : colors.danger; }
function scoreLabel(s: number): string { return s >= 70 ? 'Excellent' : s >= 50 ? 'Bien' : s >= 30 ? 'Moyen' : 'À améliorer'; }

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.bg },
  header: { paddingHorizontal: spacing.md, paddingTop: 56, paddingBottom: spacing.sm },
  title: { fontSize: 28, fontWeight: '800', color: colors.text, letterSpacing: -0.5 },
  subtitle: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  scroll: { padding: spacing.md, gap: spacing.md },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, borderWidth: 1, borderColor: colors.border, ...shadow.md },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  avatar: { width: 50, height: 50, borderRadius: 25, backgroundColor: colors.primaryLight, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  avatarText: { fontSize: 17, fontWeight: '900', color: colors.primary },
  nameBlock: { flex: 1 },
  enfantName: { fontSize: 16, fontWeight: '800', color: colors.text },
  enfantSub: { fontSize: 12.5, color: colors.textMuted, marginTop: 2 },
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  statBox: { flex: 1, backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: 10, alignItems: 'center' },
  statValue: { fontSize: 18, fontWeight: '800' },
  statLabel: { fontSize: 11, color: colors.textLight, marginTop: 2, fontWeight: '600' },
  gaugeContainer: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  gaugeBar: { flex: 1, height: 8, backgroundColor: colors.border, borderRadius: 4, overflow: 'hidden' },
  gaugeFill: { height: '100%', borderRadius: 4 },
  gaugeLabel: { fontSize: 12, fontWeight: '700', color: colors.textMuted, width: 80, textAlign: 'right' },
  cta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: colors.primaryLight, borderRadius: radius.md, paddingVertical: 12 },
  ctaText: { color: colors.primary, fontWeight: '800', fontSize: 14 },
  addRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14 },
  addRowText: { color: colors.primary, fontWeight: '700', fontSize: 14 },
  emptyContainer: { padding: spacing.xl, alignItems: 'center', marginTop: 30 },
  emptyIcon: { width: 84, height: 84, borderRadius: 42, backgroundColor: colors.primaryLight, justifyContent: 'center', alignItems: 'center', marginBottom: 18 },
  emptyTitle: { fontSize: 20, fontWeight: '800', color: colors.text, marginBottom: 8 },
  emptyText: { fontSize: 14, color: colors.textMuted, textAlign: 'center', lineHeight: 22, marginBottom: 24 },
  linkBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: 14, paddingHorizontal: 28, ...shadow.md },
  linkBtnText: { color: colors.white, fontWeight: '800', fontSize: 15 },
});
