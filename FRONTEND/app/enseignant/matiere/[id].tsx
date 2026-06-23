import { useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, RefreshControl } from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '@/src/lib/api';
import { GradientBox } from '@/src/components/GradientBox';
import { colors, radius, spacing, shadow, subjectColor, subjectIconName } from '@/src/theme';

type IconName = keyof typeof Ionicons.glyphMap;
type Kind = 'cours' | 'examens' | 'exercices';

interface Item {
  id_cours?: string; id_epreuve?: string; titre: string;
  niveau: string; serie: string | null; statut?: string; nb_vues?: number;
  type_epreuve?: string; annee?: number | null; nb_questions_detail?: number;
  corrige?: string | null; corrige_pdf?: string | null; fichier_pdf?: string | null;
  matiere_code?: string;
}

const STATUT: Record<string, { label: string; color: string }> = {
  brouillon: { label: 'Brouillon', color: colors.textMuted },
  en_revision: { label: 'En révision', color: colors.warning },
  publie: { label: 'Publié', color: colors.success },
  archive: { label: 'Archivé', color: colors.textLight },
};
const TYPE_META: Record<string, { label: string; color: string; icon: IconName }> = {
  officielle: { label: 'Annale', color: colors.violet, icon: 'ribbon' },
  simulation: { label: 'Simulation', color: colors.accent, icon: 'flask' },
  exercice: { label: 'Exercice', color: colors.emerald, icon: 'barbell' },
};

const CFG: Record<Kind, { title: string; fabLabel: string; fabIcon: IconName; fabRoute: string }> = {
  cours: { title: 'Cours', fabLabel: 'Nouveau cours', fabIcon: 'add', fabRoute: '/enseignant/cours/nouveau' },
  examens: { title: 'Examens', fabLabel: 'Importer un sujet', fabIcon: 'cloud-upload', fabRoute: '/enseignant/importer' },
  exercices: { title: 'Exercices', fabLabel: 'Nouvel exercice', fabIcon: 'add', fabRoute: '/enseignant/exercices/nouveau' },
};

export default function EnsMatiereContenuScreen() {
  const router = useRouter();
  const { id, nom, code, kind } = useLocalSearchParams<{ id: string; nom: string; code: string; kind: Kind }>();
  const k: Kind = (kind as Kind) || 'cours';
  const cfg = CFG[k];
  const tint = subjectColor(code);

  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      if (k === 'cours') {
        const r = await api.get('/cours/', { params: { id_matiere: id } });
        const data: Item[] = r.data.results ?? r.data;
        setItems(data.filter((c) => c.matiere_code === code || !code));
      } else {
        const params: Record<string, string> = {};
        if (k === 'exercices') params.type_epreuve = 'exercice';
        const r = await api.get('/enseignant/epreuves/', { params });
        const data: Item[] = r.data.results ?? r.data;
        setItems(data.filter((e) => e.matiere_code === code || !code));
      }
    } catch {}
  }, [id, code, k]);

  useFocusEffect(useCallback(() => { setLoading(true); fetchData().finally(() => setLoading(false)); }, [fetchData]));
  const onRefresh = async () => { setRefreshing(true); await fetchData(); setRefreshing(false); };

  const openItem = (item: Item) => {
    if (k === 'cours') router.push(`/enseignant/cours/${item.id_cours}` as any);
    else if (k === 'exercices') router.push(`/enseignant/exercices/${item.id_epreuve}` as any);
    else router.push(`/enseignant/examens/${item.id_epreuve}` as any);
  };

  return (
    <View style={styles.container}>
      <GradientBox colors={[`${tint}E6`, tint]} style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backRow}>
          <Ionicons name="arrow-back" size={20} color="#fff" />
        </TouchableOpacity>
        <View style={styles.headerIcon}>
          <Ionicons name={subjectIconName(code)} size={22} color="#fff" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title} numberOfLines={1}>{nom}</Text>
          <Text style={styles.subtitle}>{cfg.title} · {items.length}</Text>
        </View>
      </GradientBox>

      {loading ? (
        <View style={styles.centered}><ActivityIndicator size="large" color={colors.primary} /></View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(it) => (it.id_cours ?? it.id_epreuve) as string}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          ListEmptyComponent={
            <View style={styles.centered}>
              <View style={styles.emptyIcon}><Ionicons name="documents-outline" size={32} color={colors.primary} /></View>
              <Text style={styles.emptyText}>Aucun contenu dans cette matière. Appuie sur « {cfg.fabLabel} ».</Text>
            </View>
          }
          renderItem={({ item }) => {
            if (k === 'cours') {
              const meta = STATUT[item.statut ?? 'brouillon'] ?? STATUT.brouillon;
              return (
                <TouchableOpacity style={styles.card} activeOpacity={0.85} onPress={() => openItem(item)}>
                  <View style={[styles.cardIcon, { backgroundColor: `${tint}15` }]}>
                    <Ionicons name={item.fichier_pdf ? 'document-text' : 'book-outline'} size={22} color={tint} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardTitle} numberOfLines={1}>{item.titre}</Text>
                    <Text style={styles.cardSub}>{item.niveau}{item.serie ? ` · ${item.serie}` : ''}</Text>
                    <View style={styles.tagRow}>
                      <View style={[styles.badge, { backgroundColor: `${meta.color}15` }]}><Text style={[styles.badgeText, { color: meta.color }]}>{meta.label}</Text></View>
                      <View style={styles.metaItem}><Ionicons name="eye-outline" size={13} color={colors.textLight} /><Text style={styles.metaText}>{item.nb_vues ?? 0}</Text></View>
                      {item.fichier_pdf ? <View style={styles.metaItem}><Ionicons name="document-attach-outline" size={13} color={colors.info} /><Text style={[styles.metaText, { color: colors.info }]}>PDF</Text></View> : null}
                    </View>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.textLight} />
                </TouchableOpacity>
              );
            }
            const meta = TYPE_META[item.type_epreuve ?? ''] ?? { label: item.type_epreuve ?? '', color: colors.textMuted, icon: 'document' as IconName };
            const hasCorrige = !!(item.corrige?.trim() || item.corrige_pdf);
            return (
              <TouchableOpacity style={styles.card} activeOpacity={0.85} onPress={() => openItem(item)}>
                <View style={[styles.cardIcon, { backgroundColor: `${meta.color}15` }]}>
                  <Ionicons name={meta.icon} size={22} color={meta.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle} numberOfLines={2}>{item.titre}</Text>
                  <Text style={styles.cardSub}>{item.niveau}{item.serie ? ` · ${item.serie}` : ''}{item.annee ? ` · ${item.annee}` : ''}</Text>
                  <View style={styles.tagRow}>
                    <View style={[styles.badge, { backgroundColor: `${meta.color}15` }]}><Text style={[styles.badgeText, { color: meta.color }]}>{meta.label}</Text></View>
                    <View style={styles.metaItem}><Ionicons name="help-circle-outline" size={13} color={colors.textLight} /><Text style={styles.metaText}>{item.nb_questions_detail ?? 0} Q</Text></View>
                    <View style={styles.metaItem}><Ionicons name={hasCorrige ? 'checkmark-circle' : 'ellipse-outline'} size={13} color={hasCorrige ? colors.success : colors.textLight} /><Text style={[styles.metaText, hasCorrige && { color: colors.success }]}>Corrigé</Text></View>
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textLight} />
              </TouchableOpacity>
            );
          }}
        />
      )}

      <TouchableOpacity style={styles.fab} onPress={() => router.push(cfg.fabRoute as any)} activeOpacity={0.9}>
        <Ionicons name={cfg.fabIcon} size={22} color={colors.white} /><Text style={styles.fabText}>{cfg.fabLabel}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.xl, marginTop: 40 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: spacing.md, paddingTop: 56, paddingBottom: 18, borderBottomLeftRadius: radius.xl, borderBottomRightRadius: radius.xl },
  backRow: { width: 38, height: 38, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
  headerIcon: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: 'rgba(255,255,255,0.18)', justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 21, fontWeight: '800', color: '#fff', letterSpacing: -0.4 },
  subtitle: { fontSize: 12.5, color: 'rgba(255,255,255,0.85)', marginTop: 1 },
  list: { padding: spacing.md, paddingBottom: 110 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, borderWidth: 1, borderColor: colors.border, marginBottom: 12, ...shadow.sm },
  cardIcon: { width: 46, height: 46, borderRadius: radius.md, justifyContent: 'center', alignItems: 'center' },
  cardTitle: { fontSize: 15, fontWeight: '800', color: colors.text, lineHeight: 20 },
  cardSub: { fontSize: 12.5, color: colors.textMuted, marginTop: 3 },
  tagRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8, flexWrap: 'wrap' },
  badge: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: radius.full },
  badgeText: { fontSize: 11, fontWeight: '800' },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  metaText: { fontSize: 12, color: colors.textLight, fontWeight: '600' },
  emptyIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.primaryLight, justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  emptyText: { color: colors.textMuted, fontWeight: '600', textAlign: 'center' },
  fab: { position: 'absolute', right: spacing.md, bottom: 24, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.primary, borderRadius: radius.full, paddingVertical: 14, paddingHorizontal: 20, ...shadow.lg },
  fabText: { color: colors.white, fontWeight: '800', fontSize: 15 },
});
