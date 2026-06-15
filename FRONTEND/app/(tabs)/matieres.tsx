import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '@/src/lib/api';
import { useAuthStore } from '@/src/store/authStore';
import { SubjectGrid, SubjectEntry } from '@/src/components/SubjectGrid';
import { colors, radius, spacing, shadow } from '@/src/theme';

interface Cours {
  id_cours: string;
  titre: string;
  id_matiere: string;
  matiere_nom: string;
  matiere_code: string;
}

export default function MatieresScreen() {
  const router = useRouter();
  const { user } = useAuthStore();
  const [cours, setCours] = useState<Cours[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');

  const fetchCours = async () => {
    try {
      const res = await api.get('/cours/', { params: { page_size: '200' } });
      setCours(res.data.results ?? res.data);
    } catch {}
  };

  useEffect(() => { setLoading(true); fetchCours().finally(() => setLoading(false)); }, []);
  const onRefresh = async () => { setRefreshing(true); await fetchCours(); setRefreshing(false); };

  // Regroupe les cours par matière → une carte par matière.
  const subjects: SubjectEntry[] = (() => {
    const map = new Map<string, SubjectEntry>();
    for (const c of cours) {
      const key = c.id_matiere || c.matiere_code || c.matiere_nom;
      if (!key) continue;
      const entry = map.get(key);
      if (entry) entry.count += 1;
      else map.set(key, { id: c.id_matiere, nom: c.matiere_nom || 'Autres', code: c.matiere_code || '', count: 1 });
    }
    let list = Array.from(map.values());
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((s) => s.nom.toLowerCase().includes(q));
    return list.sort((a, b) => a.nom.localeCompare(b.nom));
  })();

  const open = (s: SubjectEntry) =>
    router.push(`/matiere/${s.id}?mode=cours&nom=${encodeURIComponent(s.nom)}&code=${encodeURIComponent(s.code)}` as any);

  const Header = (
    <View>
      <View style={styles.header}>
        <Text style={styles.title}>Mes cours</Text>
        {user?.role === 'eleve' && user?.niveau_scolaire ? (
          <View style={styles.programmePill}>
            <Ionicons name="school" size={13} color={colors.primary} />
            <Text style={styles.programmePillText}>Programme {user.niveau_scolaire}</Text>
          </View>
        ) : null}
      </View>
      <Text style={styles.hint}>Choisis une matière pour voir ses cours.</Text>
      <View style={styles.searchBar}>
        <Ionicons name="search" size={18} color={colors.textLight} style={{ marginRight: spacing.sm }} />
        <TextInput
          style={styles.searchInput}
          placeholder="Rechercher une matière…"
          placeholderTextColor={colors.textLight}
          value={search}
          onChangeText={setSearch}
        />
      </View>
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
        emptyLabel="Aucun cours disponible pour ta classe."
        countLabel={(n) => `${n} cours`}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', paddingTop: 56, paddingBottom: spacing.xs },
  title: { fontSize: 26, fontWeight: '800', color: colors.text, letterSpacing: -0.5, flex: 1 },
  programmePill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: colors.primaryLight, borderRadius: radius.full, paddingHorizontal: 12, paddingVertical: 5,
  },
  programmePillText: { fontSize: 12, fontWeight: '700', color: colors.primary },
  hint: { fontSize: 13, color: colors.textMuted, marginTop: 4, marginBottom: spacing.sm },
  searchBar: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface,
    marginBottom: spacing.sm, borderRadius: radius.md, paddingHorizontal: 14,
    borderWidth: 1, borderColor: colors.border, ...shadow.sm,
  },
  searchInput: { flex: 1, fontSize: 15, color: colors.text, paddingVertical: 13 },
});
