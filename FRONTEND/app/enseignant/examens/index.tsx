import { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '@/src/lib/api';
import { colors, radius, spacing, shadow } from '@/src/theme';

interface Epreuve {
  id_epreuve: string;
  titre: string;
  type_epreuve: string;
  niveau: string;
  serie: string | null;
  annee: number | null;
  corrige: string | null;
  nb_questions_detail: number;
  matiere_nom?: string;
}

type IconName = keyof typeof Ionicons.glyphMap;
const TYPE_META: Record<string, { label: string; color: string; icon: IconName }> = {
  officielle: { label: 'Annale', color: colors.violet, icon: 'ribbon-outline' },
  simulation: { label: 'Simulation', color: colors.accent, icon: 'flask-outline' },
  exercice: { label: 'Exercice', color: colors.emerald, icon: 'barbell-outline' },
};
const FILTRES = [
  { key: 'tous', label: 'Tous' },
  { key: 'officielle', label: 'Annales' },
  { key: 'simulation', label: 'Simulations' },
];

export default function MesExamensScreen() {
  const router = useRouter();
  const [epreuves, setEpreuves] = useState<Epreuve[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filtre, setFiltre] = useState('tous');

  const fetchData = useCallback(async () => {
    try {
      const res = await api.get('/enseignant/epreuves/');
      setEpreuves(res.data.results ?? res.data);
    } catch {}
  }, []);

  useFocusEffect(useCallback(() => {
    fetchData().finally(() => setLoading(false));
  }, [fetchData]));

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  };

  const visibles = filtre === 'tous' ? epreuves : epreuves.filter((e) => e.type_epreuve === filtre);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backRow}>
          <Ionicons name="arrow-back" size={20} color={colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Banque de sujets</Text>
          <Text style={styles.subtitle}>{epreuves.length} sujet(s) · corrigés</Text>
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
          keyExtractor={(e) => e.id_epreuve}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          ListEmptyComponent={
            <View style={styles.centered}>
              <View style={styles.emptyIcon}><Ionicons name="documents-outline" size={34} color={colors.primary} /></View>
              <Text style={styles.emptyTitle}>Aucun sujet</Text>
              <Text style={styles.emptySub}>Importe une annale PDF pour démarrer ta banque.</Text>
            </View>
          }
          renderItem={({ item }) => {
            const meta = TYPE_META[item.type_epreuve] ?? { label: item.type_epreuve, color: colors.textMuted, icon: 'document-outline' as IconName };
            const hasCorrige = !!(item.corrige && item.corrige.trim());
            return (
              <TouchableOpacity style={styles.card} activeOpacity={0.85} onPress={() => router.push(`/enseignant/examens/${item.id_epreuve}` as any)}>
                <View style={[styles.cardIcon, { backgroundColor: `${meta.color}15` }]}>
                  <Ionicons name={meta.icon} size={22} color={meta.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle} numberOfLines={2}>{item.titre}</Text>
                  <Text style={styles.cardSub}>
                    {item.matiere_nom ?? '—'} · {item.niveau}{item.serie ? ` · ${item.serie}` : ''}{item.annee ? ` · ${item.annee}` : ''}
                  </Text>
                  <View style={styles.cardMetaRow}>
                    <View style={[styles.typeBadge, { backgroundColor: `${meta.color}15` }]}>
                      <Text style={[styles.typeText, { color: meta.color }]}>{meta.label}</Text>
                    </View>
                    <View style={styles.metaItem}><Ionicons name="help-circle-outline" size={13} color={colors.textLight} /><Text style={styles.metaText}>{item.nb_questions_detail}</Text></View>
                    <View style={[styles.corrigeTag, { backgroundColor: hasCorrige ? `${colors.success}15` : colors.surfaceAlt }]}>
                      <Ionicons name={hasCorrige ? 'checkmark-circle' : 'ellipse-outline'} size={12} color={hasCorrige ? colors.success : colors.textLight} />
                      <Text style={[styles.corrigeText, { color: hasCorrige ? colors.success : colors.textLight }]}>Corrigé</Text>
                    </View>
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textLight} />
              </TouchableOpacity>
            );
          }}
        />
      )}

      <TouchableOpacity style={styles.fab} onPress={() => router.push('/enseignant/importer')} activeOpacity={0.9}>
        <Ionicons name="cloud-upload" size={22} color={colors.white} />
        <Text style={styles.fabText}>Importer un sujet</Text>
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
  cardTitle: { fontSize: 15, fontWeight: '700', color: colors.text, lineHeight: 20 },
  cardSub: { fontSize: 12.5, color: colors.textMuted, marginTop: 3 },
  cardMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' },
  typeBadge: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: radius.full },
  typeText: { fontSize: 11, fontWeight: '800' },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  metaText: { fontSize: 12, color: colors.textLight, fontWeight: '600' },
  corrigeTag: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.full },
  corrigeText: { fontSize: 11, fontWeight: '700' },
  emptyIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.primaryLight, justifyContent: 'center', alignItems: 'center', marginBottom: 14 },
  emptyTitle: { fontSize: 17, fontWeight: '800', color: colors.text, marginBottom: 6 },
  emptySub: { fontSize: 13.5, color: colors.textMuted, textAlign: 'center' },
  fab: { position: 'absolute', right: spacing.md, bottom: 24, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.primary, borderRadius: radius.full, paddingVertical: 14, paddingHorizontal: 20, ...shadow.lg },
  fabText: { color: colors.white, fontWeight: '800', fontSize: 15 },
});
