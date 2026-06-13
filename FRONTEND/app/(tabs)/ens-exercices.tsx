import { useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, RefreshControl } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '@/src/lib/api';
import { colors, radius, spacing, shadow, subjectColor, subjectIconName } from '@/src/theme';

interface Exo {
  id_epreuve: string; titre: string; niveau: string; serie: string | null;
  nb_questions_detail: number; matiere_nom?: string; matiere_code?: string;
}

export default function EnsExercicesTab() {
  const router = useRouter();
  const [items, setItems] = useState<Exo[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async () => {
    try { const r = await api.get('/enseignant/epreuves/', { params: { type_epreuve: 'exercice' } }); setItems(r.data.results ?? r.data); } catch {}
  }, []);
  useFocusEffect(useCallback(() => { fetchData().finally(() => setLoading(false)); }, [fetchData]));
  const onRefresh = async () => { setRefreshing(true); await fetchData(); setRefreshing(false); };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Exercices</Text>
        <Text style={styles.subtitle}>{items.length} exercice(s) · avec corrections</Text>
      </View>

      {loading ? (
        <View style={styles.centered}><ActivityIndicator size="large" color={colors.primary} /></View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(e) => e.id_epreuve}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          ListEmptyComponent={
            <View style={styles.centered}>
              <View style={styles.emptyIcon}><Ionicons name="barbell-outline" size={34} color={colors.primary} /></View>
              <Text style={styles.emptyTitle}>Aucun exercice</Text>
              <Text style={styles.emptySub}>Crée un exercice avec ses corrections.</Text>
            </View>
          }
          renderItem={({ item }) => {
            const tint = subjectColor(item.matiere_code);
            return (
              <TouchableOpacity style={styles.card} activeOpacity={0.85} onPress={() => router.push(`/enseignant/exercices/${item.id_epreuve}` as any)}>
                <View style={[styles.cardIcon, { backgroundColor: `${tint}15` }]}><Ionicons name={subjectIconName(item.matiere_code)} size={22} color={tint} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle} numberOfLines={1}>{item.titre}</Text>
                  <Text style={styles.cardSub}>{item.matiere_nom ?? '—'} · {item.niveau}{item.serie ? ` · ${item.serie}` : ''}</Text>
                  <View style={styles.meta}><Ionicons name="help-circle-outline" size={13} color={colors.textLight} /><Text style={styles.metaText}>{item.nb_questions_detail} question(s)</Text></View>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textLight} />
              </TouchableOpacity>
            );
          }}
        />
      )}

      <TouchableOpacity style={styles.fab} onPress={() => router.push('/enseignant/exercices/nouveau' as any)} activeOpacity={0.9}>
        <Ionicons name="add" size={26} color={colors.white} /><Text style={styles.fabText}>Nouvel exercice</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.xl, marginTop: 30 },
  header: { paddingHorizontal: spacing.md, paddingTop: 56, paddingBottom: 6 },
  title: { fontSize: 28, fontWeight: '800', color: colors.text, letterSpacing: -0.5 },
  subtitle: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  list: { padding: spacing.md, gap: 12, paddingBottom: 100 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, ...shadow.sm },
  cardIcon: { width: 46, height: 46, borderRadius: radius.md, justifyContent: 'center', alignItems: 'center' },
  cardTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  cardSub: { fontSize: 12.5, color: colors.textMuted, marginTop: 2 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 8 },
  metaText: { fontSize: 12, color: colors.textLight, fontWeight: '600' },
  emptyIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.primaryLight, justifyContent: 'center', alignItems: 'center', marginBottom: 14 },
  emptyTitle: { fontSize: 17, fontWeight: '800', color: colors.text, marginBottom: 6 },
  emptySub: { fontSize: 13.5, color: colors.textMuted, textAlign: 'center' },
  fab: { position: 'absolute', right: spacing.md, bottom: 24, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.primary, borderRadius: radius.full, paddingVertical: 14, paddingHorizontal: 20, ...shadow.lg },
  fabText: { color: colors.white, fontWeight: '800', fontSize: 15 },
});
