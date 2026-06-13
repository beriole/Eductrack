import { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '@/src/store/authStore';
import { api } from '@/src/lib/api';

interface EnseignantStats {
  nb_cours: number;
  nb_cours_publies: number;
  nb_epreuves: number;
  total_vues: number;
  total_sessions_etudiants: number;
  taux_remuneration: number;
  total_gains: number;
}

interface Cours {
  id_cours: string;
  titre: string;
  matiere_nom: string;
  nb_vues: number;
  statut: string;
}

interface Epreuve {
  id_epreuve: string;
  titre: string;
  matiere_nom: string;
  niveau: string;
}

interface DashboardData {
  stats: EnseignantStats;
  top_cours: Cours[];
  epreuves_recentes: Epreuve[];
}

export default function EnseignantDashboard() {
  const router = useRouter();
  const { user } = useAuthStore();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = async () => {
    try {
      const res = await api.get('/enseignant/dashboard/');
      setData(res.data);
    } catch {}
  };

  useEffect(() => {
    fetchData().finally(() => setLoading(false));
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  };

  if (loading) {
    return <View style={styles.centered}><ActivityIndicator size="large" color="#6C63FF" /></View>;
  }

  const stats = data?.stats;

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#6C63FF" />}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backRow}>
          <Ionicons name="arrow-back" size={18} color="#93C5FD" />
          <Text style={styles.backText}>Retour</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Espace Enseignant</Text>
        <Text style={styles.subtitle}>{user?.prenom} {user?.nom}</Text>
      </View>

      {/* Espace de travail */}
      <Text style={styles.workTitle}>Espace de travail</Text>
      <View style={styles.workGrid}>
        <WorkCard icon="library" color="#6C63FF" title="Mes cours" sub="Créer & gérer" onPress={() => router.push('/enseignant/cours' as any)} />
        <WorkCard icon="documents" color="#10B981" title="Mes examens" sub="Sujets & corrigés" onPress={() => router.push('/enseignant/examens' as any)} />
        <WorkCard icon="barbell" color="#F43F5E" title="Mes exercices" sub="Créer & corriger" onPress={() => router.push('/enseignant/exercices' as any)} />
        <WorkCard icon="sparkles" color="#F59E0B" title="Bibliothèque IA" sub="Analyse & génération" onPress={() => router.push('/enseignant/importer')} />
      </View>

      {/* Stats */}
      <View style={styles.statsGrid}>
        <StatCard label="Cours créés" value={`${stats?.nb_cours ?? 0}`} sub={`${stats?.nb_cours_publies ?? 0} publiés`} color="#6C63FF" />
        <StatCard label="Épreuves" value={`${stats?.nb_epreuves ?? 0}`} color="#10B981" />
        <StatCard label="Vues totales" value={`${stats?.total_vues ?? 0}`} color="#F59E0B" />
        <StatCard label="Sessions élèves" value={`${stats?.total_sessions_etudiants ?? 0}`} color="#3B82F6" />
      </View>

      {/* Gains (si > 0) */}
      {(stats?.total_gains ?? 0) > 0 && (
        <View style={styles.gainsCard}>
          <Text style={styles.gainsTitle}>Gains cumulés</Text>
          <Text style={styles.gainsAmount}>{stats?.total_gains?.toLocaleString()} FCFA</Text>
          <Text style={styles.gainsSub}>Taux : {stats?.taux_remuneration}%</Text>
        </View>
      )}

      {/* Top cours */}
      {(data?.top_cours?.length ?? 0) > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionTitleRow}>
            <Ionicons name="book" size={16} color="#1E3A5F" />
            <Text style={styles.sectionTitle}>Cours les plus vus</Text>
          </View>
          {data!.top_cours.map((cours) => (
            <View key={cours.id_cours} style={styles.listItem}>
              <View style={[styles.dot, { backgroundColor: cours.statut === 'publie' ? '#10B981' : '#9CA3AF' }]} />
              <View style={styles.listContent}>
                <Text style={styles.listTitle} numberOfLines={1}>{cours.titre}</Text>
                <Text style={styles.listSub}>{cours.matiere_nom} · {cours.nb_vues} vues</Text>
              </View>
              <View style={[styles.statutBadge, { backgroundColor: cours.statut === 'publie' ? '#D1FAE5' : '#F3F4F6' }]}>
                <Text style={[styles.statutText, { color: cours.statut === 'publie' ? '#059669' : '#6B7280' }]}>
                  {cours.statut}
                </Text>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Épreuves récentes */}
      {(data?.epreuves_recentes?.length ?? 0) > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionTitleRow}>
            <Ionicons name="create" size={16} color="#1E3A5F" />
            <Text style={styles.sectionTitle}>Épreuves récentes</Text>
          </View>
          {data!.epreuves_recentes.map((ep) => (
            <View key={ep.id_epreuve} style={styles.listItem}>
              <View style={[styles.dot, { backgroundColor: '#6C63FF' }]} />
              <View style={styles.listContent}>
                <Text style={styles.listTitle} numberOfLines={1}>{ep.titre}</Text>
                <Text style={styles.listSub}>{ep.matiere_nom} · {ep.niveau}</Text>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* État vide */}
      {!data?.top_cours?.length && !data?.epreuves_recentes?.length && (
        <View style={styles.emptyState}>
          <Ionicons name="library-outline" size={52} color="#9CA3AF" style={styles.emptyIcon} />
          <Text style={styles.emptyTitle}>Aucun contenu encore</Text>
          <Text style={styles.emptySub}>
            Créez votre premier cours ou épreuve via l'interface web pour voir vos statistiques ici.
          </Text>
        </View>
      )}

      <View style={{ height: 32 }} />
    </ScrollView>
  );
}

function WorkCard({
  icon, color, title, sub, onPress,
}: { icon: keyof typeof Ionicons.glyphMap; color: string; title: string; sub: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.workCard} activeOpacity={0.85} onPress={onPress}>
      <View style={[styles.workIcon, { backgroundColor: `${color}18` }]}>
        <Ionicons name={icon} size={22} color={color} />
      </View>
      <Text style={styles.workCardTitle}>{title}</Text>
      <Text style={styles.workCardSub}>{sub}</Text>
    </TouchableOpacity>
  );
}

function StatCard({
  label, value, sub, color,
}: { label: string; value: string; sub?: string; color: string }) {
  return (
    <View style={[styles.statCard, { borderTopColor: color }]}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
      {sub && <Text style={styles.statSub}>{sub}</Text>}
    </View>
  );
}

const PRIMARY = '#1E3A5F';

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { backgroundColor: PRIMARY, paddingTop: 56, paddingBottom: 20, paddingHorizontal: 20 },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 12 },
  backText: { color: '#93C5FD', fontWeight: '600', fontSize: 14 },
  title: { fontSize: 22, fontWeight: '800', color: '#fff' },
  subtitle: { fontSize: 13, color: '#93C5FD', marginTop: 4 },
  workTitle: { fontSize: 15, fontWeight: '800', color: '#1E3A5F', marginHorizontal: 16, marginTop: 16, marginBottom: 10 },
  workGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 12, gap: 8, justifyContent: 'space-between' },
  workCard: { width: '48%', backgroundColor: '#fff', borderRadius: 16, padding: 14, marginBottom: 8, elevation: 1, shadowColor: '#0F172A', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4 },
  workIcon: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  workCardTitle: { fontSize: 14.5, fontWeight: '800', color: '#1E3A5F' },
  workCardSub: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 12, paddingTop: 16, gap: 8 },
  statsSectionTitle: { fontSize: 15, fontWeight: '800', color: '#1E3A5F', marginHorizontal: 16, marginTop: 6 },
  statCard: { flex: 1, minWidth: '45%', backgroundColor: '#fff', borderRadius: 12, padding: 14, borderTopWidth: 3, elevation: 1 },
  statValue: { fontSize: 22, fontWeight: '800', marginBottom: 2 },
  statLabel: { fontSize: 12, color: '#6B7280', fontWeight: '500' },
  statSub: { fontSize: 11, color: '#9CA3AF', marginTop: 2 },
  gainsCard: {
    marginHorizontal: 16, marginBottom: 8,
    backgroundColor: '#FFF7ED', borderRadius: 14, padding: 16,
    borderLeftWidth: 4, borderLeftColor: '#F59E0B',
  },
  gainsTitle: { fontSize: 13, fontWeight: '700', color: '#92400E', marginBottom: 4 },
  gainsAmount: { fontSize: 26, fontWeight: '900', color: '#D97706' },
  gainsSub: { fontSize: 12, color: '#92400E', marginTop: 4 },
  section: { backgroundColor: '#fff', marginHorizontal: 16, marginBottom: 12, borderRadius: 14, padding: 16, elevation: 1 },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: PRIMARY },
  listItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F9FAFB' },
  dot: { width: 8, height: 8, borderRadius: 4, marginRight: 12, flexShrink: 0 },
  listContent: { flex: 1 },
  listTitle: { fontSize: 14, fontWeight: '600', color: '#111827' },
  listSub: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  statutBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  statutText: { fontSize: 11, fontWeight: '600' },
  emptyState: { alignItems: 'center', paddingVertical: 48, paddingHorizontal: 32 },
  emptyIcon: { marginBottom: 12 },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: PRIMARY, marginBottom: 8 },
  emptySub: { fontSize: 14, color: '#6B7280', textAlign: 'center', lineHeight: 22 },
});
