import { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl, TextInput,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '@/src/lib/api';
import { useAuthStore } from '@/src/store/authStore';
import { colors, radius, spacing, shadow, subjectColor, subjectIconName } from '@/src/theme';

interface Cours {
  id_cours: string;
  titre: string;
  matiere_nom: string;
  matiere_code: string;
  niveau: string;
  serie: string;
  nb_vues: number;
  duree_lecture_min: number;
  statut: string;
}

export default function MatieresScreen() {
  const router = useRouter();
  const { user } = useAuthStore();
  const [cours, setCours] = useState<Cours[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [hasNext, setHasNext] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const fetchCours = async (pageNum = 1, refresh = false) => {
    try {
      // Le backend restreint déjà les cours à la classe de l'élève :
      // pas de filtre de niveau côté UI.
      const res = await api.get('/cours/', { params: { page: String(pageNum) } });
      const results: Cours[] = res.data.results ?? res.data;
      setCours((prev) => refresh || pageNum === 1 ? results : [...prev, ...results]);
      setHasNext(!!res.data.next);
      setPage(pageNum);
    } catch {}
  };

  useEffect(() => {
    setLoading(true);
    fetchCours(1, true).finally(() => setLoading(false));
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchCours(1, true);
    setRefreshing(false);
  };

  const loadMore = async () => {
    if (!hasNext || loadingMore) return;
    setLoadingMore(true);
    await fetchCours(page + 1);
    setLoadingMore(false);
  };

  const filtered = cours.filter((c) =>
    c.titre.toLowerCase().includes(search.toLowerCase()) ||
    c.matiere_nom?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <View style={styles.container}>
      {/* En-tête */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Mes cours</Text>
          {user?.role === 'eleve' && user?.niveau_scolaire ? (
            <View style={styles.programmePill}>
              <Ionicons name="school" size={13} color={colors.primary} />
              <Text style={styles.programmePillText}>Programme {user.niveau_scolaire}</Text>
            </View>
          ) : null}
        </View>
      </View>

      {/* Barre de recherche */}
      <View style={styles.searchBar}>
        <Ionicons name="search" size={18} color={colors.textLight} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Rechercher un cours…"
          placeholderTextColor={colors.textLight}
          value={search}
          onChangeText={setSearch}
        />
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id_cours}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          onEndReached={loadMore}
          onEndReachedThreshold={0.3}
          ListEmptyComponent={<EmptyState label="Aucun cours disponible pour ta classe." />}
          ListFooterComponent={loadingMore ? <ActivityIndicator style={{ margin: spacing.md }} color={colors.primary} /> : null}
          renderItem={({ item }) => {
            const color = subjectColor(item.matiere_code);
            return (
              <TouchableOpacity
                style={styles.card}
                activeOpacity={0.85}
                onPress={() => router.push(`/cours/${item.id_cours}`)}
              >
                <View style={[styles.iconBox, { backgroundColor: `${color}1A` }]}>
                  <Ionicons name={subjectIconName(item.matiere_code)} size={24} color={color} />
                </View>
                <View style={styles.cardBody}>
                  <View style={[styles.matiereBadge, { backgroundColor: `${color}1A` }]}>
                    <Text style={[styles.matiereBadgeText, { color }]}>{item.matiere_nom ?? '—'}</Text>
                  </View>
                  <Text style={styles.titre} numberOfLines={2}>{item.titre}</Text>
                  <View style={styles.cardFooter}>
                    <View style={styles.metaItem}>
                      <Ionicons name="eye-outline" size={13} color={colors.textLight} />
                      <Text style={styles.meta}>{item.nb_vues}</Text>
                    </View>
                    {item.duree_lecture_min ? (
                      <View style={styles.metaItem}>
                        <Ionicons name="time-outline" size={13} color={colors.textLight} />
                        <Text style={styles.meta}>{item.duree_lecture_min} min</Text>
                      </View>
                    ) : null}
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={20} color={color} />
              </TouchableOpacity>
            );
          }}
        />
      )}
    </View>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <View style={styles.centered}>
      <Ionicons name="library-outline" size={44} color={colors.textLight} style={{ marginBottom: spacing.sm }} />
      <Text style={{ color: colors.textMuted, textAlign: 'center' }}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.xl, marginTop: 40 },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.md, paddingTop: 56, paddingBottom: spacing.sm,
  },
  title: { fontSize: 26, fontWeight: '800', color: colors.text, letterSpacing: -0.5 },
  programmePill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    alignSelf: 'flex-start', marginTop: 6,
    backgroundColor: colors.primaryLight, borderRadius: radius.full,
    paddingHorizontal: 12, paddingVertical: 5,
  },
  programmePillText: { fontSize: 12, fontWeight: '700', color: colors.primary },
  searchBar: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface,
    marginHorizontal: spacing.md, marginTop: spacing.xs, marginBottom: spacing.sm,
    borderRadius: radius.md, paddingHorizontal: 14, borderWidth: 1, borderColor: colors.border,
    ...shadow.sm,
  },
  searchIcon: { fontSize: 16, marginRight: spacing.sm },
  searchInput: { flex: 1, fontSize: 15, color: colors.text, paddingVertical: 13 },
  list: { padding: spacing.md, gap: 12 },
  card: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.surface, borderRadius: radius.lg, padding: 14,
    borderWidth: 1, borderColor: colors.border, ...shadow.md,
  },
  iconBox: {
    width: 52, height: 52, borderRadius: radius.md,
    justifyContent: 'center', alignItems: 'center', marginRight: 14,
  },
  iconText: { fontSize: 24 },
  cardBody: { flex: 1 },
  matiereBadge: { alignSelf: 'flex-start', paddingHorizontal: 9, paddingVertical: 3, borderRadius: radius.sm, marginBottom: 6 },
  matiereBadgeText: { fontSize: 11, fontWeight: '800' },
  titre: { fontSize: 15, fontWeight: '700', color: colors.text, marginBottom: 8 },
  cardFooter: { flexDirection: 'row', gap: 14 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  meta: { fontSize: 12, color: colors.textLight, fontWeight: '600' },
});
