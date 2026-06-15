import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '@/src/lib/api';
import { useAuthStore } from '@/src/store/authStore';
import { SubjectGrid, SubjectEntry } from '@/src/components/SubjectGrid';
import { colors, radius, spacing } from '@/src/theme';

interface Epreuve {
  id_epreuve: string;
  id_matiere: string;
  matiere_nom?: string;
  matiere_code?: string;
}

export default function ExamensScreen() {
  const router = useRouter();
  const { user } = useAuthStore();
  const [epreuves, setEpreuves] = useState<Epreuve[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchEpreuves = async () => {
    try {
      const res = await api.get('/epreuves/', { params: { page_size: '300' } });
      setEpreuves(res.data.results ?? res.data);
    } catch {}
  };

  useEffect(() => { setLoading(true); fetchEpreuves().finally(() => setLoading(false)); }, []);
  const onRefresh = async () => { setRefreshing(true); await fetchEpreuves(); setRefreshing(false); };

  // Regroupe les épreuves par matière → une carte par matière.
  const subjects: SubjectEntry[] = (() => {
    const map = new Map<string, SubjectEntry>();
    for (const e of epreuves) {
      const key = e.id_matiere || e.matiere_code || e.matiere_nom;
      if (!key) continue;
      const entry = map.get(key);
      if (entry) entry.count += 1;
      else map.set(key, { id: e.id_matiere, nom: e.matiere_nom || 'Autres', code: e.matiere_code || '', count: 1 });
    }
    return Array.from(map.values()).sort((a, b) => a.nom.localeCompare(b.nom));
  })();

  const open = (s: SubjectEntry) =>
    router.push(`/matiere/${s.id}?mode=examens&nom=${encodeURIComponent(s.nom)}&code=${encodeURIComponent(s.code)}` as any);

  const Header = (
    <View style={styles.header}>
      <Text style={styles.title}>Examens</Text>
      {user?.role === 'eleve' && user?.niveau_scolaire ? (
        <View style={styles.programmePill}>
          <Ionicons name="school-outline" size={13} color={colors.primary} />
          <Text style={styles.programmePillText}>Programme {user.niveau_scolaire}</Text>
        </View>
      ) : null}
      <Text style={styles.hint}>Choisis une matière pour voir ses annales, simulations et exercices.</Text>
    </View>
  );

  if (loading) {
    return <View style={styles.centered}><ActivityIndicator size="large" color={colors.primary} /></View>;
  }

  return (
    <View style={styles.container}>
      <SubjectGrid
        subjects={subjects}
        onPress={open}
        header={Header}
        refreshing={refreshing}
        onRefresh={onRefresh}
        emptyLabel="Aucune épreuve pour ta classe."
        countLabel={(n) => `${n} épreuve${n > 1 ? 's' : ''}`}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.bg },
  header: { paddingTop: 56, paddingBottom: spacing.sm },
  title: { fontSize: 28, fontWeight: '800', color: colors.text, letterSpacing: -0.5 },
  programmePill: {
    flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', marginTop: 6,
    backgroundColor: colors.primaryLight, borderRadius: radius.full, paddingHorizontal: 12, paddingVertical: 5,
  },
  programmePillText: { fontSize: 12, fontWeight: '700', color: colors.primary },
  hint: { fontSize: 13, color: colors.textMuted, marginTop: 8 },
});
