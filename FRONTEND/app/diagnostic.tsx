import { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '@/src/lib/api';
import { colors, radius } from '@/src/theme';

type IoniconName = keyof typeof Ionicons.glyphMap;

// Questions de diagnostic par matière (évaluation de niveau)
const QUESTIONS_DIAGNOSTIC = [
  {
    matiere: 'Mathématiques', code: 'MATH',
    questions: [
      {
        id: 'math_1', enonce: 'Résoudre : 2x + 5 = 13',
        options: ['x = 3', 'x = 4', 'x = 9', 'x = 6'],
        reponse: 'x = 4', difficulte: 'facile',
      },
      {
        id: 'math_2', enonce: 'Quelle est la dérivée de f(x) = x³ − 2x ?',
        options: ['3x² − 2', '3x² + 2', 'x² − 2', '3x²'],
        reponse: '3x² − 2', difficulte: 'moyen',
      },
      {
        id: 'math_3', enonce: 'Dans un triangle rectangle, si les côtés sont 3 et 4, quelle est l\'hypoténuse ?',
        options: ['5', '6', '7', '4.5'],
        reponse: '5', difficulte: 'facile',
      },
    ],
  },
  {
    matiere: 'Physique-Chimie', code: 'PHY',
    questions: [
      {
        id: 'phy_1', enonce: 'Quelle est l\'unité du courant électrique ?',
        options: ['Volt', 'Ampère', 'Watt', 'Ohm'],
        reponse: 'Ampère', difficulte: 'facile',
      },
      {
        id: 'phy_2', enonce: 'La formule chimique de l\'eau est :',
        options: ['H₂O', 'CO₂', 'NaCl', 'O₂'],
        reponse: 'H₂O', difficulte: 'facile',
      },
      {
        id: 'phy_3', enonce: 'Selon la loi d\'Ohm, U = ?',
        options: ['R/I', 'R × I', 'I/R', 'R + I'],
        reponse: 'R × I', difficulte: 'moyen',
      },
    ],
  },
  {
    matiere: 'SVT', code: 'SVT',
    questions: [
      {
        id: 'svt_1', enonce: 'Quel organite est le "centre énergétique" de la cellule ?',
        options: ['Noyau', 'Mitochondrie', 'Ribosome', 'Vacuole'],
        reponse: 'Mitochondrie', difficulte: 'moyen',
      },
      {
        id: 'svt_2', enonce: 'La photosynthèse se produit dans :',
        options: ['Mitochondries', 'Chloroplastes', 'Noyau', 'Membrane'],
        reponse: 'Chloroplastes', difficulte: 'facile',
      },
    ],
  },
  {
    matiere: 'Français', code: 'FRAN',
    questions: [
      {
        id: 'fr_1', enonce: 'Quel est le sujet dans : "Les élèves travaillent dur." ?',
        options: ['travaillent', 'dur', 'Les élèves', 'élèves'],
        reponse: 'Les élèves', difficulte: 'facile',
      },
      {
        id: 'fr_2', enonce: 'Quel temps utilise-t-on pour exprimer une action passée et achevée ?',
        options: ['Imparfait', 'Passé composé', 'Présent', 'Futur simple'],
        reponse: 'Passé composé', difficulte: 'facile',
      },
    ],
  },
];

type DiagStep = 'intro' | 'quiz' | 'result';

interface Reponses {
  [id: string]: string;
}

interface Score {
  matiere: string;
  code: string;
  bonnes: number;
  total: number;
  taux: number;
}

export default function DiagnosticScreen() {
  const router = useRouter();
  const [step, setStep] = useState<DiagStep>('intro');
  const [matiereIndex, setMatiereIndex] = useState(0);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [reponses, setReponses] = useState<Reponses>({});
  const [submitting, setSubmitting] = useState(false);
  const [scores, setScores] = useState<Score[]>([]);

  const matiereActuelle = QUESTIONS_DIAGNOSTIC[matiereIndex];
  const questionActuelle = matiereActuelle?.questions[questionIndex];
  const totalQuestions = QUESTIONS_DIAGNOSTIC.reduce((s, m) => s + m.questions.length, 0);
  const questionGlobale = QUESTIONS_DIAGNOSTIC.slice(0, matiereIndex).reduce((s, m) => s + m.questions.length, 0) + questionIndex + 1;

  const handleAnswer = (opt: string) => {
    setReponses((prev) => ({ ...prev, [questionActuelle.id]: opt }));
  };

  const handleNext = () => {
    const nextQ = questionIndex + 1;
    if (nextQ < matiereActuelle.questions.length) {
      setQuestionIndex(nextQ);
    } else {
      const nextM = matiereIndex + 1;
      if (nextM < QUESTIONS_DIAGNOSTIC.length) {
        setMatiereIndex(nextM);
        setQuestionIndex(0);
      } else {
        calculerEtSoumettre();
      }
    }
  };

  const calculerEtSoumettre = async () => {
    const scoresCalc: Score[] = QUESTIONS_DIAGNOSTIC.map((m) => {
      const bonnes = m.questions.filter((q) => reponses[q.id] === q.reponse).length;
      return {
        matiere: m.matiere,
        code: m.code,
        bonnes,
        total: m.questions.length,
        taux: Math.round((bonnes / m.questions.length) * 100),
      };
    });
    setScores(scoresCalc);

    const scoresParMatiere: Record<string, number> = {};
    scoresCalc.forEach((s) => { scoresParMatiere[s.code] = s.taux; });

    const scoreGlobal = Math.round(scoresCalc.reduce((sum, s) => sum + s.taux, 0) / scoresCalc.length);

    const lacunesData = scoresCalc
      .filter((s) => s.taux < 60)
      .map((s) => ({
        matiere_code: s.code,
        chapitre: 'Général',
        notion: `Notions de base — ${s.matiere}`,
        taux_maitrise: s.taux,
      }));

    setSubmitting(true);
    try {
      await api.post('/analytique/diagnostics/', {
        score_global: scoreGlobal,
        scores_par_matiere: scoresParMatiere,
        matieres_testees: QUESTIONS_DIAGNOSTIC.map((m) => m.code),
        nb_lacunes_detectees: lacunesData.length,
        lacunes_data: lacunesData,
      });
    } catch {}
    setSubmitting(false);
    setStep('result');
  };

  if (step === 'intro') {
    return (
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backRow}>
            <Ionicons name="arrow-back" size={18} color="#C7D2FE" />
            <Text style={styles.backText}>Retour</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Test de diagnostic</Text>
          <Text style={styles.subtitle}>Évalue ton niveau actuel</Text>
        </View>
        <View style={styles.introContent}>
          <Ionicons name="locate" size={48} color={ACCENT} style={{ marginBottom: 8 }} />
          <Text style={styles.introTitle}>Comment ça marche ?</Text>
          <View style={styles.introSteps}>
            {([
              ['create-outline', `${totalQuestions} questions en ${QUESTIONS_DIAGNOSTIC.length} matières`],
              ['time-outline', 'Environ 10 minutes pour tout compléter'],
              ['search', 'Tes lacunes sont détectées automatiquement'],
              ['stats-chart', 'Un plan de révision personnalisé est généré'],
            ] as [IoniconName, string][]).map(([icon, text], i) => (
              <View key={i} style={styles.introStep}>
                <Ionicons name={icon} size={20} color={ACCENT} style={styles.introStepIcon} />
                <Text style={styles.introStepText}>{text}</Text>
              </View>
            ))}
          </View>
          <View style={styles.matieresList}>
            <Text style={styles.matieresLabel}>Matières évaluées</Text>
            <View style={styles.matieresRow}>
              {QUESTIONS_DIAGNOSTIC.map((m) => (
                <View key={m.code} style={styles.matiereBadge}>
                  <Text style={styles.matiereBadgeText}>{m.matiere}</Text>
                </View>
              ))}
            </View>
          </View>
          <TouchableOpacity style={styles.startBtn} onPress={() => setStep('quiz')}>
            <Text style={styles.startBtnText}>Commencer le diagnostic →</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  }

  if (step === 'result') {
    const scoreGlobal = Math.round(scores.reduce((s, sc) => s + sc.taux, 0) / scores.length);
    const lacunes = scores.filter((s) => s.taux < 60);
    return (
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Résultats</Text>
          <Text style={styles.subtitle}>Analyse de ton niveau</Text>
        </View>
        <View style={styles.resultContent}>
          <View style={[styles.scoreCircle, { borderColor: scoreGlobal >= 60 ? '#10B981' : '#F59E0B' }]}>
            <Text style={[styles.scoreVal, { color: scoreGlobal >= 60 ? '#10B981' : '#F59E0B' }]}>{scoreGlobal}%</Text>
            <Text style={styles.scoreLabel}>Score global</Text>
          </View>
          <Text style={styles.sectionTitle}>Détail par matière</Text>
          {scores.map((s) => (
            <View key={s.code} style={styles.scoreRow}>
              <Text style={styles.scoreMatiere}>{s.matiere}</Text>
              <View style={styles.scoreBarWrap}>
                <View style={[styles.scoreBarFill, {
                  width: `${s.taux}%`,
                  backgroundColor: s.taux >= 70 ? '#10B981' : s.taux >= 40 ? '#F59E0B' : '#EF4444',
                }]} />
              </View>
              <Text style={styles.scorePct}>{s.taux}%</Text>
            </View>
          ))}
          {lacunes.length > 0 && (
            <>
              <View style={styles.lacuneTitleRow}>
                <Ionicons name="warning" size={16} color="#EF4444" />
                <Text style={[styles.sectionTitle, { color: '#EF4444', marginBottom: 0 }]}>Lacunes détectées</Text>
              </View>
              {lacunes.map((s) => (
                <View key={s.code} style={styles.lacuneCard}>
                  <Text style={styles.lacuneTitre}>{s.matiere}</Text>
                  <Text style={styles.lacuneSub}>Score : {s.taux}% — Des révisions sont nécessaires</Text>
                </View>
              ))}
            </>
          )}
          <TouchableOpacity style={styles.planningBtn} onPress={() => router.replace('/planning')}>
            <Ionicons name="calendar" size={18} color="#fff" />
            <Text style={styles.planningBtnText}>Créer mon planning de révision</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.dashboardBtn} onPress={() => router.replace('/(tabs)/dashboard')}>
            <Text style={styles.dashboardBtnText}>Retour au tableau de bord</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  }

  // Quiz
  const progress = (questionGlobale - 1) / totalQuestions;
  const answered = !!reponses[questionActuelle?.id];

  return (
    <View style={styles.quizContainer}>
      {/* Top bar */}
      <View style={styles.quizHeader}>
        <Text style={styles.quizMatiere}>{matiereActuelle.matiere}</Text>
        <Text style={styles.quizProgress}>{questionGlobale}/{totalQuestions}</Text>
      </View>
      <View style={styles.progressBar}>
        <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
      </View>
      <ScrollView contentContainerStyle={styles.quizBody}>
        <Text style={styles.questionText}>{questionActuelle?.enonce}</Text>
        <View style={styles.optionsContainer}>
          {questionActuelle?.options.map((opt) => {
            const sel = reponses[questionActuelle.id] === opt;
            return (
              <TouchableOpacity
                key={opt}
                style={[styles.option, sel && styles.optionSelected]}
                onPress={() => handleAnswer(opt)}
              >
                <Text style={[styles.optionText, sel && styles.optionTextSelected]}>{opt}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>
      <View style={styles.quizFooter}>
        <TouchableOpacity
          style={[styles.nextBtn, !answered && styles.nextBtnDisabled]}
          onPress={handleNext}
          disabled={!answered || submitting}
        >
          {submitting
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.nextBtnText}>
                {questionGlobale === totalQuestions ? 'Terminer ✓' : 'Suivant →'}
              </Text>
          }
        </TouchableOpacity>
        {!answered && (
          <TouchableOpacity onPress={handleNext} style={styles.skipBtn}>
            <Text style={styles.skipText}>Passer</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const PRIMARY = colors.primary;
const ACCENT = colors.primary;

const styles = StyleSheet.create({
  container: { flexGrow: 1, backgroundColor: colors.bg },
  header: { backgroundColor: PRIMARY, paddingTop: 56, paddingBottom: 24, paddingHorizontal: 20, borderBottomLeftRadius: radius.xl, borderBottomRightRadius: radius.xl },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 12 },
  backText: { color: '#C7D2FE', fontWeight: '600', fontSize: 14 },
  title: { fontSize: 24, fontWeight: '800', color: '#fff' },
  subtitle: { fontSize: 13, color: '#C7D2FE', marginTop: 4 },
  introContent: { padding: 24, alignItems: 'center' },
  introIcon: { fontSize: 72, marginBottom: 16, marginTop: 8 },
  introTitle: { fontSize: 20, fontWeight: '800', color: PRIMARY, marginBottom: 20 },
  introSteps: { width: '100%', gap: 14, marginBottom: 24 },
  introStep: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 12, padding: 14, elevation: 1 },
  introStepIcon: { fontSize: 24, marginRight: 12 },
  introStepText: { fontSize: 14, color: '#374151', flex: 1 },
  matieresList: { width: '100%', marginBottom: 28 },
  matieresLabel: { fontSize: 13, fontWeight: '700', color: '#6B7280', marginBottom: 10 },
  matieresRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  matiereBadge: { backgroundColor: `${ACCENT}20`, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  matiereBadgeText: { fontSize: 13, fontWeight: '600', color: ACCENT },
  startBtn: { backgroundColor: PRIMARY, borderRadius: 16, paddingVertical: 18, width: '100%', alignItems: 'center' },
  startBtnText: { color: '#fff', fontSize: 17, fontWeight: '800' },
  quizContainer: { flex: 1, backgroundColor: colors.bg },
  quizHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 56, paddingBottom: 12, backgroundColor: '#fff' },
  quizMatiere: { fontSize: 15, fontWeight: '700', color: PRIMARY },
  quizProgress: { fontSize: 14, fontWeight: '700', color: '#9CA3AF' },
  progressBar: { height: 4, backgroundColor: '#E5E7EB' },
  progressFill: { height: '100%', backgroundColor: ACCENT },
  quizBody: { padding: 24, paddingBottom: 120 },
  questionText: { fontSize: 19, fontWeight: '700', color: PRIMARY, lineHeight: 28, marginBottom: 24 },
  optionsContainer: { gap: 12 },
  option: { backgroundColor: '#fff', borderRadius: 14, padding: 16, borderWidth: 1.5, borderColor: '#E5E7EB' },
  optionSelected: { borderColor: ACCENT, backgroundColor: `${ACCENT}08` },
  optionText: { fontSize: 15, color: '#374151', fontWeight: '500' },
  optionTextSelected: { color: PRIMARY, fontWeight: '700' },
  quizFooter: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: '#fff', padding: 20, borderTopWidth: 1, borderTopColor: '#F3F4F6' },
  nextBtn: { backgroundColor: PRIMARY, borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  nextBtnDisabled: { backgroundColor: '#D1D5DB' },
  nextBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  skipBtn: { marginTop: 10, alignItems: 'center' },
  skipText: { color: '#9CA3AF', fontSize: 13 },
  resultContent: { padding: 20 },
  scoreCircle: { width: 140, height: 140, borderRadius: 70, borderWidth: 6, justifyContent: 'center', alignItems: 'center', alignSelf: 'center', marginVertical: 24, backgroundColor: '#fff', elevation: 3 },
  scoreVal: { fontSize: 44, fontWeight: '900' },
  scoreLabel: { fontSize: 13, color: '#9CA3AF' },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: PRIMARY, marginTop: 8, marginBottom: 12 },
  lacuneTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, marginBottom: 12 },
  scoreRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  scoreMatiere: { width: 100, fontSize: 13, fontWeight: '600', color: '#374151' },
  scoreBarWrap: { flex: 1, height: 8, backgroundColor: '#E5E7EB', borderRadius: 4, marginHorizontal: 10, overflow: 'hidden' },
  scoreBarFill: { height: '100%', borderRadius: 4 },
  scorePct: { width: 40, fontSize: 13, fontWeight: '700', color: PRIMARY, textAlign: 'right' },
  lacuneCard: { backgroundColor: '#FEF2F2', borderRadius: 10, padding: 12, marginBottom: 8, borderLeftWidth: 3, borderLeftColor: '#EF4444' },
  lacuneTitre: { fontSize: 14, fontWeight: '700', color: '#991B1B' },
  lacuneSub: { fontSize: 12, color: '#EF4444', marginTop: 2 },
  planningBtn: { flexDirection: 'row', gap: 8, backgroundColor: PRIMARY, borderRadius: 14, paddingVertical: 16, alignItems: 'center', justifyContent: 'center', marginTop: 24, marginBottom: 10 },
  planningBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  dashboardBtn: { paddingVertical: 12, alignItems: 'center' },
  dashboardBtnText: { color: '#6B7280', fontSize: 14, fontWeight: '600' },
});
