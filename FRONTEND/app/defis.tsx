import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl, Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '@/src/lib/api';
import { colors, radius, spacing, shadow } from '@/src/theme';

type IconName = keyof typeof Ionicons.glyphMap;

interface Ligue {
  nom: string; couleur: string; icone: string; points: number;
  ligue_suivante: string | null; progression: number; xp_manquant: number;
}
interface Defi {
  code: string; titre: string; description: string; icone: string;
  periode: string; seuil: number; recompense_xp: number;
  progression: number; progression_reelle: number;
  complete: boolean; recompense_reclamee: boolean;
}

const PERIODE_LABEL: Record<string, string> = {
  quotidien: 'Quotidien', hebdomadaire: 'Cette semaine', permanent: 'Permanent',
};

export default function DefisScreen() {
  const router = useRouter();
  const [ligue, setLigue] = useState<Ligue | null>(null);
  const [defis, setDefis] = useState<Defi[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [claiming, setClaiming] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      const [l, d] = await Promise.all([
        api.get('/gamification/ligue/'),
        api.get('/gamification/defis/'),
      ]);
      setLigue(l.data);
      setDefis(d.data.defis ?? []);
    } catch {}
  }, []);

  useEffect(() => { fetchAll().finally(() => setLoading(false)); }, [fetchAll]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchAll();
    setRefreshing(false);
  };

  const reclamer = async (defi: Defi) => {
    setClaiming(defi.code);
    try {
      const res = await api.post(`/gamification/defis/${defi.code}/reclamer/`);
      Alert.alert('Bravo !', `+${res.data.xp_gagne} XP récupérés.`);
      await fetchAll();
    } catch (e: any) {
      Alert.alert('Oups', e?.response?.data?.error ?? 'Réclamation impossible.');
    } finally {
      setClaiming(null);
    }
  };

  if (loading) {
    return <View style={styles.centered}><ActivityIndicator size="large" color={colors.primary} /></View>;
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backRow}>
          <Ionicons name="arrow-back" size={20} color={colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Défis & Ligue</Text>
          <Text style={styles.subtitle}>Progresse et gagne des récompenses</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        {/* Ligue */}
        {ligue && (
          <View style={[styles.ligueCard, { borderColor: ligue.couleur }]}>
            <View style={[styles.ligueIcon, { backgroundColor: `${ligue.couleur}20` }]}>
              <Ionicons name={(ligue.icone as IconName) ?? 'shield'} size={30} color={ligue.couleur} />
            </View>
            <Text style={styles.ligueNom}>Ligue {ligue.nom}</Text>
            <Text style={styles.liguePts}>{ligue.points} XP</Text>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${ligue.progression}%`, backgroundColor: ligue.couleur }]} />
            </View>
            <Text style={styles.ligueNext}>
              {ligue.ligue_suivante
                ? `Encore ${ligue.xp_manquant} XP pour la ligue ${ligue.ligue_suivante}`
                : 'Tu as atteint la ligue maximale 🏆'}
            </Text>
          </View>
        )}

        <Text style={styles.sectionLabel}>Défis</Text>
        {defis.length === 0 ? (
          <Text style={styles.muted}>Aucun défi actif pour le moment.</Text>
        ) : (
          defis.map((d) => {
            const pct = Math.min(100, Math.round((d.progression / d.seuil) * 100));
            const claimable = d.complete && !d.recompense_reclamee;
            return (
              <View key={d.code} style={styles.defiCard}>
                <View style={styles.defiTop}>
                  <View style={[styles.defiIcon, { backgroundColor: claimable ? `${colors.amber}20` : colors.primaryLight }]}>
                    <Ionicons name={(d.icone as IconName) ?? 'flag'} size={20} color={claimable ? colors.amber : colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.defiTitle}>{d.titre}</Text>
                    <Text style={styles.defiDesc}>{d.description}</Text>
                  </View>
                  <View style={styles.xpTag}>
                    <Ionicons name="flash" size={12} color={colors.amber} />
                    <Text style={styles.xpText}>+{d.recompense_xp}</Text>
                  </View>
                </View>

                <View style={styles.progressRow}>
                  <View style={styles.progressTrackSm}>
                    <View style={[styles.progressFill, { width: `${pct}%`, backgroundColor: d.complete ? colors.success : colors.primary }]} />
                  </View>
                  <Text style={styles.progressText}>{Math.min(d.progression, d.seuil)}/{d.seuil}</Text>
                </View>

                <View style={styles.defiFooter}>
                  <View style={styles.periodeTag}>
                    <Text style={styles.periodeText}>{PERIODE_LABEL[d.periode] ?? d.periode}</Text>
                  </View>
                  {d.recompense_reclamee ? (
                    <View style={styles.doneTag}>
                      <Ionicons name="checkmark-circle" size={15} color={colors.success} />
                      <Text style={styles.doneText}>Récupéré</Text>
                    </View>
                  ) : claimable ? (
                    <TouchableOpacity style={styles.claimBtn} onPress={() => reclamer(d)} disabled={claiming === d.code} activeOpacity={0.85}>
                      {claiming === d.code
                        ? <ActivityIndicator size="small" color={colors.white} />
                        : <Text style={styles.claimText}>Récupérer la récompense</Text>}
                    </TouchableOpacity>
                  ) : (
                    <Text style={styles.inProgress}>En cours…</Text>
                  )}
                </View>
              </View>
            );
          })
        )}
        <View style={{ height: 24 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: spacing.md, paddingTop: 56, paddingBottom: 12 },
  backRow: { width: 38, height: 38, borderRadius: 12, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', ...shadow.sm },
  title: { fontSize: 22, fontWeight: '800', color: colors.text, letterSpacing: -0.4 },
  subtitle: { fontSize: 13, color: colors.textMuted, marginTop: 1 },
  scroll: { padding: spacing.md },

  ligueCard: { alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.xl, padding: 22, borderWidth: 1.5, marginBottom: 18, ...shadow.md },
  ligueIcon: { width: 64, height: 64, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  ligueNom: { fontSize: 20, fontWeight: '900', color: colors.text, letterSpacing: -0.3 },
  liguePts: { fontSize: 14, fontWeight: '700', color: colors.textMuted, marginTop: 2, marginBottom: 14 },
  progressTrack: { width: '100%', height: 8, backgroundColor: colors.border, borderRadius: 4, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 4 },
  ligueNext: { fontSize: 12.5, color: colors.textMuted, fontWeight: '600', marginTop: 10, textAlign: 'center' },

  sectionLabel: { fontSize: 13, fontWeight: '800', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
  muted: { color: colors.textLight, fontSize: 13 },

  defiCard: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, marginBottom: 12, ...shadow.sm },
  defiTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  defiIcon: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  defiTitle: { fontSize: 15, fontWeight: '800', color: colors.text },
  defiDesc: { fontSize: 12.5, color: colors.textMuted, marginTop: 2, lineHeight: 17 },
  xpTag: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: `${colors.amber}15`, paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.full },
  xpText: { fontSize: 12, fontWeight: '800', color: colors.amber },

  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14 },
  progressTrackSm: { flex: 1, height: 7, backgroundColor: colors.border, borderRadius: 4, overflow: 'hidden' },
  progressText: { fontSize: 12, fontWeight: '800', color: colors.textMuted, minWidth: 38, textAlign: 'right' },

  defiFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 },
  periodeTag: { backgroundColor: colors.surfaceAlt, paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.full },
  periodeText: { fontSize: 11, fontWeight: '700', color: colors.textMuted },
  claimBtn: { backgroundColor: colors.primary, paddingHorizontal: 16, paddingVertical: 9, borderRadius: radius.md, ...shadow.sm },
  claimText: { color: colors.white, fontWeight: '800', fontSize: 13 },
  doneTag: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  doneText: { fontSize: 13, fontWeight: '700', color: colors.success },
  inProgress: { fontSize: 13, fontWeight: '600', color: colors.textLight },
});
