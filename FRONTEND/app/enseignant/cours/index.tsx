import { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '@/src/lib/api';
import { useAuthStore } from '@/src/store/authStore';
import { colors, radius, spacing, shadow, subjectColor, subjectIconName } from '@/src/theme';

interface Cours {
  id_cours: string;
  titre: string;
  contenu: string;
  niveau: string;
  serie: string | null;
  statut: string;
  nb_vues: number;
  matiere_nom?: string;
  matiere_code?: string;
}

const STATUT_META: Record<string, { label: string; color: string }> = {
  brouillon: { label: 'Brouillon', color: colors.textMuted },
  en_revision: { label: 'En révision', color: colors.warning },
  publie: { label: 'Publié', color: colors.success },
  archive: { label: 'Archivé', color: colors.textLight },
};

const FILTRES = [
  { key: 'tous', label: 'Tous' },
  { key: 'brouillon', label: 'Brouillons' },
  { key: 'en_revision', label: 'En révision' },
  { key: 'publie', label: 'Publiés' },
];

export default function MesCoursScreen() {
  const router = useRouter();
  const { user } = useAuthStore();
  const [cours, setCours] = useState<Cours[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filtre, setFiltre] = useState('tous');

  const fetchCours = useCallback(async () => {
    try {
      const res = await api.get('/cours/');
      const items: Cours[] = res.data.results ?? res.data;
      // On ne garde que les cours de l'enseignant connecté (l'API renvoie aussi les publiés).
      setCours(items);
    } catch {}
  }, []);

  useFocusEffect(useCallback(() => {
    fetchCours().finally(() => setLoading(false));
  }, [fetchCours]));

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchCours();
    setRefreshing(false);
  };

  const visibles = filtre === 'tous' ? cours : cours.filter((c) => c.statut === filtre);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backRow}>
          <Ionicons name="arrow-back" size={20} color={colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Mes cours</Text>
          <Text style={styles.subtitle}>{cours.length} cours au total</Text>
        </View>
      </View>

      <View style={styles.filterRow}>
        {FILTRES.map((f) => {
          const active = filtre === f.key;
          return (
            <TouchableOpacity key={f.key} onPress={() => setFiltre(f.key)} style={styles.filterTab} activeOpacity={0.7}>
              <Text style={[styles.filterText, active && styles.filterTextActive]}>{f.label}</Text>
              {active && <View style={styles.filterUnderline} />}
            </TouchableOpacity>
          );
        })}
      </View>

      {loading ? (
        <View style={styles.centered}><ActivityIndicator size="large" color={colors.primary} /></View>
      ) : (
        <FlatList
          data={visibles}
          keyExtractor={(c) => c.id_cours}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          ListEmptyComponent={
            <View style={styles.centered}>
              <View style={styles.emptyIcon}><Ionicons name="document-text-outline" size={34} color={colors.primary} /></View>
              <Text style={styles.emptyTitle}>Aucun cours ici</Text>
              <Text style={styles.emptySub}>Crée ton premier cours avec le bouton ci-dessous.</Text>
            </View>
          }
          renderItem={({ item }) => {
            const meta = STATUT_META[item.statut] ?? STATUT_META.brouillon;
            const tint = subjectColor(item.matiere_code);
            return (
              <TouchableOpacity
                style={styles.card}
                activeOpacity={0.85}
                onPress={() => router.push(`/enseignant/cours/${item.id_cours}` as any)}
              >
                <View style={[styles.cardIcon, { backgroundColor: `${tint}15` }]}>
                  <Ionicons name={subjectIconName(item.matiere_code)} size={22} color={tint} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle} numberOfLines={1}>{item.titre}</Text>
                  <Text style={styles.cardSub}>{item.matiere_nom ?? '—'} · {item.niveau}{item.serie ? ` · ${item.serie}` : ''}</Text>
                  <View style={styles.cardMetaRow}>
                    <View style={[styles.statutBadge, { backgroundColor: `${meta.color}15` }]}>
                      <Text style={[styles.statutText, { color: meta.color }]}>{meta.label}</Text>
                    </View>
                    <View style={styles.viewsRow}>
                      <Ionicons name="eye-outline" size={13} color={colors.textLight} />
                      <Text style={styles.viewsText}>{item.nb_vues}</Text>
                    </View>
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textLight} />
              </TouchableOpacity>
            );
          }}
        />
      )}

      <TouchableOpacity style={styles.fab} onPress={() => router.push('/enseignant/cours/nouveau')} activeOpacity={0.9}>
        <Ionicons name="add" size={26} color={colors.white} />
        <Text style={styles.fabText}>Nouveau cours</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.xl, marginTop: 30 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: spacing.md, paddingTop: 56, paddingBottom: 10 },
  backRow: { width: 38, height: 38, borderRadius: 12, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', ...shadow.sm },
  title: { fontSize: 22, fontWeight: '800', color: colors.text, letterSpacing: -0.4 },
  subtitle: { fontSize: 13, color: colors.textMuted, marginTop: 1 },

  filterRow: { flexDirection: 'row', gap: 18, paddingHorizontal: spacing.md, paddingTop: 6 },
  filterTab: { alignItems: 'center', paddingVertical: 6 },
  filterText: { fontSize: 13.5, fontWeight: '600', color: colors.textLight },
  filterTextActive: { color: colors.text, fontWeight: '800' },
  filterUnderline: { height: 3, width: 20, borderRadius: 2, backgroundColor: colors.primary, marginTop: 5 },

  list: { padding: spacing.md, gap: 12, paddingBottom: 100 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, ...shadow.sm },
  cardIcon: { width: 46, height: 46, borderRadius: radius.md, justifyContent: 'center', alignItems: 'center' },
  cardTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  cardSub: { fontSize: 12.5, color: colors.textMuted, marginTop: 2 },
  cardMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 },
  statutBadge: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: radius.full },
  statutText: { fontSize: 11, fontWeight: '800' },
  viewsRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  viewsText: { fontSize: 12, color: colors.textLight, fontWeight: '600' },

  emptyIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.primaryLight, justifyContent: 'center', alignItems: 'center', marginBottom: 14 },
  emptyTitle: { fontSize: 17, fontWeight: '800', color: colors.text, marginBottom: 6 },
  emptySub: { fontSize: 13.5, color: colors.textMuted, textAlign: 'center' },

  fab: { position: 'absolute', right: spacing.md, bottom: 24, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.primary, borderRadius: radius.full, paddingVertical: 14, paddingHorizontal: 20, ...shadow.lg },
  fabText: { color: colors.white, fontWeight: '800', fontSize: 15 },
});
