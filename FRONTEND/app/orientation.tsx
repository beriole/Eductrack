import { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '@/src/lib/api';
import { colors, radius, spacing, shadow } from '@/src/theme';

interface Question {
  id_question: string;
  matiere_code: string;
  matiere_nom: string;
  enonce: string;
  type_question: string;
  options: Array<string | { texte?: string }>;
}

interface Resultat {
  orientation: {
    serie_recommandee: string;
    aptitudes_detectees: string[];
    metiers_recommandes: string[];
    filieres_superieures: string[];
    score_global_test: number;
  };
  serie_label: string;
  scores_par_matiere: Record<string, number>;
  classement: Array<{ serie: string; label: string; affinite: number }>;
  nb_questions: number;
}

const SERIE_COLORS: Record<string, string> = {
  C: '#6366F1', D: '#10B981', E: '#3B82F6', TI: '#0EA5E9',
  A1: '#F59E0B', A4: '#F97316', G: '#EC4899',
};

const optText = (o: string | { texte?: string }) => (typeof o === 'string' ? o : (o.texte ?? ''));

export default function OrientationScreen() {
  const router = useRouter();
  const [step, setStep] = useState<'intro' | 'quiz' | 'result'>('intro');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [loadingTest, setLoadingTest] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<Resultat | null>(null);

  const demarrer = async () => {
    setLoadingTest(true);
    try {
      const res = await api.get('/analytique/orientations/test/');
      setQuestions(res.data.questions ?? []);
      setIdx(0);
      setAnswers({});
      setStep('quiz');
    } catch (e: any) {
      const msg = e?.response?.data?.error ?? "Impossible de charger le test pour le moment.";
      Alert.alert('Indisponible', msg);
    } finally {
      setLoadingTest(false);
    }
  };

  const repondre = (q: Question, texte: string) => {
    setAnswers((prev) => ({ ...prev, [q.id_question]: texte }));
    if (idx < questions.length - 1) setTimeout(() => setIdx((i) => i + 1), 150);
  };

  const soumettre = async () => {
    setSubmitting(true);
    try {
      const reponses = Object.entries(answers).map(([id_question, contenu_reponse]) => ({ id_question, contenu_reponse }));
      const res = await api.post('/analytique/orientations/soumettre/', { reponses });
      setResult(res.data);
      setStep('result');
    } catch {
      Alert.alert('Erreur', "Impossible d'analyser ton test.");
    } finally {
      setSubmitting(false);
    }
  };

  // ── Intro ──────────────────────────────────────────────────────────────────
  if (step === 'intro') {
    return (
      <View style={styles.container}>
        <Header onBack={() => router.back()} title="Orientation" sub="Trouve ta voie avec un vrai test" />
        <ScrollView contentContainerStyle={styles.introContent}>
          <View style={styles.introIcon}><Ionicons name="compass" size={48} color={colors.primary} /></View>
          <Text style={styles.introTitle}>Test d'orientation intensif</Text>
          <Text style={styles.introText}>
            Réponds à une série de questions réparties sur toutes les matières.
            En fonction de tes résultats réels et de tes lacunes, on te recommande
            la série (C, D, E, TI, A, G…) la plus adaptée à ton profil.
          </Text>
          <View style={styles.tips}>
            <Tip icon="documents-outline" text="Questions sur plusieurs matières" />
            <Tip icon="analytics-outline" text="Score réel par matière" />
            <Tip icon="bulb-outline" text="Lacunes prises en compte" />
          </View>
          <TouchableOpacity style={styles.startBtn} onPress={demarrer} disabled={loadingTest} activeOpacity={0.85}>
            {loadingTest
              ? <ActivityIndicator color={colors.white} />
              : <><Text style={styles.startBtnText}>Commencer le test</Text><Ionicons name="arrow-forward" size={18} color={colors.white} /></>}
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }

  // ── Quiz ───────────────────────────────────────────────────────────────────
  if (step === 'quiz') {
    const q = questions[idx];
    const total = questions.length;
    const repondus = Object.keys(answers).length;
    const selected = answers[q.id_question];
    const dernier = idx === total - 1;

    return (
      <View style={styles.container}>
        <Header onBack={() => (idx > 0 ? setIdx(idx - 1) : setStep('intro'))}
                title={`Question ${idx + 1}/${total}`} sub={`${repondus} répondue(s)`} />
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${((idx + 1) / total) * 100}%` }]} />
        </View>

        <ScrollView contentContainerStyle={styles.quizContent}>
          <View style={styles.matiereTag}>
            <Text style={styles.matiereTagText}>{q.matiere_nom}</Text>
          </View>
          <Text style={styles.enonce}>{q.enonce}</Text>

          {q.options.map((o, i) => {
            const texte = optText(o);
            const active = selected === texte;
            return (
              <TouchableOpacity
                key={i}
                style={[styles.option, active && styles.optionActive]}
                onPress={() => repondre(q, texte)}
                activeOpacity={0.85}
              >
                <View style={[styles.optionLetter, active && styles.optionLetterActive]}>
                  <Text style={[styles.optionLetterText, active && { color: colors.white }]}>
                    {String.fromCharCode(65 + i)}
                  </Text>
                </View>
                <Text style={[styles.optionText, active && { color: colors.primary, fontWeight: '700' }]}>{texte}</Text>
              </TouchableOpacity>
            );
          })}

          <View style={styles.navRow}>
            {idx > 0 && (
              <TouchableOpacity style={styles.navBtn} onPress={() => setIdx(idx - 1)}>
                <Ionicons name="chevron-back" size={18} color={colors.textMuted} />
                <Text style={styles.navText}>Précédent</Text>
              </TouchableOpacity>
            )}
            <View style={{ flex: 1 }} />
            {!dernier ? (
              <TouchableOpacity style={styles.navBtn} onPress={() => setIdx(idx + 1)}>
                <Text style={styles.navText}>Passer</Text>
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[styles.finishBtn, repondus === 0 && { opacity: 0.5 }]}
                onPress={soumettre}
                disabled={submitting || repondus === 0}
              >
                {submitting
                  ? <ActivityIndicator color={colors.white} size="small" />
                  : <><Ionicons name="sparkles" size={16} color={colors.white} /><Text style={styles.finishText}>Voir mon orientation</Text></>}
              </TouchableOpacity>
            )}
          </View>
        </ScrollView>
      </View>
    );
  }

  // ── Résultat ───────────────────────────────────────────────────────────────
  const o = result!.orientation;
  const color = SERIE_COLORS[o.serie_recommandee] ?? colors.primary;
  const scores = Object.entries(result!.scores_par_matiere).sort((a, b) => b[1] - a[1]);

  return (
    <View style={styles.container}>
      <Header onBack={() => setStep('intro')} title="Ton orientation" sub={`${result!.nb_questions} questions analysées`} backIcon="refresh" />
      <ScrollView contentContainerStyle={styles.resultContent}>
        <View style={[styles.serieCard, { borderColor: color }]}>
          <View style={[styles.serieBadge, { backgroundColor: `${color}18` }]}>
            <Text style={[styles.serieCode, { color }]}>Série {o.serie_recommandee}</Text>
          </View>
          <Text style={styles.serieLabel}>{result!.serie_label}</Text>
          <Text style={[styles.scoreGlobal, { color }]}>Score global : {o.score_global_test}/100</Text>
        </View>

        <Section title="Tes résultats par matière" icon="bar-chart" color={color}>
          {scores.map(([code, val]) => (
            <View key={code} style={styles.scoreRow}>
              <Text style={styles.scoreCode}>{code}</Text>
              <View style={styles.scoreTrack}>
                <View style={[styles.scoreFill, { width: `${val}%`, backgroundColor: val >= 50 ? colors.success : colors.danger }]} />
              </View>
              <Text style={styles.scoreVal}>{Math.round(val)}%</Text>
            </View>
          ))}
        </Section>

        <Section title="Classement des séries" icon="podium" color={color}>
          {result!.classement.slice(0, 4).map((c, i) => (
            <View key={c.serie} style={styles.rankRow}>
              <Text style={[styles.rankNum, i === 0 && { color }]}>{i + 1}</Text>
              <Text style={[styles.rankLabel, i === 0 && { fontWeight: '800', color }]} numberOfLines={1}>{c.label}</Text>
              <Text style={styles.rankScore}>{Math.round(c.affinite)}</Text>
            </View>
          ))}
        </Section>

        <Section title="Aptitudes détectées" icon="bulb" color={color}>
          {o.aptitudes_detectees.map((a, i) => <Text key={i} style={styles.li}>• {a}</Text>)}
        </Section>
        <Section title="Métiers recommandés" icon="briefcase" color={color}>
          {o.metiers_recommandes.map((m, i) => <Text key={i} style={styles.li}>• {m}</Text>)}
        </Section>
        <Section title="Filières supérieures" icon="school" color={color}>
          {o.filieres_superieures.map((f, i) => <Text key={i} style={styles.li}>• {f}</Text>)}
        </Section>

        <TouchableOpacity style={[styles.cta, { backgroundColor: color }]} onPress={() => router.push('/planning')}>
          <Ionicons name="calendar" size={18} color={colors.white} />
          <Text style={styles.ctaText}>Créer mon planning de révisions</Text>
        </TouchableOpacity>
        <View style={{ height: 28 }} />
      </ScrollView>
    </View>
  );
}

function Header({ onBack, title, sub, backIcon = 'arrow-back' }: { onBack: () => void; title: string; sub: string; backIcon?: keyof typeof Ionicons.glyphMap }) {
  return (
    <View style={styles.header}>
      <TouchableOpacity onPress={onBack} style={styles.backRow}>
        <Ionicons name={backIcon} size={20} color={colors.text} />
      </TouchableOpacity>
      <View style={{ flex: 1 }}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{sub}</Text>
      </View>
    </View>
  );
}

function Tip({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  return (
    <View style={styles.tip}>
      <Ionicons name={icon} size={18} color={colors.primary} />
      <Text style={styles.tipText}>{text}</Text>
    </View>
  );
}

function Section({ title, icon, color, children }: { title: string; icon: keyof typeof Ionicons.glyphMap; color: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <Ionicons name={icon} size={16} color={color} />
        <Text style={[styles.sectionTitle, { color }]}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: spacing.md, paddingTop: 56, paddingBottom: 12 },
  backRow: { width: 38, height: 38, borderRadius: 12, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', ...shadow.sm },
  title: { fontSize: 21, fontWeight: '800', color: colors.text, letterSpacing: -0.4 },
  subtitle: { fontSize: 13, color: colors.textMuted, marginTop: 1 },

  introContent: { padding: spacing.lg, alignItems: 'center' },
  introIcon: { width: 92, height: 92, borderRadius: 30, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center', marginTop: 8, marginBottom: 18 },
  introTitle: { fontSize: 20, fontWeight: '800', color: colors.text, textAlign: 'center' },
  introText: { fontSize: 14, color: colors.textMuted, textAlign: 'center', lineHeight: 21, marginTop: 10, marginBottom: 22 },
  tips: { alignSelf: 'stretch', gap: 10, marginBottom: 28 },
  tip: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.surface, borderRadius: radius.md, padding: 14, ...shadow.sm },
  tipText: { fontSize: 13.5, color: colors.text, fontWeight: '600' },
  startBtn: { alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: 16, ...shadow.lg },
  startBtnText: { color: colors.white, fontWeight: '800', fontSize: 16 },

  progressTrack: { height: 5, backgroundColor: colors.border, marginHorizontal: spacing.md, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: colors.primary, borderRadius: 3 },
  quizContent: { padding: spacing.md },
  matiereTag: { alignSelf: 'flex-start', backgroundColor: colors.primaryLight, borderRadius: radius.full, paddingHorizontal: 12, paddingVertical: 5, marginBottom: 14 },
  matiereTagText: { fontSize: 12, fontWeight: '800', color: colors.primary },
  enonce: { fontSize: 17, fontWeight: '700', color: colors.text, lineHeight: 24, marginBottom: 18 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface, borderRadius: radius.md, padding: 14, marginBottom: 10, borderWidth: 1.5, borderColor: colors.border },
  optionActive: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  optionLetter: { width: 30, height: 30, borderRadius: 9, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  optionLetterActive: { backgroundColor: colors.primary },
  optionLetterText: { fontSize: 14, fontWeight: '800', color: colors.textMuted },
  optionText: { flex: 1, fontSize: 14.5, color: colors.text },
  navRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  navBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 10, paddingHorizontal: 6 },
  navText: { fontSize: 14, fontWeight: '700', color: colors.textMuted },
  finishBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: 12, paddingHorizontal: 18, ...shadow.md },
  finishText: { color: colors.white, fontWeight: '800', fontSize: 14 },

  resultContent: { padding: spacing.md },
  serieCard: { alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.xl, padding: 24, borderWidth: 2, marginBottom: 14, ...shadow.md },
  serieBadge: { paddingHorizontal: 18, paddingVertical: 8, borderRadius: radius.full, marginBottom: 10 },
  serieCode: { fontSize: 26, fontWeight: '900' },
  serieLabel: { fontSize: 14, color: colors.textMuted, textAlign: 'center', marginBottom: 6 },
  scoreGlobal: { fontSize: 14, fontWeight: '800' },
  section: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, marginBottom: 12, ...shadow.sm },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
  sectionTitle: { fontSize: 14.5, fontWeight: '800' },
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  scoreCode: { width: 52, fontSize: 12.5, fontWeight: '800', color: colors.textMuted },
  scoreTrack: { flex: 1, height: 8, backgroundColor: colors.border, borderRadius: 4, overflow: 'hidden' },
  scoreFill: { height: '100%', borderRadius: 4 },
  scoreVal: { width: 40, fontSize: 12.5, fontWeight: '800', color: colors.text, textAlign: 'right' },
  rankRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  rankNum: { width: 22, fontSize: 14, fontWeight: '800', color: colors.textLight, textAlign: 'center' },
  rankLabel: { flex: 1, fontSize: 13, color: colors.text },
  rankScore: { fontSize: 13, fontWeight: '800', color: colors.textMuted },
  li: { fontSize: 14, color: colors.text, paddingVertical: 4, lineHeight: 21 },
  cta: { flexDirection: 'row', gap: 8, borderRadius: radius.md, paddingVertical: 16, alignItems: 'center', justifyContent: 'center', marginTop: 4, ...shadow.md },
  ctaText: { color: colors.white, fontWeight: '800', fontSize: 15 },
});
