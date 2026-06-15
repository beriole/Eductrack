import { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '@/src/lib/api';
import { SubjectGrid, SubjectEntry } from '@/src/components/SubjectGrid';
import { colors, radius, spacing, shadow } from '@/src/theme';

interface Exo {
  id_epreuve: string; id_matiere: string; matiere_nom?: string; matiere_code?: string;
}

export default function EnsExercicesTab() {
  const router = useRouter();
  const [items, setItems] = useState<Exo[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async () => {
    try { const r = await api.get('/enseignant/epreuves/', { params: { type_epreuve: 'exercice', page_size: '300' } }); setItems(r.data.results ?? r.data); } catch {}
  }, []);
  useFocusEffect(useCallback(() => { fetchData().finally(() => setLoading(false)); }, [fetchData]));
  const onRefresh = async () => { setRefreshing(true); await fetchData(); setRefreshing(false); };

  const subjects: SubjectEntry[] = (() => {
    const map = new Map<string, SubjectEntry>();
    for (const e of items) {
      const key = e.id_matiere || e.matiere_code || e.matiere_nom;
      if (!key) continue;
      const x = map.get(key);
      if (x) x.count += 1;
      else map.set(key, { id: e.id_matiere, nom: e.matiere_nom || 'Autres', code: e.matiere_code || '', count: 1 });
    }
    return Array.from(map.values()).sort((a, b) => a.nom.localeCompare(b.nom));
  })();

  const open = (s: SubjectEntry) =>
    router.push(`/enseignant/matiere/${s.id}?kind=exercices&nom=${encodeURIComponent(s.nom)}&code=${encodeURIComponent(s.code)}` as any);

  const Header = (
    <View style={styles.header}>
      <Text style={styles.title}>Exercices</Text>
      <Text style={styles.subtitle}>{items.length} exercice(s) · rangés par matière</Text>
    </View>
  );

  if (loading) return <View style={styles.centered}><ActivityIndicator size="large" color={colors.primary} /></View>;

  return (
    <View style={styles.container}>
      <SubjectGrid
        subjects={subjects}
        onPress={open}
        header={Header}
        refreshing={refreshing}
        onRefresh={onRefresh}
        emptyLabel="Aucun exercice. Crée ton premier exercice."
        countLabel={(n) => `${n} exo${n > 1 ? 's' : ''}`}
      />
      <TouchableOpacity style={styles.fab} onPress={() => router.push('/enseignant/exercices/nouveau' as any)} activeOpacity={0.9}>
        <Ionicons name="add" size={26} color={colors.white} /><Text style={styles.fabText}>Nouvel exercice</Text>
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
