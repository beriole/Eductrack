import { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, SectionList, TouchableOpacity,
  ActivityIndicator, RefreshControl, Modal, Pressable,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '@/src/lib/api';
import { useAuthStore } from '@/src/store/authStore';
import { PdfViewButton } from '@/src/components/Pdf';
import { StarRating } from '@/src/components/Feedback';
import { colors, radius, spacing, shadow, subjectColor, subjectIconName } from '@/src/theme';

interface Epreuve {
  id_epreuve: string;
  titre: string;
  type_epreuve: string;
  niveau: string;
  serie: string;
  annee: number;
  duree_minutes: number;
  nb_questions_detail: number;
  matiere_nom?: string;
  matiere_code?: string;
  fichier_pdf?: string | null;
  note_moyenne?: number | null;
  nb_avis?: number;
  est_favori?: boolean;
}

type IconName = keyof typeof Ionicons.glyphMap;

const TYPE_META: Record<string, { label: string; color: string; icon: IconName }> = {
  officielle: { label: 'Annale', color: colors.violet, icon: 'ribbon-outline' },
  simulation: { label: 'Simulation', color: colors.accent, icon: 'flask-outline' },
  exercice: { label: 'Exercice', color: colors.emerald, icon: 'barbell-outline' },
};

const FILTERS: Array<{ key: string; label: string }> = [
  { key: 'Tous', label: 'Tous' },
  { key: 'officielle', label: 'Annales' },
  { key: 'simulation', label: 'Simulations' },
  { key: 'exercice', label: 'Exercices' },
];

export default function ExamensScreen() {
  const router = useRouter();
  const { user } = useAuthStore();
  const [epreuves, setEpreuves] = useState<Epreuve[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [typeFilter, setTypeFilter] = useState('Tous');
  const [selected, setSelected] = useState<Epreuve | null>(null);
  const [fav, setFav] = useState(false);

  const ouvrir = (ep: Epreuve) => { setFav(!!ep.est_favori); setSelected(ep); };
  const toggleFav = async () => {
    if (!selected) return;
    setFav((v) => !v);
    try { const r = await api.post('/favoris/toggle/', { id_epreuve: selected.id_epreuve }); setFav(r.data.est_favori); }
    catch { setFav((v) => !v); }
  };

  const fetchEpreuves = async () => {
    try {
      const params: Record<string, string> = {};
      if (typeFilter !== 'Tous') params.type_epreuve = typeFilter;
      const res = await api.get('/epreuves/', { params });
      setEpreuves(res.data.results ?? res.data);
    } catch {}
  };

  useEffect(() => {
    setLoading(true);
    fetchEpreuves().finally(() => setLoading(false));
  }, [typeFilter]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchEpreuves();
    setRefreshing(false);
  };

  const startSession = (mode: 'exercice' | 'examen_blanc') => {
    if (!selected) return;
    const ep = selected;
    setSelected(null);
    router.push(`/sessions/nouvelle?epreuveId=${ep.id_epreuve}&mode=${mode}&duree=${ep.duree_minutes}`);
  };

  // Regroupe les épreuves par matière (sections triées par nom de matière).
  const sections = (() => {
    const map = new Map<string, { title: string; code: string; data: Epreuve[] }>();
    for (const e of epreuves) {
      const key = e.matiere_code || e.matiere_nom || 'Autres';
      if (!map.has(key)) map.set(key, { title: e.matiere_nom || 'Autres', code: e.matiere_code || '', data: [] });
      map.get(key)!.data.push(e);
    }
    return Array.from(map.values()).sort((a, b) => a.title.localeCompare(b.title));
  })();

  return (
    <View style={styles.container}>
      {/* En-tête */}
      <View style={styles.header}>
        <Text style={styles.title}>Examens</Text>
        {user?.role === 'eleve' && user?.niveau_scolaire ? (
          <View style={styles.programmePill}>
            <Ionicons name="school-outline" size={13} color={colors.primary} />
            <Text style={styles.programmePillText}>Programme {user.niveau_scolaire}</Text>
          </View>
        ) : null}
      </View>

      {/* Filtre minimaliste (texte + soulignement actif) */}
      <View style={styles.filterRow}>
        {FILTERS.map((f) => {
          const active = typeFilter === f.key;
          return (
            <TouchableOpacity key={f.key} style={styles.filterTab} onPress={() => setTypeFilter(f.key)} activeOpacity={0.7}>
              <Text style={[styles.filterText, active && styles.filterTextActive]}>{f.label}</Text>
              {active ? <View style={styles.filterUnderline} /> : null}
            </TouchableOpacity>
          );
        })}
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(e) => e.id_epreuve}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          stickySectionHeadersEnabled={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          ListEmptyComponent={
            <View style={styles.centered}>
              <View style={styles.emptyIcon}><Ionicons name="document-text-outline" size={34} color={colors.primary} /></View>
              <Text style={styles.emptyText}>Aucune épreuve pour ta classe.</Text>
            </View>
          }
          renderSectionHeader={({ section }) => {
            const c = subjectColor(section.code);
            return (
              <View style={styles.sectionHeader}>
                <View style={[styles.sectionIcon, { backgroundColor: `${c}15` }]}>
                  <Ionicons name={subjectIconName(section.code)} size={16} color={c} />
                </View>
                <Text style={styles.sectionTitle}>{section.title}</Text>
                <View style={styles.sectionCountWrap}>
                  <Text style={styles.sectionCount}>{section.data.length}</Text>
                </View>
              </View>
            );
          }}
          renderItem={({ item }) => {
            const meta = TYPE_META[item.type_epreuve] ?? { label: item.type_epreuve, color: colors.textMuted, icon: 'document-outline' as IconName };
            return (
              <TouchableOpacity style={styles.card} activeOpacity={0.85} onPress={() => ouvrir(item)}>
                <View style={[styles.iconWrap, { backgroundColor: `${meta.color}15` }]}>
                  <Ionicons name={meta.icon} size={22} color={meta.color} />
                </View>
                <View style={styles.cardBody}>
                  <View style={[styles.typeBadge, { backgroundColor: `${meta.color}15` }]}>
                    <Text style={[styles.typeBadgeText, { color: meta.color }]}>{meta.label}</Text>
                  </View>
                  <Text style={styles.cardTitre} numberOfLines={2}>{item.titre}</Text>
                  <View style={styles.cardMeta}>
                    <View style={styles.metaItem}>
                      <Ionicons name="library-outline" size={13} color={colors.textLight} />
                      <Text style={styles.metaText}>{item.niveau}{item.serie ? ` · ${item.serie}` : ''}</Text>
                    </View>
                    {item.annee ? (
                      <View style={styles.metaItem}>
                        <Ionicons name="calendar-outline" size={13} color={colors.textLight} />
                        <Text style={styles.metaText}>{item.annee}</Text>
                      </View>
                    ) : null}
                    <View style={styles.metaItem}>
                      <Ionicons name="time-outline" size={13} color={colors.textLight} />
                      <Text style={styles.metaText}>{item.duree_minutes} min</Text>
                    </View>
                    <View style={styles.metaItem}>
                      <Ionicons name="help-circle-outline" size={13} color={colors.textLight} />
                      <Text style={styles.metaText}>{item.nb_questions_detail} questions</Text>
                    </View>
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.textLight} />
              </TouchableOpacity>
            );
          }}
        />
      )}

      {/* Modal de choix du mode */}
      <Modal visible={!!selected} transparent animationType="fade" onRequestClose={() => setSelected(null)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setSelected(null)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle} numberOfLines={2}>{selected?.titre}</Text>

            <View style={styles.ratingRow}>
              <StarRating value={Math.round(selected?.note_moyenne ?? 0)} size={16} />
              <Text style={styles.ratingText}>
                {selected?.note_moyenne != null ? `${selected.note_moyenne.toFixed(1)}` : '—'}
                {selected?.nb_avis ? ` · ${selected.nb_avis} avis` : ''}
              </Text>
              <View style={{ flex: 1 }} />
              <TouchableOpacity onPress={toggleFav} style={[styles.favPill, fav && styles.favPillActive]} activeOpacity={0.8}>
                <Ionicons name={fav ? 'heart' : 'heart-outline'} size={16} color={fav ? colors.danger : colors.textMuted} />
                <Text style={[styles.favPillText, fav && { color: colors.danger }]}>{fav ? 'Favori' : 'Favori'}</Text>
              </TouchableOpacity>
            </View>

            {selected?.fichier_pdf ? (
              <View style={{ marginTop: 12, marginBottom: 4 }}>
                <PdfViewButton url={selected.fichier_pdf} label="Consulter le sujet (PDF)" />
              </View>
            ) : null}
            <Text style={styles.sheetSub}>Choisis ton mode de passage</Text>

            <TouchableOpacity style={styles.modeCard} activeOpacity={0.85} onPress={() => startSession('exercice')}>
              <View style={[styles.modeIcon, { backgroundColor: `${colors.emerald}15` }]}>
                <Ionicons name="barbell-outline" size={22} color={colors.emerald} />
              </View>
              <View style={styles.modeBody}>
                <Text style={styles.modeTitle}>Entraînement</Text>
                <Text style={styles.modeDesc}>Navigation libre, correction détaillée à la fin. Idéal pour réviser.</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textLight} />
            </TouchableOpacity>

            <TouchableOpacity style={styles.modeCard} activeOpacity={0.85} onPress={() => startSession('examen_blanc')}>
              <View style={[styles.modeIcon, { backgroundColor: `${colors.violet}15` }]}>
                <Ionicons name="timer-outline" size={22} color={colors.violet} />
              </View>
              <View style={styles.modeBody}>
                <Text style={styles.modeTitle}>Examen blanc</Text>
                <Text style={styles.modeDesc}>Conditions réelles : chronomètre strict, soumission finale. {selected?.duree_minutes} min.</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textLight} />
            </TouchableOpacity>

            <TouchableOpacity style={styles.cancelBtn} onPress={() => setSelected(null)}>
              <Text style={styles.cancelText}>Annuler</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.xl, marginTop: 40 },
  header: { paddingHorizontal: spacing.md, paddingTop: 56, paddingBottom: spacing.sm },
  title: { fontSize: 28, fontWeight: '800', color: colors.text, letterSpacing: -0.5 },
  programmePill: {
    flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', marginTop: 6,
    backgroundColor: colors.primaryLight, borderRadius: radius.full, paddingHorizontal: 12, paddingVertical: 5,
  },
  programmePillText: { fontSize: 12, fontWeight: '700', color: colors.primary },

  filterRow: { flexDirection: 'row', gap: 20, paddingHorizontal: spacing.md, paddingTop: 8, paddingBottom: 4 },
  filterTab: { alignItems: 'center', paddingVertical: 6 },
  filterText: { fontSize: 14, fontWeight: '600', color: colors.textLight },
  filterTextActive: { color: colors.text, fontWeight: '800' },
  filterUnderline: { height: 3, width: 22, borderRadius: 2, backgroundColor: colors.primary, marginTop: 5 },

  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  ratingText: { fontSize: 13, fontWeight: '700', color: colors.textMuted },
  favPill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: radius.full, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border },
  favPillActive: { backgroundColor: '#FEF2F2', borderColor: '#FCA5A5' },
  favPillText: { fontSize: 12.5, fontWeight: '700', color: colors.textMuted },

  list: { padding: spacing.md, paddingBottom: 32 },
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginTop: 14, marginBottom: 10,
  },
  sectionIcon: { width: 30, height: 30, borderRadius: 9, justifyContent: 'center', alignItems: 'center' },
  sectionTitle: { flex: 1, fontSize: 16, fontWeight: '800', color: colors.text, letterSpacing: -0.3 },
  sectionCountWrap: { backgroundColor: colors.primaryLight, borderRadius: radius.full, paddingHorizontal: 9, paddingVertical: 2, minWidth: 24, alignItems: 'center' },
  sectionCount: { fontSize: 12, fontWeight: '800', color: colors.primary },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface,
    borderRadius: radius.lg, padding: spacing.md, borderWidth: 1, borderColor: colors.border, marginBottom: 12, ...shadow.sm,
  },
  iconWrap: { width: 46, height: 46, borderRadius: radius.md, justifyContent: 'center', alignItems: 'center' },
  cardBody: { flex: 1 },
  typeBadge: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.sm, marginBottom: 6 },
  typeBadgeText: { fontSize: 11, fontWeight: '800' },
  cardTitre: { fontSize: 15, fontWeight: '700', color: colors.text, marginBottom: 8, lineHeight: 20 },
  cardMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  metaText: { fontSize: 12, color: colors.textMuted, fontWeight: '600' },
  emptyIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.primaryLight, justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  emptyText: { color: colors.textMuted, fontWeight: '600' },

  modalBackdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.lg, paddingBottom: 36 },
  sheetHandle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.borderStrong, marginBottom: 16 },
  sheetTitle: { fontSize: 18, fontWeight: '800', color: colors.text },
  sheetSub: { fontSize: 13, color: colors.textMuted, marginTop: 4, marginBottom: 18 },
  modeCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surfaceAlt,
    borderRadius: radius.lg, padding: spacing.md, borderWidth: 1, borderColor: colors.border, marginBottom: 12,
  },
  modeIcon: { width: 44, height: 44, borderRadius: radius.md, justifyContent: 'center', alignItems: 'center' },
  modeBody: { flex: 1 },
  modeTitle: { fontSize: 15, fontWeight: '800', color: colors.text, marginBottom: 2 },
  modeDesc: { fontSize: 12, color: colors.textMuted, lineHeight: 17 },
  cancelBtn: { alignItems: 'center', paddingVertical: 12, marginTop: 4 },
  cancelText: { fontSize: 15, fontWeight: '700', color: colors.textMuted },
});
