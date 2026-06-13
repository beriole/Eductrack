import { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '@/src/store/authStore';
import { api } from '@/src/lib/api';
import { colors, radius, spacing, shadow } from '@/src/theme';

interface Stats {
  nb_cours: number; nb_cours_publies: number; nb_epreuves: number;
  total_vues: number; total_sessions_etudiants: number; total_gains: number; taux_remuneration: number;
}
interface Data {
  stats: Stats;
  top_cours: Array<{ id_cours: string; titre: string; matiere_nom: string; nb_vues: number; statut: string }>;
  epreuves_recentes: Array<{ id_epreuve: string; titre: string; matiere_nom: string; niveau: string }>;
}
type IconName = keyof typeof Ionicons.glyphMap;

export function TeacherHome() {
  const router = useRouter();
  const { user } = useAuthStore();
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async () => {
    try { const r = await api.get('/enseignant/dashboard/'); setData(r.data); } catch {}
  }, []);

  useFocusEffect(useCallback(() => { fetchData().finally(() => setLoading(false)); }, [fetchData]));

  const onRefresh = async () => { setRefreshing(true); await fetchData(); setRefreshing(false); };

  if (loading) return <View style={styles.centered}><ActivityIndicator size="large" color={colors.primary} /></View>;

  const s = data?.stats;
  const h = new Date().getHours();
  const salut = h < 5 ? 'Bonne nuit' : h < 12 ? 'Bonjour' : h < 18 ? 'Bon après-midi' : 'Bonsoir';

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scroll}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
    >
      {/* Header + cloche (comme l'élève) */}
      <View style={styles.header}>
        <View style={styles.avatar}><Text style={styles.avatarText}>{(user?.prenom?.[0] ?? '?').toUpperCase()}</Text></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.greeting}>{salut}, {user?.prenom} 👋</Text>
          <Text style={styles.subtitle}>Espace enseignant</Text>
        </View>
        <TouchableOpacity style={styles.bell} onPress={() => router.push('/notifications')} activeOpacity={0.7}>
          <Ionicons name="notifications-outline" size={20} color={colors.text} />
        </TouchableOpacity>
      </View>

      {/* Stats */}
      <View style={styles.statsGrid}>
        <Stat icon="library" label="Cours" value={`${s?.nb_cours ?? 0}`} sub={`${s?.nb_cours_publies ?? 0} publiés`} color={colors.primary} />
        <Stat icon="documents" label="Épreuves" value={`${s?.nb_epreuves ?? 0}`} color={colors.emerald} />
        <Stat icon="eye" label="Vues totales" value={`${s?.total_vues ?? 0}`} color={colors.amber} />
        <Stat icon="people" label="Sessions élèves" value={`${s?.total_sessions_etudiants ?? 0}`} color={colors.info} />
      </View>

      {/* Accès aux retours des élèves */}
      <TouchableOpacity style={styles.retoursCard} onPress={() => router.push('/enseignant/retours' as any)} activeOpacity={0.85}>
        <View style={styles.retoursIcon}><Ionicons name="chatbubbles" size={20} color={colors.primary} /></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.retoursTitle}>Retours des élèves</Text>
          <Text style={styles.retoursSub}>Notes, avis et favoris sur tes contenus</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textLight} />
      </TouchableOpacity>

      {(s?.total_gains ?? 0) > 0 && (
        <View style={styles.gains}>
          <Text style={styles.gainsLabel}>Gains cumulés</Text>
          <Text style={styles.gainsAmount}>{s?.total_gains?.toLocaleString()} FCFA</Text>
        </View>
      )}

      {/* Top cours */}
      {(data?.top_cours?.length ?? 0) > 0 && (
        <Section title="Cours les plus vus">
          {data!.top_cours.map((c) => (
            <View key={c.id_cours} style={styles.row}>
              <View style={[styles.dot, { backgroundColor: c.statut === 'publie' ? colors.success : colors.textLight }]} />
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle} numberOfLines={1}>{c.titre}</Text>
                <Text style={styles.rowSub}>{c.matiere_nom} · {c.nb_vues} vues</Text>
              </View>
            </View>
          ))}
        </Section>
      )}

      {/* Épreuves récentes */}
      {(data?.epreuves_recentes?.length ?? 0) > 0 && (
        <Section title="Épreuves récentes">
          {data!.epreuves_recentes.map((e) => (
            <View key={e.id_epreuve} style={styles.row}>
              <View style={[styles.dot, { backgroundColor: colors.primary }]} />
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle} numberOfLines={1}>{e.titre}</Text>
                <Text style={styles.rowSub}>{e.matiere_nom} · {e.niveau}</Text>
              </View>
            </View>
          ))}
        </Section>
      )}

      <View style={{ height: 24 }} />
    </ScrollView>
  );
}

function Stat({ icon, label, value, sub, color }: { icon: IconName; label: string; value: string; sub?: string; color: string }) {
  return (
    <View style={styles.statCard}>
      <View style={[styles.statIcon, { backgroundColor: `${color}15` }]}><Ionicons name={icon} size={16} color={color} /></View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
      {sub ? <Text style={styles.statSub}>{sub}</Text> : null}
    </View>
  );
}
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.bg },
  scroll: { paddingTop: 56, paddingBottom: 16 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, marginBottom: 18 },
  avatar: { width: 44, height: 44, borderRadius: 14, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', ...shadow.md },
  avatarText: { color: colors.white, fontSize: 18, fontWeight: '800' },
  greeting: { fontSize: 19, fontWeight: '800', color: colors.text, letterSpacing: -0.3 },
  subtitle: { fontSize: 13, color: colors.textMuted, marginTop: 1 },
  bell: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', ...shadow.sm },

  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16, justifyContent: 'space-between', rowGap: 10 },
  statCard: { width: '48.5%', backgroundColor: colors.surface, borderRadius: radius.lg, padding: 14, borderWidth: 1, borderColor: colors.border, ...shadow.sm },
  statIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  statValue: { fontSize: 22, fontWeight: '800', color: colors.text, letterSpacing: -0.5 },
  statLabel: { fontSize: 12, color: colors.textMuted, fontWeight: '500', marginTop: 1 },
  statSub: { fontSize: 11, color: colors.textLight, marginTop: 1 },

  retoursCard: { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 16, marginTop: 14, backgroundColor: colors.surface, borderRadius: radius.lg, padding: 14, borderWidth: 1, borderColor: colors.border, ...shadow.sm },
  retoursIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  retoursTitle: { fontSize: 14.5, fontWeight: '800', color: colors.text },
  retoursSub: { fontSize: 12, color: colors.textMuted, marginTop: 1 },

  gains: { marginHorizontal: 16, marginTop: 14, backgroundColor: '#FFF7ED', borderRadius: radius.lg, padding: 16, borderLeftWidth: 3, borderLeftColor: colors.amber },
  gainsLabel: { fontSize: 13, fontWeight: '700', color: '#92400E' },
  gainsAmount: { fontSize: 24, fontWeight: '900', color: '#D97706', marginTop: 2 },

  section: { backgroundColor: colors.surface, marginHorizontal: 16, marginTop: 16, borderRadius: radius.lg, padding: 16, ...shadow.sm },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: colors.text, marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 9 },
  dot: { width: 8, height: 8, borderRadius: 4, marginRight: 12 },
  rowTitle: { fontSize: 14, fontWeight: '700', color: colors.text },
  rowSub: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
});
