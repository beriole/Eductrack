import { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl, Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '@/src/lib/api';

interface Enfant {
  id_utilisateur: string;
  nom: string;
  prenom: string;
  niveau_scolaire: string;
  region: string;
  score_global: number;
  streak_jours: number;
  points_gamification: number;
  email: string;
}

export default function ParentDashboardScreen() {
  const router = useRouter();
  const [enfants, setEnfants] = useState<Enfant[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [generatingFor, setGeneratingFor] = useState<string | null>(null);

  const fetchEnfants = async () => {
    try {
      const res = await api.get('/parents/enfants/');
      setEnfants(res.data.results ?? res.data);
    } catch {}
  };

  useEffect(() => {
    fetchEnfants().finally(() => setLoading(false));
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchEnfants();
    setRefreshing(false);
  };

  const genererRapport = async (enfantId: string, prenom: string) => {
    setGeneratingFor(enfantId);
    try {
      const res = await api.post('/parents/rapports/generer/', { enfant_id: enfantId });
      Alert.alert(
        'Rapport généré',
        `Le rapport de ${prenom} pour les 7 derniers jours est disponible.\n\n`
        + `Moyenne : ${res.data.rapport.moyenne_globale}/100\n`
        + `Sessions : ${res.data.rapport.nb_sessions}`,
      );
    } catch (e: any) {
      const msg = e?.response?.data?.message ?? 'Erreur lors de la génération.';
      Alert.alert('Info', msg);
    } finally {
      setGeneratingFor(null);
    }
  };

  if (loading) {
    return <View style={styles.centered}><ActivityIndicator size="large" color="#6C63FF" /></View>;
  }

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
        <Text style={styles.headerTitle}>Suivi de mes enfants</Text>
        <Text style={styles.headerSub}>{enfants.length} enfant{enfants.length > 1 ? 's' : ''} lié{enfants.length > 1 ? 's' : ''}</Text>
        <TouchableOpacity style={styles.addBtn} onPress={() => router.push('/parent/lier')} activeOpacity={0.85}>
          <Ionicons name="add-circle" size={18} color="#fff" />
          <Text style={styles.addBtnText}>Lier un enfant</Text>
        </TouchableOpacity>
      </View>

      {enfants.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="people-outline" size={56} color="#9CA3AF" style={styles.emptyIcon} />
          <Text style={styles.emptyTitle}>Aucun enfant lié</Text>
          <Text style={styles.emptyText}>
            Demandez à votre enfant son code de liaison dans l'application, puis utilisez "Lier un enfant".
          </Text>
          <TouchableOpacity
            style={styles.linkBtn}
            onPress={() => router.push('/parent/lier')}
          >
            <Text style={styles.linkBtnText}>Lier un enfant</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.content}>
          {enfants.map((enfant) => (
            <View key={enfant.id_utilisateur} style={styles.card}>
              {/* Avatar */}
              <View style={styles.cardHeader}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>
                    {(enfant.prenom?.[0] ?? '') + (enfant.nom?.[0] ?? '')}
                  </Text>
                </View>
                <View style={styles.nameBlock}>
                  <Text style={styles.enfantName}>{enfant.prenom} {enfant.nom}</Text>
                  <Text style={styles.enfantSub}>{enfant.niveau_scolaire} · {enfant.region}</Text>
                </View>
              </View>

              {/* Stats */}
              <View style={styles.statsRow}>
                <StatBox label="Score" value={`${enfant.score_global}/100`} color="#6C63FF" />
                <StatBox label="Streak" value={`${enfant.streak_jours}j`} color="#F59E0B" />
                <StatBox label="XP" value={`${enfant.points_gamification}`} color="#10B981" />
              </View>

              {/* Gauge score */}
              <View style={styles.gaugeContainer}>
                <View style={styles.gaugeBar}>
                  <View style={[styles.gaugeFill, { width: `${enfant.score_global}%`, backgroundColor: scoreColor(enfant.score_global) }]} />
                </View>
                <Text style={styles.gaugeLabel}>{scoreLabel(enfant.score_global)}</Text>
              </View>

              {/* Action */}
              <TouchableOpacity
                style={[styles.rapportBtn, generatingFor === enfant.id_utilisateur && styles.rapportBtnLoading]}
                onPress={() => genererRapport(enfant.id_utilisateur, enfant.prenom)}
                disabled={generatingFor === enfant.id_utilisateur}
              >
                {generatingFor === enfant.id_utilisateur ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <View style={styles.rapportBtnInner}>
                    <Ionicons name="document-text-outline" size={16} color="#fff" />
                    <Text style={styles.rapportBtnText}>Générer rapport hebdomadaire</Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
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

function scoreColor(score: number): string {
  if (score >= 70) return '#10B981';
  if (score >= 40) return '#F59E0B';
  return '#EF4444';
}

function scoreLabel(score: number): string {
  if (score >= 70) return 'Excellent';
  if (score >= 50) return 'Bien';
  if (score >= 30) return 'Moyen';
  return 'À améliorer';
}

const PRIMARY = '#1E3A5F';
const ACCENT = '#6C63FF';

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { backgroundColor: PRIMARY, paddingTop: 56, paddingBottom: 24, paddingHorizontal: 20 },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 12 },
  backText: { color: '#93C5FD', fontSize: 14, fontWeight: '600' },
  headerTitle: { fontSize: 22, fontWeight: '800', color: '#fff' },
  headerSub: { fontSize: 13, color: '#93C5FD', marginTop: 4 },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginTop: 14, backgroundColor: ACCENT, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9 },
  addBtnText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  content: { padding: 16, gap: 16 },
  card: { backgroundColor: '#fff', borderRadius: 18, padding: 16, elevation: 2 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  avatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: `${ACCENT}20`, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  avatarText: { fontSize: 18, fontWeight: '900', color: ACCENT },
  nameBlock: { flex: 1 },
  enfantName: { fontSize: 16, fontWeight: '800', color: PRIMARY },
  enfantSub: { fontSize: 12, color: '#9CA3AF', marginTop: 2 },
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  statBox: { flex: 1, backgroundColor: '#F9FAFB', borderRadius: 12, padding: 10, alignItems: 'center' },
  statValue: { fontSize: 18, fontWeight: '800' },
  statLabel: { fontSize: 11, color: '#9CA3AF', marginTop: 2 },
  gaugeContainer: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  gaugeBar: { flex: 1, height: 8, backgroundColor: '#E5E7EB', borderRadius: 4 },
  gaugeFill: { height: '100%', borderRadius: 4 },
  gaugeLabel: { fontSize: 12, fontWeight: '700', color: '#6B7280', width: 80, textAlign: 'right' },
  rapportBtn: { backgroundColor: PRIMARY, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  rapportBtnInner: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rapportBtnLoading: { backgroundColor: '#9CA3AF' },
  rapportBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  emptyContainer: { padding: 32, alignItems: 'center' },
  emptyIcon: { marginBottom: 16 },
  emptyTitle: { fontSize: 20, fontWeight: '800', color: PRIMARY, marginBottom: 8 },
  emptyText: { fontSize: 14, color: '#6B7280', textAlign: 'center', lineHeight: 22, marginBottom: 24 },
  linkBtn: { backgroundColor: ACCENT, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 32 },
  linkBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
