import { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '@/src/lib/api';
import { PdfViewButton } from '@/src/components/Pdf';
import { signalerEtude } from '@/src/lib/reminders';
import { colors, radius, spacing, shadow } from '@/src/theme';

interface CorrectionQuestion {
  id_question: string;
  numero_ordre: number;
  enonce: string;
  type_question: string;
  options: Array<{ key: string; texte: string }> | string[];
  points: number;
  difficulte: string;
  reponse_eleve: string | null;
  reponse_correcte: string | null;
  explication: string | null;
  est_correcte: boolean;
  repondu: boolean;
}

interface Correction {
  epreuve_titre: string;
  mode: string;
  note_obtenue: number;
  nb_questions: number;
  nb_bonnes_reponses: number;
  nb_sans_reponse: number;
  duree_reelle_sec: number | null;
  par_difficulte: Record<string, { bonnes: number; total: number }>;
  notions_a_revoir: string[];
  questions: CorrectionQuestion[];
  corrige?: string | null;
  corrige_pdf?: string | null;
}

const DIFF_LABELS: Record<string, string> = { facile: 'Facile', moyen: 'Moyen', difficile: 'Difficile' };

function optionLabel(q: CorrectionQuestion, value: string | null): string {
  if (value == null || value === '') return '—';
  if (q.type_question === 'vrai_faux') return value === 'vrai' ? 'Vrai' : value === 'faux' ? 'Faux' : value;
  if (q.type_question === 'qcm' && Array.isArray(q.options)) {
    const opts = q.options.map((o) => (typeof o === 'string' ? { key: o, texte: o } : o));
    const idx = opts.findIndex((o) => o.key === value);
    if (idx >= 0) return `${String.fromCharCode(65 + idx)}. ${opts[idx].texte}`;
  }
  return value;
}

export default function ResultatScreen() {
  const router = useRouter();
  const { sessionId, timeout } = useLocalSearchParams<{ sessionId: string; timeout?: string }>();
  const [data, setData] = useState<Correction | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'resume' | 'correction'>('resume');

  useEffect(() => {
    api.get(`/sessions/${sessionId}/correction/`)
      .then((res) => setData(res.data))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
    // L'élève vient d'étudier : on évite le rappel « ta série va sauter » ce soir
    // et on repousse les relances d'inactivité.
    signalerEtude();
  }, [sessionId]);

  if (loading) {
    return <View style={styles.centered}><ActivityIndicator size="large" color={colors.primary} /></View>;
  }
  if (!data) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errText}>Impossible de charger la correction.</Text>
        <TouchableOpacity onPress={() => router.replace('/(tabs)/examens')} style={styles.backLinkRow}>
          <Ionicons name="arrow-back" size={16} color={colors.primary} />
          <Text style={styles.backLink}>Retour aux examens</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const { note_obtenue, nb_bonnes_reponses, nb_questions, nb_sans_reponse, notions_a_revoir, par_difficulte, questions } = data;
  const pct = Math.round((nb_bonnes_reponses / (nb_questions || 1)) * 100);
  const success = note_obtenue >= 10;
  const accent = success ? colors.emerald : colors.amber;

  return (
    <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
      {timeout ? (
        <View style={styles.timeoutBanner}>
          <Ionicons name="alarm-outline" size={16} color={colors.danger} />
          <Text style={styles.timeoutText}>Temps écoulé — soumission automatique</Text>
        </View>
      ) : null}

      {/* En-tête résultat */}
      <View style={[styles.heroIcon, { backgroundColor: `${accent}15` }]}>
        <Ionicons name={success ? 'trophy' : 'school'} size={40} color={accent} />
      </View>
      <Text style={styles.resultTitle}>{success ? 'Bien joué !' : 'Continue à t\'entraîner'}</Text>
      <Text style={styles.epreuveTitre} numberOfLines={2}>{data.epreuve_titre}</Text>

      {/* Score */}
      <View style={[styles.scoreCircle, { borderColor: accent }]}>
        <Text style={[styles.scoreValue, { color: accent }]}>{note_obtenue.toFixed(1)}</Text>
        <Text style={styles.scoreMax}>/ 20</Text>
      </View>

      {/* Onglets */}
      <View style={styles.tabs}>
        {(['resume', 'correction'] as const).map((t) => (
          <TouchableOpacity key={t} style={[styles.tab, tab === t && styles.tabActive]} onPress={() => setTab(t)}>
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>{t === 'resume' ? 'Résumé' : 'Correction'}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {tab === 'resume' ? (
        <View style={styles.section}>
          {/* Stats */}
          <View style={styles.statsRow}>
            <StatBox icon="checkmark-circle" label="Bonnes" value={`${nb_bonnes_reponses}/${nb_questions}`} color={colors.emerald} />
            <StatBox icon="stats-chart" label="Réussite" value={`${pct}%`} color={colors.primary} />
            <StatBox icon="help-circle" label="Sans réponse" value={`${nb_sans_reponse}`} color={colors.textMuted} />
          </View>

          {/* Analyse par difficulté */}
          {Object.keys(par_difficulte).length > 0 ? (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Analyse par difficulté</Text>
              {Object.entries(par_difficulte).map(([diff, s]) => {
                const p = Math.round((s.bonnes / (s.total || 1)) * 100);
                return (
                  <View key={diff} style={styles.diffRow}>
                    <Text style={styles.diffLabel}>{DIFF_LABELS[diff] ?? diff}</Text>
                    <View style={styles.diffBarTrack}>
                      <View style={[styles.diffBarFill, { width: `${p}%`, backgroundColor: p >= 50 ? colors.emerald : colors.amber }]} />
                    </View>
                    <Text style={styles.diffPct}>{s.bonnes}/{s.total}</Text>
                  </View>
                );
              })}
            </View>
          ) : null}

          {/* Notions à revoir */}
          {notions_a_revoir.length > 0 ? (
            <View style={[styles.card, { backgroundColor: '#FFF7ED', borderColor: '#FED7AA' }]}>
              <View style={styles.cardTitleRow}>
                <Ionicons name="bulb-outline" size={18} color={colors.amber} />
                <Text style={[styles.cardTitle, { marginBottom: 0 }]}>Notions à revoir</Text>
              </View>
              {notions_a_revoir.map((n, i) => (
                <View key={i} style={styles.notionRow}>
                  <View style={styles.notionDot} />
                  <Text style={styles.notionText}>{n}</Text>
                </View>
              ))}
            </View>
          ) : (
            <View style={[styles.card, { flexDirection: 'row', alignItems: 'center', gap: 10 }]}>
              <Ionicons name="ribbon-outline" size={20} color={colors.emerald} />
              <Text style={styles.perfectText}>Aucune lacune détectée sur cet examen. Excellent !</Text>
            </View>
          )}
        </View>
      ) : (
        <View style={styles.section}>
          {/* Corrigé de l'enseignant (sujet/annale) — révélé après composition */}
          {(data.corrige_pdf || data.corrige) ? (
            <View style={[styles.card, { backgroundColor: '#F0FDF4', borderColor: '#BBF7D0' }]}>
              <View style={styles.cardTitleRow}>
                <Ionicons name="checkmark-done-circle" size={18} color={colors.emerald} />
                <Text style={[styles.cardTitle, { marginBottom: 0 }]}>Corrigé de l'enseignant</Text>
              </View>
              {data.corrige ? <Text style={styles.corrigeText}>{data.corrige}</Text> : null}
              {data.corrige_pdf ? (
                <View style={{ marginTop: data.corrige ? 12 : 4 }}>
                  <PdfViewButton url={data.corrige_pdf} label="Consulter le corrigé (PDF)" />
                </View>
              ) : null}
            </View>
          ) : null}

          {questions.map((q) => {
            const ok = q.est_correcte;
            const manual = q.reponse_correcte == null; // ex. rédaction (non auto-corrigée)
            const statusColor = manual ? colors.info : ok ? colors.emerald : colors.danger;
            return (
              <View key={q.id_question} style={styles.qCard}>
                <View style={styles.qCardHead}>
                  <View style={[styles.qStatusIcon, { backgroundColor: `${statusColor}15` }]}>
                    <Ionicons name={manual ? 'time' : ok ? 'checkmark' : 'close'} size={16} color={statusColor} />
                  </View>
                  <Text style={styles.qCardNum}>Question {q.numero_ordre}</Text>
                  <View style={[styles.diffPill, { backgroundColor: colors.surfaceAlt }]}>
                    <Text style={styles.diffPillText}>{DIFF_LABELS[q.difficulte] ?? q.difficulte}</Text>
                  </View>
                </View>
                <Text style={styles.qEnonce}>{q.enonce}</Text>

                {/* Réponse de l'élève */}
                <View style={[styles.answerLine, { backgroundColor: ok ? '#ECFDF5' : '#FEF2F2' }]}>
                  <Text style={styles.answerLabel}>Ta réponse</Text>
                  <Text style={[styles.answerValue, { color: ok ? colors.emerald : colors.danger }]}>
                    {optionLabel(q, q.reponse_eleve)}
                  </Text>
                </View>

                {/* Bonne réponse (si différente / si fausse) */}
                {!manual && !ok ? (
                  <View style={[styles.answerLine, { backgroundColor: '#ECFDF5' }]}>
                    <Text style={styles.answerLabel}>Bonne réponse</Text>
                    <Text style={[styles.answerValue, { color: colors.emerald }]}>{optionLabel(q, q.reponse_correcte)}</Text>
                  </View>
                ) : null}

                {/* Explication */}
                {q.explication ? (
                  <View style={styles.explainBox}>
                    <View style={styles.cardTitleRow}>
                      <Ionicons name="bulb-outline" size={15} color={colors.primary} />
                      <Text style={styles.explainTitle}>Explication</Text>
                    </View>
                    <Text style={styles.explainText}>{q.explication}</Text>
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>
      )}

      {/* Actions */}
      <View style={styles.actions}>
        <TouchableOpacity style={styles.primaryBtn} onPress={() => router.replace('/(tabs)/examens')}>
          <Text style={styles.primaryBtnText}>Autres épreuves</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondaryBtn} onPress={() => router.replace('/(tabs)/dashboard')}>
          <Text style={styles.secondaryBtnText}>Tableau de bord</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

function StatBox({ icon, label, value, color }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string; color: string }) {
  return (
    <View style={styles.statBox}>
      <Ionicons name={icon} size={18} color={color} />
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, backgroundColor: colors.bg, alignItems: 'center', paddingHorizontal: spacing.md, paddingTop: 56, paddingBottom: 40 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, backgroundColor: colors.bg },
  errText: { color: colors.textMuted, marginBottom: 12 },
  backLinkRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  backLink: { color: colors.primary, fontWeight: '700' },

  timeoutBanner: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#FEF2F2', borderRadius: radius.full, paddingHorizontal: 14, paddingVertical: 7, marginBottom: 16 },
  timeoutText: { color: colors.danger, fontWeight: '700', fontSize: 13 },

  heroIcon: { width: 84, height: 84, borderRadius: 42, justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  resultTitle: { fontSize: 24, fontWeight: '800', color: colors.text },
  epreuveTitre: { fontSize: 14, color: colors.textMuted, marginTop: 4, marginBottom: 20, textAlign: 'center' },
  scoreCircle: { width: 132, height: 132, borderRadius: 66, borderWidth: 6, justifyContent: 'center', alignItems: 'center', marginBottom: 24, backgroundColor: colors.surface },
  scoreValue: { fontSize: 42, fontWeight: '900' },
  scoreMax: { fontSize: 15, color: colors.textLight, fontWeight: '700' },

  tabs: { flexDirection: 'row', backgroundColor: colors.surfaceAlt, borderRadius: radius.full, padding: 4, marginBottom: 18, width: '100%' },
  tab: { flex: 1, paddingVertical: 10, borderRadius: radius.full, alignItems: 'center' },
  tabActive: { backgroundColor: colors.surface, ...shadow.sm },
  tabText: { fontSize: 14, fontWeight: '700', color: colors.textMuted },
  tabTextActive: { color: colors.text },

  section: { width: '100%', gap: 12 },
  statsRow: { flexDirection: 'row', gap: 10 },
  statBox: { flex: 1, backgroundColor: colors.surface, borderRadius: radius.md, paddingVertical: 14, alignItems: 'center', gap: 4, borderWidth: 1, borderColor: colors.border },
  statValue: { fontSize: 18, fontWeight: '800' },
  statLabel: { fontSize: 11, color: colors.textMuted, fontWeight: '600' },

  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, borderWidth: 1, borderColor: colors.border },
  cardTitle: { fontSize: 15, fontWeight: '800', color: colors.text, marginBottom: 12 },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
  corrigeText: { fontSize: 14, color: colors.text, lineHeight: 21 },
  diffRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  diffLabel: { fontSize: 13, fontWeight: '700', color: colors.text, width: 64 },
  diffBarTrack: { flex: 1, height: 8, borderRadius: 4, backgroundColor: colors.border, overflow: 'hidden' },
  diffBarFill: { height: '100%', borderRadius: 4 },
  diffPct: { fontSize: 12, fontWeight: '700', color: colors.textMuted, width: 36, textAlign: 'right' },

  notionRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 8 },
  notionDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.amber, marginTop: 6 },
  notionText: { flex: 1, fontSize: 13, color: '#9A3412', lineHeight: 19, fontWeight: '500' },
  perfectText: { flex: 1, fontSize: 14, color: colors.text, fontWeight: '600' },

  qCard: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, borderWidth: 1, borderColor: colors.border },
  qCardHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  qStatusIcon: { width: 28, height: 28, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  qCardNum: { flex: 1, fontSize: 14, fontWeight: '800', color: colors.text },
  diffPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.sm },
  diffPillText: { fontSize: 11, fontWeight: '700', color: colors.textMuted },
  qEnonce: { fontSize: 15, fontWeight: '600', color: colors.text, lineHeight: 21, marginBottom: 12 },
  answerLine: { borderRadius: radius.sm, padding: 10, marginBottom: 6 },
  answerLabel: { fontSize: 11, fontWeight: '700', color: colors.textMuted, marginBottom: 2, textTransform: 'uppercase' },
  answerValue: { fontSize: 14, fontWeight: '700' },
  explainBox: { backgroundColor: colors.primaryLight, borderRadius: radius.sm, padding: 12, marginTop: 6 },
  explainTitle: { fontSize: 13, fontWeight: '800', color: colors.primary },
  explainText: { fontSize: 13, color: colors.text, lineHeight: 19 },

  actions: { width: '100%', marginTop: 20, gap: 10 },
  primaryBtn: { backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: 15, alignItems: 'center' },
  primaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  secondaryBtn: { paddingVertical: 12, alignItems: 'center' },
  secondaryBtnText: { color: colors.textMuted, fontSize: 14, fontWeight: '700' },
});
