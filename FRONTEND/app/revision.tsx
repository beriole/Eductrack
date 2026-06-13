import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl, Modal, Pressable, Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '@/src/lib/api';
import { colors, radius, spacing, shadow } from '@/src/theme';

interface Lacune {
  id_lacune: string;
  chapitre: string;
  notion: string;
  taux_maitrise: number;
  statut: string;
  matiere_nom: string;
}

interface MicroLecon {
  id_lecon: string;
  titre: string;
  contenu: string;
  points_cles: string[];
  matiere_nom: string;
  notion: string | null;
  lue: boolean;
  source: string;
}

const STATUT_META: Record<string, { color: string; label: string }> = {
  detectee: { color: colors.danger, label: 'À travailler' },
  en_cours: { color: colors.warning, label: 'En cours' },
  maitrisee: { color: colors.success, label: 'Maîtrisée' },
};

export default function RevisionScreen() {
  const router = useRouter();
  const [lacunes, setLacunes] = useState<Lacune[]>([]);
  const [lecons, setLecons] = useState<MicroLecon[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [analyse, setAnalyse] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [lecon, setLecon] = useState<MicroLecon | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      const [resLac, resLec] = await Promise.all([
        api.get('/analytique/lacunes/'),
        api.get('/lecons/'),
      ]);
      setLacunes(resLac.data.results ?? resLac.data);
      setLecons(resLec.data.results ?? resLec.data);
    } catch {}
  }, []);

  useEffect(() => {
    fetchAll().finally(() => setLoading(false));
  }, [fetchAll]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchAll();
    setRefreshing(false);
  };

  const analyser = async () => {
    setAnalyse(true);
    try {
      const res = await api.post('/analytique/lacunes/detecter/');
      setLacunes(res.data.lacunes ?? []);
      const r = res.data.recap;
      Alert.alert(
        'Analyse terminée',
        `${r.detectees} à travailler · ${r.en_cours} en cours · ${r.maitrisees} maîtrisée(s).`,
      );
    } catch {
      Alert.alert('Oups', "Impossible d'analyser pour le moment.");
    } finally {
      setAnalyse(false);
    }
  };

  const genererExercice = async (l: Lacune) => {
    setBusy(`ex-${l.id_lacune}`);
    try {
      const res = await api.post('/exercices/generer/', { id_lacune: l.id_lacune, nb_questions: 5 });
      const ep = res.data;
      router.push(`/sessions/nouvelle?epreuveId=${ep.id_epreuve}&mode=exercice&duree=${ep.duree_minutes}`);
    } catch {
      Alert.alert('Oups', "La génération d'exercice a échoué.");
    } finally {
      setBusy(null);
    }
  };

  const genererLecon = async (l: Lacune) => {
    setBusy(`lec-${l.id_lacune}`);
    try {
      const res = await api.post('/lecons/generer/', { id_lacune: l.id_lacune });
      setLecon(res.data);
      setLecons((prev) => [res.data, ...prev.filter((x) => x.id_lecon !== res.data.id_lecon)]);
    } catch {
      Alert.alert('Oups', "La génération de leçon a échoué.");
    } finally {
      setBusy(null);
    }
  };

  const ouvrirLecon = async (l: MicroLecon) => {
    setLecon(l);
    if (!l.lue) {
      try {
        await api.patch(`/lecons/${l.id_lecon}/lue/`);
        setLecons((prev) => prev.map((x) => (x.id_lecon === l.id_lecon ? { ...x, lue: true } : x)));
      } catch {}
    }
  };

  if (loading) {
    return <View style={styles.centered}><ActivityIndicator size="large" color={colors.primary} /></View>;
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backRow}>
          <Ionicons name="arrow-back" size={20} color={colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Révision intelligente</Text>
          <Text style={styles.subtitle}>Tes points faibles, ciblés par l'IA</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        {/* Analyse */}
        <TouchableOpacity style={styles.analyseBtn} onPress={analyser} disabled={analyse} activeOpacity={0.85}>
          {analyse
            ? <ActivityIndicator size="small" color={colors.white} />
            : <Ionicons name="sparkles" size={18} color={colors.white} />}
          <Text style={styles.analyseBtnText}>
            {analyse ? 'Analyse en cours…' : 'Analyser mes lacunes'}
          </Text>
        </TouchableOpacity>

        {/* Lacunes */}
        <Text style={styles.sectionLabel}>Mes lacunes</Text>
        {lacunes.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="checkmark-done-circle-outline" size={34} color={colors.success} />
            <Text style={styles.emptyText}>Aucune lacune détectée. Passe des épreuves puis lance l'analyse.</Text>
          </View>
        ) : (
          lacunes.map((l) => {
            const meta = STATUT_META[l.statut] ?? STATUT_META.detectee;
            return (
              <View key={l.id_lacune} style={styles.card}>
                <View style={styles.cardTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardTitle}>{l.notion}</Text>
                    <Text style={styles.cardSub}>{l.matiere_nom} · {l.chapitre}</Text>
                  </View>
                  <View style={[styles.statutBadge, { backgroundColor: `${meta.color}15` }]}>
                    <Text style={[styles.statutText, { color: meta.color }]}>{meta.label}</Text>
                  </View>
                </View>

                <View style={styles.masteryBar}>
                  <View style={[styles.masteryFill, { width: `${l.taux_maitrise}%`, backgroundColor: meta.color }]} />
                </View>
                <Text style={styles.masteryLabel}>{Math.round(l.taux_maitrise)}% de maîtrise</Text>

                <View style={styles.actions}>
                  <TouchableOpacity
                    style={[styles.actionBtn, styles.actionPrimary]}
                    onPress={() => genererExercice(l)}
                    disabled={busy === `ex-${l.id_lacune}`}
                    activeOpacity={0.85}
                  >
                    {busy === `ex-${l.id_lacune}`
                      ? <ActivityIndicator size="small" color={colors.white} />
                      : <><Ionicons name="barbell" size={15} color={colors.white} />
                          <Text style={styles.actionPrimaryText}>Exercice ciblé</Text></>}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.actionBtn, styles.actionGhost]}
                    onPress={() => genererLecon(l)}
                    disabled={busy === `lec-${l.id_lacune}`}
                    activeOpacity={0.85}
                  >
                    {busy === `lec-${l.id_lacune}`
                      ? <ActivityIndicator size="small" color={colors.primary} />
                      : <><Ionicons name="book" size={15} color={colors.primary} />
                          <Text style={styles.actionGhostText}>Micro-leçon</Text></>}
                  </TouchableOpacity>
                </View>
              </View>
            );
          })
        )}

        {/* Micro-leçons */}
        {lecons.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>Mes micro-leçons</Text>
            {lecons.map((l) => (
              <TouchableOpacity key={l.id_lecon} style={styles.leconRow} onPress={() => ouvrirLecon(l)} activeOpacity={0.8}>
                <View style={[styles.leconIcon, { backgroundColor: colors.primaryLight }]}>
                  <Ionicons name="document-text" size={18} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.leconTitle} numberOfLines={1}>{l.titre}</Text>
                  <Text style={styles.leconSub}>{l.matiere_nom}</Text>
                </View>
                {!l.lue && <View style={styles.unread} />}
                <Ionicons name="chevron-forward" size={18} color={colors.textLight} />
              </TouchableOpacity>
            ))}
          </>
        )}

        <View style={{ height: 24 }} />
      </ScrollView>

      {/* Lecteur de micro-leçon */}
      <Modal visible={!!lecon} transparent animationType="slide" onRequestClose={() => setLecon(null)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setLecon(null)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.sheetHandle} />
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.leconModalTitle}>{lecon?.titre}</Text>
              {lecon?.notion ? <Text style={styles.leconModalMeta}>{lecon?.matiere_nom} · {lecon?.notion}</Text> : null}
              <Text style={styles.leconContenu}>{lecon?.contenu}</Text>
              {(lecon?.points_cles?.length ?? 0) > 0 && (
                <View style={styles.pointsBox}>
                  <Text style={styles.pointsTitle}>À retenir</Text>
                  {lecon!.points_cles.map((p, i) => (
                    <View key={i} style={styles.pointRow}>
                      <Ionicons name="ellipse" size={6} color={colors.primary} style={{ marginTop: 7 }} />
                      <Text style={styles.pointText}>{p}</Text>
                    </View>
                  ))}
                </View>
              )}
              <TouchableOpacity style={styles.closeBtn} onPress={() => setLecon(null)}>
                <Text style={styles.closeBtnText}>Fermer</Text>
              </TouchableOpacity>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: spacing.md, paddingTop: 56, paddingBottom: 12 },
  backRow: { width: 38, height: 38, borderRadius: 12, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', ...shadow.sm },
  title: { fontSize: 22, fontWeight: '800', color: colors.text, letterSpacing: -0.4 },
  subtitle: { fontSize: 13, color: colors.textMuted, marginTop: 1 },
  scroll: { padding: spacing.md, paddingTop: 4 },

  analyseBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: 14, marginBottom: 18, ...shadow.lg },
  analyseBtnText: { color: colors.white, fontWeight: '800', fontSize: 15 },

  sectionLabel: { fontSize: 13, fontWeight: '800', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10, marginTop: 8 },
  emptyCard: { alignItems: 'center', gap: 10, backgroundColor: colors.surface, borderRadius: radius.lg, padding: 24, ...shadow.sm },
  emptyText: { color: colors.textMuted, textAlign: 'center', fontSize: 13, lineHeight: 19 },

  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, marginBottom: 12, ...shadow.sm },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  cardTitle: { fontSize: 15, fontWeight: '800', color: colors.text },
  cardSub: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  statutBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.full },
  statutText: { fontSize: 11, fontWeight: '800' },
  masteryBar: { height: 6, backgroundColor: colors.border, borderRadius: 3, overflow: 'hidden', marginTop: 12 },
  masteryFill: { height: '100%', borderRadius: 3 },
  masteryLabel: { fontSize: 11, color: colors.textLight, fontWeight: '600', marginTop: 5 },

  actions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: radius.md, paddingVertical: 11 },
  actionPrimary: { backgroundColor: colors.primary },
  actionPrimaryText: { color: colors.white, fontWeight: '800', fontSize: 13 },
  actionGhost: { backgroundColor: colors.primaryLight },
  actionGhostText: { color: colors.primary, fontWeight: '800', fontSize: 13 },

  leconRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface, borderRadius: radius.md, padding: 12, marginBottom: 8, ...shadow.sm },
  leconIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  leconTitle: { fontSize: 14, fontWeight: '700', color: colors.text },
  leconSub: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  unread: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.primary, marginRight: 4 },

  modalBackdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.lg, paddingBottom: 32, maxHeight: '85%' },
  sheetHandle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.borderStrong, marginBottom: 16 },
  leconModalTitle: { fontSize: 20, fontWeight: '800', color: colors.text, letterSpacing: -0.4 },
  leconModalMeta: { fontSize: 13, color: colors.primary, fontWeight: '700', marginTop: 4 },
  leconContenu: { fontSize: 15, color: colors.text, lineHeight: 23, marginTop: 14 },
  pointsBox: { backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: 16, marginTop: 18 },
  pointsTitle: { fontSize: 13, fontWeight: '800', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
  pointRow: { flexDirection: 'row', gap: 10, marginBottom: 8 },
  pointText: { flex: 1, fontSize: 14, color: colors.text, lineHeight: 20 },
  closeBtn: { alignItems: 'center', paddingVertical: 14, marginTop: 16, backgroundColor: colors.surfaceAlt, borderRadius: radius.md },
  closeBtnText: { fontSize: 15, fontWeight: '700', color: colors.textMuted },
});
