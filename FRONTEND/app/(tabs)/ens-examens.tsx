import { useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, RefreshControl, ScrollView } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '@/src/lib/api';
import { colors, radius, spacing, shadow, subjectColor, subjectIconName } from '@/src/theme';

interface Epreuve {
  id_epreuve: string; titre: string; type_epreuve: string; niveau: string; serie: string | null;
  annee: number | null; corrige: string | null; nb_questions_detail: number;
  matiere_nom?: string; matiere_code?: string; fichier_pdf?: string | null; corrige_pdf?: string | null;
}
type IconName = keyof typeof Ionicons.glyphMap;
const TYPE_META: Record<string, { label: string; color: string; icon: IconName }> = {
  officielle: { label: 'Annale', color: colors.violet, icon: 'ribbon' },
  simulation: { label: 'Simulation', color: colors.accent, icon: 'flask' },
  exercice: { label: 'Exercice', color: colors.emerald, icon: 'barbell' },
};
const FILTRES = [
  { key: 'tous', label: 'Tous' }, { key: 'officielle', label: 'Annales' },
  { key: 'simulation', label: 'Simulations' }, { key: 'exercice', label: 'Exercices' },
];

export default function EnsExamensTab() {
  const router = useRouter();
  const [epreuves, setEpreuves] = useState<Epreuve[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filtre, setFiltre] = useState('tous');
  const [matiere, setMatiere] = useState<string | null>(null);
  const [annee, setAnnee] = useState<number | null>(null);

  const fetchData = useCallback(async () => {
    try { const r = await api.get('/enseignant/epreuves/'); setEpreuves(r.data.results ?? r.data); } catch {}
  }, []);
  useFocusEffect(useCallback(() => { fetchData().finally(() => setLoading(false)); }, [fetchData]));
  const onRefresh = async () => { setRefreshing(true); await fetchData(); setRefreshing(false); };

  // Dimensions d'organisation, dérivées des données.
  const matieres = Array.from(new Set(epreuves.map((e) => e.matiere_nom).filter(Boolean))) as string[];
  const annees = Array.from(new Set(epreuves.map((e) => e.annee).filter(Boolean))).sort((a, b) => (b as number) - (a as number)) as number[];

  const visibles = epreuves.filter((e) =>
    (filtre === 'tous' || e.type_epreuve === filtre)
    && (!matiere || e.matiere_nom === matiere)
    && (!annee || e.annee === annee));

  const nbAvecCorrige = epreuves.filter((e) => e.corrige || e.corrige_pdf).length;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Examens</Text>
          <Text style={styles.subtitle}>{epreuves.length} sujet{epreuves.length > 1 ? 's' : ''} · {nbAvecCorrige} corrigé{nbAvecCorrige > 1 ? 's' : ''}</Text>
        </View>
      </View>

      {/* Filtres par type (pills) */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pillRow}>
        {FILTRES.map((f) => {
          const active = filtre === f.key;
          return (
            <TouchableOpacity key={f.key} onPress={() => setFiltre(f.key)} style={[styles.pill, active && styles.pillActive]} activeOpacity={0.8}>
              <Text style={[styles.pillText, active && styles.pillTextActive]}>{f.label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Organisation par matière / année */}
      {(matieres.length > 0 || annees.length > 0) && (
        <View style={styles.filtersBox}>
          {matieres.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
              <Chip icon="albums-outline" label="Toutes matières" active={!matiere} onPress={() => setMatiere(null)} />
              {matieres.map((m) => <Chip key={m} label={m} active={matiere === m} onPress={() => setMatiere(matiere === m ? null : m)} />)}
            </ScrollView>
          )}
          {annees.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
              <Chip icon="calendar-outline" label="Toutes années" active={!annee} onPress={() => setAnnee(null)} />
              {annees.map((a) => <Chip key={a} label={`${a}`} active={annee === a} onPress={() => setAnnee(annee === a ? null : a)} />)}
            </ScrollView>
          )}
        </View>
      )}

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
              <Text style={styles.emptySub}>Importe une annale PDF ou crée un exercice pour démarrer ta banque.</Text>
            </View>
          }
          renderItem={({ item }) => {
            const meta = TYPE_META[item.type_epreuve] ?? { label: item.type_epreuve, color: colors.textMuted, icon: 'document' as IconName };
            const accent = subjectColor(item.matiere_code);
            const hasCorrige = !!(item.corrige?.trim() || item.corrige_pdf);
            return (
              <TouchableOpacity style={styles.card} activeOpacity={0.85} onPress={() => router.push(`/enseignant/examens/${item.id_epreuve}` as any)}>
                <View style={[styles.accent, { backgroundColor: accent }]} />
                <View style={[styles.cardIcon, { backgroundColor: `${accent}15` }]}>
                  <Ionicons name={subjectIconName(item.matiere_code)} size={20} color={accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle} numberOfLines={2}>{item.titre}</Text>
                  <Text style={styles.cardSub}>{item.matiere_nom ?? '—'} · {item.niveau}{item.serie ? ` · ${item.serie}` : ''}{item.annee ? ` · ${item.annee}` : ''}</Text>
                  <View style={styles.tagRow}>
                    <View style={[styles.tag, { backgroundColor: `${meta.color}15` }]}>
                      <Ionicons name={meta.icon} size={11} color={meta.color} />
                      <Text style={[styles.tagText, { color: meta.color }]}>{meta.label}</Text>
                    </View>
                    <View style={styles.tagPlain}><Ionicons name="help-circle-outline" size={12} color={colors.textLight} /><Text style={styles.tagPlainText}>{item.nb_questions_detail} Q</Text></View>
                    {item.fichier_pdf ? <Badge icon="document-text" label="Sujet" color={colors.info} /> : null}
                    <Badge icon={hasCorrige ? 'checkmark-circle' : 'ellipse-outline'} label="Corrigé" color={hasCorrige ? colors.success : colors.textLight} />
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textLight} />
              </TouchableOpacity>
            );
          }}
        />
      )}

      <TouchableOpacity style={styles.fab} onPress={() => router.push('/enseignant/importer' as any)} activeOpacity={0.9}>
        <Ionicons name="cloud-upload" size={20} color={colors.white} /><Text style={styles.fabText}>Importer un sujet</Text>
      </TouchableOpacity>
    </View>
  );
}

function Chip({ label, active, onPress, icon }: { label: string; active: boolean; onPress: () => void; icon?: IconName }) {
  return (
    <TouchableOpacity style={[styles.chip, active && styles.chipActive]} onPress={onPress} activeOpacity={0.8}>
      {icon ? <Ionicons name={icon} size={13} color={active ? colors.primary : colors.textMuted} /> : null}
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}
function Badge({ icon, label, color }: { icon: IconName; label: string; color: string }) {
  return (
    <View style={[styles.tagPlain, { backgroundColor: `${color}12` }]}>
      <Ionicons name={icon} size={12} color={color} />
      <Text style={[styles.tagPlainText, { color }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.xl, marginTop: 30 },
  header: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: spacing.md, paddingTop: 56, paddingBottom: 8 },
  title: { fontSize: 28, fontWeight: '800', color: colors.text, letterSpacing: -0.5 },
  subtitle: { fontSize: 13, color: colors.textMuted, marginTop: 2 },

  pillRow: { paddingHorizontal: spacing.md, paddingVertical: 6, gap: 8 },
  pill: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: radius.full, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  pillActive: { backgroundColor: colors.text, borderColor: colors.text },
  pillText: { fontSize: 13, fontWeight: '700', color: colors.textMuted },
  pillTextActive: { color: colors.white },

  filtersBox: { backgroundColor: colors.surface, marginHorizontal: spacing.md, borderRadius: radius.lg, paddingVertical: 6, marginTop: 2, ...shadow.sm },
  chipRow: { paddingHorizontal: 10, paddingVertical: 4, gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: radius.full, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border },
  chipActive: { backgroundColor: colors.primaryLight, borderColor: colors.primary },
  chipText: { fontSize: 12.5, fontWeight: '700', color: colors.textMuted },
  chipTextActive: { color: colors.primary },

  list: { padding: spacing.md, gap: 12, paddingBottom: 100 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, paddingLeft: spacing.md + 6, overflow: 'hidden', ...shadow.sm },
  accent: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 5 },
  cardIcon: { width: 46, height: 46, borderRadius: radius.md, justifyContent: 'center', alignItems: 'center' },
  cardTitle: { fontSize: 15, fontWeight: '800', color: colors.text, lineHeight: 20 },
  cardSub: { fontSize: 12.5, color: colors.textMuted, marginTop: 3 },
  tagRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 9, flexWrap: 'wrap' },
  tag: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.full },
  tagText: { fontSize: 11, fontWeight: '800' },
  tagPlain: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.full, backgroundColor: colors.surfaceAlt },
  tagPlainText: { fontSize: 11, color: colors.textLight, fontWeight: '700' },

  emptyIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.primaryLight, justifyContent: 'center', alignItems: 'center', marginBottom: 14 },
  emptyTitle: { fontSize: 17, fontWeight: '800', color: colors.text, marginBottom: 6 },
  emptySub: { fontSize: 13.5, color: colors.textMuted, textAlign: 'center' },
  fab: { position: 'absolute', right: spacing.md, bottom: 24, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.primary, borderRadius: radius.full, paddingVertical: 14, paddingHorizontal: 20, ...shadow.lg },
  fabText: { color: colors.white, fontWeight: '800', fontSize: 15 },
});
