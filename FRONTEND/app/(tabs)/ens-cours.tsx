import { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '@/src/lib/api';
import { SubjectGrid, SubjectEntry } from '@/src/components/SubjectGrid';
import { GradientHeader } from '@/src/components/GradientHeader';
import { colors, radius, spacing, shadow } from '@/src/theme';

interface Cours {
  id_cours: string; id_matiere: string; matiere_nom?: string; matiere_code?: string;
}

export default function EnsCoursTab() {
  const router = useRouter();
  const [cours, setCours] = useState<Cours[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async () => {
    try { const r = await api.get('/cours/', { params: { page_size: '300' } }); setCours(r.data.results ?? r.data); } catch {}
  }, []);
  useFocusEffect(useCallback(() => { fetchData().finally(() => setLoading(false)); }, [fetchData]));
  const onRefresh = async () => { setRefreshing(true); await fetchData(); setRefreshing(false); };

  const subjects: SubjectEntry[] = (() => {
    const map = new Map<string, SubjectEntry>();
    for (const c of cours) {
      const key = c.id_matiere || c.matiere_code || c.matiere_nom;
      if (!key) continue;
      const e = map.get(key);
      if (e) e.count += 1;
      else map.set(key, { id: c.id_matiere, nom: c.matiere_nom || 'Autres', code: c.matiere_code || '', count: 1 });
    }
    return Array.from(map.values()).sort((a, b) => a.nom.localeCompare(b.nom));
  })();

  const open = (s: SubjectEntry) =>
    router.push(`/enseignant/matiere/${s.id}?kind=cours&nom=${encodeURIComponent(s.nom)}&code=${encodeURIComponent(s.code)}` as any);

  return (
    <View style={styles.container}>
      <GradientHeader title="Cours" subtitle={`${cours.length} cours · rangés par matière`} icon="library" />
      {loading ? (
        <View style={styles.centered}><ActivityIndicator size="large" color={colors.primary} /></View>
      ) : (
      <SubjectGrid
        subjects={subjects}
        onPress={open}
        refreshing={refreshing}
        onRefresh={onRefresh}
        emptyLabel="Aucun cours. Crée ton premier cours."
        countLabel={(n) => `${n} cours`}
      />
      )}
      <TouchableOpacity style={styles.fab} onPress={() => router.push('/enseignant/cours/nouveau' as any)} activeOpacity={0.9}>
        <Ionicons name="add" size={26} color={colors.white} /><Text style={styles.fabText}>Nouveau cours</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.bg },
  header: { paddingTop: 56, paddingBottom: 6 },
  title: { fontSize: 28, fontWeight: '800', color: colors.text, letterSpacing: -0.5 },
  subtitle: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  fab: { position: 'absolute', right: spacing.md, bottom: 24, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.primary, borderRadius: radius.full, paddingVertical: 14, paddingHorizontal: 20, ...shadow.lg },
  fabText: { color: colors.white, fontWeight: '800', fontSize: 15 },
});
