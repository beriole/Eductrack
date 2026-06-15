import { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl, Modal, Pressable,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '@/src/lib/api';
import { PdfViewButton } from '@/src/components/Pdf';
import { StarRating } from '@/src/components/Feedback';
import { colors, radius, spacing, shadow, subjectColor, subjectIconName } from '@/src/theme';

type IconName = keyof typeof Ionicons.glyphMap;

interface Cours {
  id_cours: string; titre: string; nb_vues: number; duree_lecture_min: number;
  niveau: string; serie: string | null; fichier_pdf?: string | null;
}
interface Epreuve {
  id_epreuve: string; titre: string; type_epreuve: string; niveau: string; serie: string | null;
  annee: number | null; duree_minutes: number; nb_questions_detail: number;
  fichier_pdf?: string | null; note_moyenne?: number | null; nb_avis?: number; est_favori?: boolean;
}

const TYPE_META: Record<string, { label: string; color: string; icon: IconName }> = {
  officielle: { label: 'Annale', color: colors.violet, icon: 'ribbon-outline' },
  simulation: { label: 'Simulation', color: colors.accent, icon: 'flask-outline' },
  exercice: { label: 'Exercice', color: colors.emerald, icon: 'barbell-outline' },
};
const FILTERS = [
  { key: 'Tous', label: 'Tous' },
  { key: 'officielle', label: 'Annales' },
  { key: 'simulation', label: 'Simulations' },
  { key: 'exercice', label: 'Exercices' },
];

export default function MatiereContenuScreen() {
  const router = useRouter();
  const { id, nom, code, mode } = useLocalSearchParams<{ id: string; nom: string; code: string; mode: string }>();
  const isExamens = mode === 'examens';
  const tint = subjectColor(code);

  const [cours, setCours] = useState<Cours[]>([]);
  const [epreuves, setEpreuves] = useState<Epreuve[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [typeFilter, setTypeFilter] = useState('Tous');
  const [selected, setSelected] = useState<Epreuve | null>(null);
  const [fav, setFav] = useState(false);

  const fetchData = async () => {
    try {
      if (isExamens) {
        const params: Record<string, string> = { id_matiere: id };
        if (typeFilter !== 'Tous') params.type_epreuve = typeFilter;
        const r = await api.get('/epreuves/', { params });
        setEpreuves(r.data.results ?? r.data);
      } else {
        const r = await api.get('/cours/', { params: { id_matiere: id } });
        setCours(r.data.results ?? r.data);
      }
    } catch {}
  };

  useEffect(() => { setLoading(true); fetchData().finally(() => setLoading(false)); }, [typeFilter]);
  const onRefresh = async () => { setRefreshing(true); await fetchData(); setRefreshing(false); };

  const ouvrir = (ep: Epreuve) => { setFav(!!ep.est_favori); setSelected(ep); };
  const toggleFav = async () => {
    if (!selected) return;
    setFav((v) => !v);
    try { const r = await api.post('/favoris/toggle/', { id_epreuve: selected.id_epreuve }); setFav(r.data.est_favori); }
    catch { setFav((v) => !v); }
  };
  const startSession = (smode: 'exercice' | 'examen_blanc') => {
    if (!selected) return;
    const ep = selected; setSelected(null);
    router.push(`/sessions/nouvelle?epreuveId=${ep.id_epreuve}&mode=${smode}&duree=${ep.duree_minutes}`);
  };

  const Header = (
    <View style={styles.header}>
      <TouchableOpacity onPress={() => router.back()} style={styles.backRow}>
        <Ionicons name="arrow-back" size={20} color={colors.text} />
      </TouchableOpacity>
      <View style={[styles.headerIcon, { backgroundColor: `${tint}1A` }]}>
        <Ionicons name={subjectIconName(code)} size={22} color={tint} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.title} numberOfLines={1}>{nom}</Text>
        <Text style={styles.subtitle}>{isExamens ? 'Annales · Simulations · Exercices' : 'Cours de la matière'}</Text>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      {Header}

      {isExamens && (
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
      )}

      {loading ? (
        <View style={styles.centered}><ActivityIndicator size="large" color={colors.primary} /></View>
      ) : isExamens ? (
        <FlatList
          data={epreuves}
          keyExtractor={(e) => e.id_epreuve}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          ListEmptyComponent={<Empty label="Aucune épreuve dans cette matière." />}
          renderItem={({ item }) => {
            const meta = TYPE_META[item.type_epreuve] ?? { label: item.type_epreuve, color: colors.textMuted, icon: 'document-outline' as IconName };
            return (
              <TouchableOpacity style={styles.card} activeOpacity={0.85} onPress={() => ouvrir(item)}>
                <View style={[styles.cardIcon, { backgroundColor: `${meta.color}15` }]}>
                  <Ionicons name={meta.icon} size={22} color={meta.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={[styles.typeBadge, { backgroundColor: `${meta.color}15` }]}>
                    <Text style={[styles.typeBadgeText, { color: meta.color }]}>{meta.label}</Text>
                  </View>
                  <Text style={styles.cardTitle} numberOfLines={2}>{item.titre}</Text>
                  <View style={styles.metaRow}>
                    <Meta icon="library-outline" text={`${item.niveau}${item.serie ? ` · ${item.serie}` : ''}`} />
                    {item.annee ? <Meta icon="calendar-outline" text={`${item.annee}`} /> : null}
                    <Meta icon="time-outline" text={`${item.duree_minutes} min`} />
                    <Meta icon="help-circle-outline" text={`${item.nb_questions_detail} Q`} />
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.textLight} />
              </TouchableOpacity>
            );
          }}
        />
      ) : (
        <FlatList
          data={cours}
          keyExtractor={(c) => c.id_cours}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          ListEmptyComponent={<Empty label="Aucun cours dans cette matière." />}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.card} activeOpacity={0.85} onPress={() => router.push(`/cours/${item.id_cours}`)}>
              <View style={[styles.cardIcon, { backgroundColor: `${tint}15` }]}>
                <Ionicons name={item.fichier_pdf ? 'document-text' : 'book-outline'} size={22} color={tint} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle} numberOfLines={2}>{item.titre}</Text>
                <View style={styles.metaRow}>
                  <Meta icon="library-outline" text={`${item.niveau}${item.serie ? ` · ${item.serie}` : ''}`} />
                  <Meta icon="eye-outline" text={`${item.nb_vues}`} />
                  {item.duree_lecture_min ? <Meta icon="time-outline" text={`${item.duree_lecture_min} min`} /> : null}
                  {item.fichier_pdf ? <Meta icon="document-attach-outline" text="PDF" /> : null}
                </View>
              </View>
              <Ionicons name="chevron-forward" size={20} color={tint} />
            </TouchableOpacity>
          )}
        />
      )}

      {/* Modal de choix du mode (épreuves) */}
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
                <Text style={[styles.favPillText, fav && { color: colors.danger }]}>Favori</Text>
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
              <View style={{ flex: 1 }}>
                <Text style={styles.modeTitle}>Entraînement</Text>
                <Text style={styles.modeDesc}>Navigation libre, correction détaillée à la fin.</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textLight} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.modeCard} activeOpacity={0.85} onPress={() => startSession('examen_blanc')}>
              <View style={[styles.modeIcon, { backgroundColor: `${colors.violet}15` }]}>
                <Ionicons name="timer-outline" size={22} color={colors.violet} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.modeTitle}>Examen blanc</Text>
                <Text style={styles.modeDesc}>Conditions réelles : chronomètre strict. {selected?.duree_minutes} min.</Text>
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

function Meta({ icon, text }: { icon: IconName; text: string }) {
  return (
    <View style={styles.metaItem}>
      <Ionicons name={icon} size={13} color={colors.textLight} />
      <Text style={styles.metaText}>{text}</Text>
    </View>
  );
}
function Empty({ label }: { label: string }) {
  return (
    <View style={styles.centered}>
      <View style={styles.emptyIcon}><Ionicons name="document-text-outline" size={32} color={colors.primary} /></View>
      <Text style={styles.emptyText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.xl, marginTop: 40 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: spacing.md, paddingTop: 56, paddingBottom: 10 },
  backRow: { width: 38, height: 38, borderRadius: 12, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', ...shadow.sm },
  headerIcon: { width: 40, height: 40, borderRadius: radius.md, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 21, fontWeight: '800', color: colors.text, letterSpacing: -0.4 },
  subtitle: { fontSize: 12.5, color: colors.textMuted, marginTop: 1 },

  filterRow: { flexDirection: 'row', gap: 20, paddingHorizontal: spacing.md, paddingTop: 4, paddingBottom: 4 },
  filterTab: { alignItems: 'center', paddingVertical: 6 },
  filterText: { fontSize: 14, fontWeight: '600', color: colors.textLight },
  filterTextActive: { color: colors.text, fontWeight: '800' },
  filterUnderline: { height: 3, width: 22, borderRadius: 2, backgroundColor: colors.primary, marginTop: 5 },

  list: { padding: spacing.md, paddingBottom: 32 },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface,
    borderRadius: radius.lg, padding: spacing.md, borderWidth: 1, borderColor: colors.border, marginBottom: 12, ...shadow.sm,
  },
  cardIcon: { width: 46, height: 46, borderRadius: radius.md, justifyContent: 'center', alignItems: 'center' },
  typeBadge: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.sm, marginBottom: 6 },
  typeBadgeText: { fontSize: 11, fontWeight: '800' },
  cardTitle: { fontSize: 15, fontWeight: '700', color: colors.text, marginBottom: 8, lineHeight: 20 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  metaText: { fontSize: 12, color: colors.textMuted, fontWeight: '600' },
  emptyIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.primaryLight, justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  emptyText: { color: colors.textMuted, fontWeight: '600', textAlign: 'center' },

  modalBackdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.lg, paddingBottom: 36 },
  sheetHandle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.borderStrong, marginBottom: 16 },
  sheetTitle: { fontSize: 18, fontWeight: '800', color: colors.text },
  sheetSub: { fontSize: 13, color: colors.textMuted, marginTop: 4, marginBottom: 18 },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  ratingText: { fontSize: 13, fontWeight: '700', color: colors.textMuted },
  favPill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: radius.full, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border },
  favPillActive: { backgroundColor: '#FEF2F2', borderColor: '#FCA5A5' },
  favPillText: { fontSize: 12.5, fontWeight: '700', color: colors.textMuted },
  modeCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surfaceAlt, borderRadius: radius.lg, padding: spacing.md, borderWidth: 1, borderColor: colors.border, marginBottom: 12 },
  modeIcon: { width: 44, height: 44, borderRadius: radius.md, justifyContent: 'center', alignItems: 'center' },
  modeTitle: { fontSize: 15, fontWeight: '800', color: colors.text, marginBottom: 2 },
  modeDesc: { fontSize: 12, color: colors.textMuted, lineHeight: 17 },
  cancelBtn: { alignItems: 'center', paddingVertical: 12, marginTop: 4 },
  cancelText: { fontSize: 15, fontWeight: '700', color: colors.textMuted },
});
