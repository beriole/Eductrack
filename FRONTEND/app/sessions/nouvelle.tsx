import { useEffect, useState, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert,
  ScrollView, TextInput, Modal, Pressable, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '@/src/lib/api';
import { colors, radius, spacing, shadow } from '@/src/theme';

interface Question {
  id_question: string;
  enonce: string;
  type_question: string;
  options: Array<{ key: string; texte: string }> | string[];
  points: number;
  numero_ordre: number;
}

interface Session {
  id_session: string;
  nb_questions: number;
  epreuve_titre: string;
}

const VF_OPTIONS = [
  { key: 'vrai', texte: 'Vrai' },
  { key: 'faux', texte: 'Faux' },
];

// Temps accordé par question (secondes), selon le type. Passé ce délai, la
// question se verrouille et ses points sont perdus.
const TEMPS_PAR_TYPE: Record<string, number> = {
  qcm: 30, vrai_faux: 30, reponse_courte: 90, redaction: 180,
};
const budgetQuestion = (q: Question) => {
  // QCM et Vrai/Faux : 30 s max, sans dépendre du barème.
  if (q.type_question === 'qcm' || q.type_question === 'vrai_faux') return 30;
  return (TEMPS_PAR_TYPE[q.type_question] ?? 45) * Math.max(1, q.points || 1);
};

export default function NouvelleSessionScreen() {
  const { epreuveId, mode = 'exercice', duree, revision } = useLocalSearchParams<{ epreuveId: string; mode?: string; duree?: string; revision?: string }>();
  const router = useRouter();
  const isExamen = mode === 'examen_blanc';

  const [session, setSession] = useState<Session | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showGrid, setShowGrid] = useState(false);
  const [showSubmit, setShowSubmit] = useState(false);

  // Assistant IA pédagogique
  const [assistOpen, setAssistOpen] = useState(false);
  const [assistLoading, setAssistLoading] = useState(false);
  const [assistText, setAssistText] = useState('');
  const [assistAction, setAssistAction] = useState<string | null>(null);

  const dureeSec = duree ? parseInt(duree) * 60 : 0;
  const [remaining, setRemaining] = useState(dureeSec); // décompte si examen chronométré
  const [elapsed, setElapsed] = useState(0);
  const startTimeRef = useRef<number>(Date.now());

  // Refs pour que le timer (auto-soumission) lise toujours les valeurs fraîches.
  const sessionRef = useRef<Session | null>(null);
  const answersRef = useRef<Record<string, string>>({});
  const submittedRef = useRef(false);
  answersRef.current = answers;

  // Minuterie par question : temps restant par question + verrouillage à 0.
  const timeLeftRef = useRef<Record<string, number>>({});
  const expiredRef = useRef<Record<string, boolean>>({});
  const [expired, setExpired] = useState<Record<string, boolean>>({});
  const [qLeft, setQLeft] = useState(0);

  useEffect(() => {
    const init = async () => {
      try {
        const sessionRes = await api.post(`/epreuves/${epreuveId}/demarrer/`, { mode });
        // Le back renvoie soit l'objet session directement (création), soit
        // { message, session } si une session est déjà en cours.
        const sess = sessionRes.data?.session ?? sessionRes.data;
        setSession(sess);
        sessionRef.current = sess;
        const questionsRes = await api.get(`/epreuves/${epreuveId}/questions/`);
        const qs = questionsRes.data.results ?? questionsRes.data;
        const sorted: Question[] = qs.sort((a: Question, b: Question) => a.numero_ordre - b.numero_ordre);
        setQuestions(sorted);
        const tl: Record<string, number> = {};
        sorted.forEach((qq) => { tl[qq.id_question] = budgetQuestion(qq); });
        timeLeftRef.current = tl;
        setQLeft(sorted.length ? tl[sorted[0].id_question] : 0);
        startTimeRef.current = Date.now();
      } catch {
        Alert.alert('Erreur', 'Impossible de démarrer la session.', [{ text: 'Retour', onPress: () => router.back() }]);
      } finally {
        setLoading(false);
      }
    };
    init();
  }, [epreuveId]);

  // Chronomètre (1 tick/s) : décompte en mode examen, comptage simple sinon.
  useEffect(() => {
    if (loading || !questions.length) return;
    const t = setInterval(() => {
      setElapsed(Math.round((Date.now() - startTimeRef.current) / 1000));
      if (dureeSec > 0) {
        setRemaining((prev) => {
          if (prev <= 1) {
            clearInterval(t);
            handleSubmit(true); // temps écoulé → soumission automatique
            return 0;
          }
          return prev - 1;
        });
      }
    }, 1000);
    return () => clearInterval(t);
  }, [loading, questions.length]);

  // Réinitialise l'affichage du temps restant à chaque changement de question.
  useEffect(() => {
    if (!questions.length) return;
    const id = questions[currentIndex].id_question;
    setQLeft(timeLeftRef.current[id] ?? budgetQuestion(questions[currentIndex]));
  }, [currentIndex, questions.length]);

  // Décompte de la question courante : gelé si déjà répondue ou expirée.
  // À 0 → verrouillage (points perdus) puis passage automatique à la suivante.
  useEffect(() => {
    if (loading || !questions.length) return;
    const id = questions[currentIndex].id_question;
    const tick = setInterval(() => {
      const answered = answersRef.current[id] != null && answersRef.current[id] !== '';
      if (answered || expiredRef.current[id]) return;
      const next = Math.max(0, (timeLeftRef.current[id] ?? 0) - 1);
      timeLeftRef.current[id] = next;
      setQLeft(next);
      if (next === 0) {
        expiredRef.current[id] = true;
        setExpired((e) => ({ ...e, [id]: true }));
        clearInterval(tick);
        setTimeout(() => {
          setCurrentIndex((ci) => (ci < questions.length - 1 ? ci + 1 : ci));
        }, 1200);
      }
    }, 1000);
    return () => clearInterval(tick);
  }, [currentIndex, loading, questions.length]);

  const handleAnswer = (key: string) => {
    const q = questions[currentIndex];
    if (expiredRef.current[q.id_question]) return; // temps écoulé → verrouillé
    setAnswers((prev) => ({ ...prev, [q.id_question]: key }));
  };

  const goTo = (i: number) => {
    setCurrentIndex(Math.max(0, Math.min(questions.length - 1, i)));
    setShowGrid(false);
  };

  const handleSubmit = useCallback(async (auto = false) => {
    const s = sessionRef.current;
    if (!s || submittedRef.current) return;
    submittedRef.current = true;
    setShowSubmit(false);
    setSubmitting(true);
    try {
      const duree_reelle = Math.round((Date.now() - startTimeRef.current) / 1000);
      const reponses = Object.entries(answersRef.current).map(([id_question, contenu_reponse]) => ({ id_question, contenu_reponse }));
      if (reponses.length) {
        await api.post(`/sessions/${s.id_session}/reponses/`, { reponses });
      }
      const fin = await api.post(`/sessions/${s.id_session}/terminer/`, { duree_reelle_sec: duree_reelle });
      // Si cette session est la révision du jour, on la marque complétée (entretient la série).
      if (revision === '1') {
        try { await api.post('/revisions/du-jour/completer/', { note: fin.data?.note }); } catch {}
      }
      router.replace(`/sessions/resultat?sessionId=${s.id_session}&mode=${mode}${auto ? '&timeout=1' : ''}`);
    } catch {
      submittedRef.current = false;
      Alert.alert('Erreur', 'Impossible de soumettre les réponses.');
      setSubmitting(false);
    }
  }, [mode, router]);

  const openAssistant = () => {
    setAssistText('');
    setAssistAction(null);
    setAssistOpen(true);
  };

  const askAssistant = async (action: 'expliquer' | 'reformuler' | 'indice') => {
    const q = questions[currentIndex];
    setAssistAction(action);
    setAssistLoading(true);
    setAssistText('');
    try {
      const res = await api.post(`/questions/${q.id_question}/assistant/`, {
        action,
        id_session: sessionRef.current?.id_session,
      });
      setAssistText(res.data.reponse);
    } catch {
      setAssistText("L'assistant est momentanément indisponible. Relis l'énoncé et repère les mots-clés.");
    } finally {
      setAssistLoading(false);
    }
  };

  const handleQuit = () => {
    Alert.alert('Quitter l\'examen', 'Abandonner cette session ? Tes réponses seront perdues.', [
      { text: 'Continuer', style: 'cancel' },
      { text: 'Quitter', style: 'destructive', onPress: () => router.back() },
    ]);
  };

  if (loading) {
    return <View style={styles.centered}><ActivityIndicator size="large" color={colors.primary} /></View>;
  }
  if (!questions.length) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyText}>Aucune question disponible pour cette épreuve.</Text>
        <TouchableOpacity onPress={() => router.back()} style={styles.backLinkRow}>
          <Ionicons name="arrow-back" size={16} color={colors.primary} />
          <Text style={styles.backLink}>Retour</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const q = questions[currentIndex];
  const nbAnswered = Object.values(answers).filter((v) => v !== '' && v != null).length;
  const progress = (currentIndex + 1) / questions.length;
  const isLast = currentIndex === questions.length - 1;
  const isFirst = currentIndex === 0;
  const currentAnswer = answers[q.id_question];

  // Verrouillage de la question (temps écoulé) + urgence d'affichage.
  const locked = !!expired[q.id_question];
  const qAnswered = currentAnswer != null && currentAnswer !== '';
  const qUrgent = qLeft <= 10 && !locked && !qAnswered;

  // Normaliser les options selon le type de question.
  // On déduplique : l'IA génère parfois des options identiques, ce qui casse
  // la sélection (clé dupliquée) et l'affichage.
  let options: Array<{ key: string; texte: string }> = [];
  if (q.type_question === 'qcm' && Array.isArray(q.options)) {
    const seen = new Set<string>();
    options = q.options
      .map((o) => (typeof o === 'string' ? { key: o, texte: o } : o))
      .filter((o) => {
        if (!o?.key || seen.has(o.key)) return false;
        seen.add(o.key);
        return true;
      });
  } else if (q.type_question === 'vrai_faux') {
    options = VF_OPTIONS;
  }
  const isOpen = q.type_question === 'reponse_courte' || q.type_question === 'redaction';

  // Chrono : valeur affichée + état d'urgence.
  const timerSec = dureeSec > 0 ? remaining : elapsed;
  const mm = String(Math.floor(timerSec / 60)).padStart(2, '0');
  const ss = String(timerSec % 60).padStart(2, '0');
  const urgent = dureeSec > 0 && remaining <= 60;

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {/* Barre supérieure : quitter · chrono · grille */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={handleQuit} style={styles.topBtn} hitSlop={8}>
          <Ionicons name="close" size={22} color={colors.textMuted} />
        </TouchableOpacity>

        <View style={[styles.timer, urgent && styles.timerUrgent]}>
          <Ionicons name={dureeSec > 0 ? 'timer-outline' : 'time-outline'} size={15} color={urgent ? colors.danger : colors.text} />
          <Text style={[styles.timerText, urgent && { color: colors.danger }]}>{mm}:{ss}</Text>
        </View>

        <TouchableOpacity onPress={() => setShowGrid(true)} style={styles.topBtn} hitSlop={8}>
          <Ionicons name="grid-outline" size={20} color={colors.textMuted} />
          <View style={styles.answeredBadge}><Text style={styles.answeredBadgeText}>{nbAnswered}/{questions.length}</Text></View>
        </TouchableOpacity>
      </View>

      {/* Progression */}
      <View style={styles.progressBar}><View style={[styles.progressFill, { width: `${progress * 100}%` }]} /></View>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <View style={styles.qHeaderRow}>
          <Text style={styles.qNumber}>Question {currentIndex + 1}<Text style={styles.qTotal}> / {questions.length}</Text></Text>
          <View style={styles.qHeaderRight}>
            <View style={[styles.qTimer, qUrgent && styles.qTimerUrgent, locked && styles.qTimerExpired, qAnswered && styles.qTimerDone]}>
              <Ionicons name={locked ? 'lock-closed' : qAnswered ? 'checkmark' : 'hourglass-outline'} size={13}
                color={locked ? colors.danger : qAnswered ? colors.success : qUrgent ? colors.danger : colors.text} />
              <Text style={[styles.qTimerText, qUrgent && { color: colors.danger }, locked && { color: colors.danger }, qAnswered && { color: colors.success }]}>
                {locked ? '0:00' : `${Math.floor(qLeft / 60)}:${String(qLeft % 60).padStart(2, '0')}`}
              </Text>
            </View>
            <View style={styles.pointsBadge}><Text style={styles.pointsText}>{q.points} pt{q.points > 1 ? 's' : ''}</Text></View>
          </View>
        </View>

        <Text style={styles.enonce}>{q.enonce}</Text>

        {locked && (
          <View style={styles.expiredBanner}>
            <Ionicons name="alert-circle" size={18} color={colors.danger} />
            <Text style={styles.expiredText}>Temps écoulé — les points de cette question sont perdus.</Text>
          </View>
        )}

        {options.length > 0 ? (
          <View style={[styles.optionsContainer, locked && styles.lockedBlock]}>
            {options.map((opt, i) => {
              const selected = currentAnswer === opt.key;
              const letter = String.fromCharCode(65 + i);
              return (
                <TouchableOpacity key={`${i}-${opt.key}`} style={[styles.option, selected && styles.optionSelected]} onPress={() => handleAnswer(opt.key)} activeOpacity={0.8} disabled={locked}>
                  <View style={[styles.optionKey, selected && styles.optionKeySelected]}>
                    <Text style={[styles.optionKeyText, selected && styles.optionKeyTextSelected]}>{letter}</Text>
                  </View>
                  <Text style={[styles.optionTexte, selected && styles.optionTexteSelected]}>{opt.texte}</Text>
                  {selected ? <Ionicons name="checkmark-circle" size={20} color={colors.primary} /> : null}
                </TouchableOpacity>
              );
            })}
          </View>
        ) : isOpen ? (
          <TextInput
            style={[styles.openInput, locked && styles.lockedBlock]}
            placeholder={locked ? 'Temps écoulé' : 'Saisis ta réponse…'}
            placeholderTextColor={colors.textLight}
            value={currentAnswer ?? ''}
            onChangeText={handleAnswer}
            editable={!locked}
            multiline
            textAlignVertical="top"
          />
        ) : (
          <View style={styles.openAnswer}><Text style={styles.openAnswerText}>Type de question non pris en charge.</Text></View>
        )}

        {/* Assistant IA — n'aide jamais en révélant la réponse */}
        <TouchableOpacity style={styles.assistBtn} onPress={openAssistant} activeOpacity={0.85}>
          <Ionicons name="sparkles" size={16} color={colors.primary} />
          <Text style={styles.assistBtnText}>Je ne comprends pas — Assistant</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Navigation bas : précédent / suivant / terminer */}
      <View style={styles.footer}>
        <TouchableOpacity style={[styles.navBtn, isFirst && styles.navBtnDisabled]} onPress={() => goTo(currentIndex - 1)} disabled={isFirst}>
          <Ionicons name="chevron-back" size={20} color={isFirst ? colors.textLight : colors.text} />
          <Text style={[styles.navBtnText, isFirst && { color: colors.textLight }]}>Précédent</Text>
        </TouchableOpacity>

        {isLast ? (
          <TouchableOpacity style={styles.submitBtn} onPress={() => setShowSubmit(true)} disabled={submitting}>
            {submitting ? <ActivityIndicator color="#fff" /> : (
              <>
                <Text style={styles.submitBtnText}>Terminer</Text>
                <Ionicons name="checkmark-done" size={18} color="#fff" />
              </>
            )}
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.nextBtn} onPress={() => goTo(currentIndex + 1)}>
            <Text style={styles.nextBtnText}>Suivant</Text>
            <Ionicons name="chevron-forward" size={20} color="#fff" />
          </TouchableOpacity>
        )}
      </View>

      {/* Grille de navigation des questions */}
      <Modal visible={showGrid} transparent animationType="fade" onRequestClose={() => setShowGrid(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setShowGrid(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Navigation</Text>
            <Text style={styles.sheetSub}>{nbAnswered} répondue{nbAnswered > 1 ? 's' : ''} · {questions.length - nbAnswered} restante{questions.length - nbAnswered > 1 ? 's' : ''}</Text>
            <View style={styles.grid}>
              {questions.map((qq, i) => {
                const done = answers[qq.id_question] != null && answers[qq.id_question] !== '';
                const isCur = i === currentIndex;
                return (
                  <TouchableOpacity key={qq.id_question} style={[styles.gridCell, done && styles.gridCellDone, isCur && styles.gridCellCurrent]} onPress={() => goTo(i)}>
                    <Text style={[styles.gridCellText, (done || isCur) && { color: '#fff' }]}>{i + 1}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <View style={styles.legendRow}>
              <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: colors.emerald }]} /><Text style={styles.legendText}>Répondue</Text></View>
              <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: colors.primary }]} /><Text style={styles.legendText}>Actuelle</Text></View>
              <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.borderStrong }]} /><Text style={styles.legendText}>Vide</Text></View>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Assistant IA pédagogique */}
      <Modal visible={assistOpen} transparent animationType="slide" onRequestClose={() => setAssistOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setAssistOpen(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.sheetHandle} />
            <View style={styles.assistHeader}>
              <View style={styles.assistAvatar}><Ionicons name="sparkles" size={18} color={colors.primary} /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.sheetTitle}>Assistant</Text>
                <Text style={styles.assistHint}>Il t'aide à comprendre — sans donner la réponse.</Text>
              </View>
            </View>

            <View style={styles.assistActions}>
              {([
                { key: 'expliquer', label: 'Expliquer', icon: 'book-outline' },
                { key: 'reformuler', label: 'Reformuler', icon: 'repeat-outline' },
                { key: 'indice', label: 'Un indice', icon: 'bulb-outline' },
              ] as const).map((a) => (
                <TouchableOpacity
                  key={a.key}
                  style={[styles.assistChip, assistAction === a.key && styles.assistChipActive]}
                  onPress={() => askAssistant(a.key)}
                  disabled={assistLoading}
                >
                  <Ionicons name={a.icon} size={16} color={assistAction === a.key ? '#fff' : colors.primary} />
                  <Text style={[styles.assistChipText, assistAction === a.key && { color: '#fff' }]}>{a.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.assistBody}>
              {assistLoading ? (
                <View style={styles.assistLoading}>
                  <ActivityIndicator color={colors.primary} />
                  <Text style={styles.assistLoadingText}>L'assistant réfléchit…</Text>
                </View>
              ) : assistText ? (
                <Text style={styles.assistAnswer}>{assistText}</Text>
              ) : (
                <Text style={styles.assistPlaceholder}>Choisis une option ci-dessus pour obtenir de l'aide sur cette question.</Text>
              )}
            </View>

            <TouchableOpacity style={styles.assistClose} onPress={() => setAssistOpen(false)}>
              <Text style={styles.assistCloseText}>Fermer</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Confirmation de soumission */}
      <Modal visible={showSubmit} transparent animationType="fade" onRequestClose={() => setShowSubmit(false)}>
        <Pressable style={[styles.modalBackdrop, { justifyContent: 'center', padding: spacing.lg }]} onPress={() => setShowSubmit(false)}>
          <Pressable style={styles.confirmCard} onPress={(e) => e.stopPropagation()}>
            <View style={styles.confirmIcon}><Ionicons name="checkmark-done-circle-outline" size={40} color={colors.primary} /></View>
            <Text style={styles.confirmTitle}>Terminer l'examen ?</Text>
            <Text style={styles.confirmSub}>
              Tu as répondu à {nbAnswered} question{nbAnswered > 1 ? 's' : ''} sur {questions.length}.
              {nbAnswered < questions.length ? ` ${questions.length - nbAnswered} sans réponse.` : ' Tout est complet !'}
            </Text>
            <TouchableOpacity style={styles.confirmPrimary} onPress={() => handleSubmit(false)} disabled={submitting}>
              {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.confirmPrimaryText}>Soumettre et voir la correction</Text>}
            </TouchableOpacity>
            <TouchableOpacity style={styles.confirmSecondary} onPress={() => setShowSubmit(false)}>
              <Text style={styles.confirmSecondaryText}>Continuer l'examen</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, backgroundColor: colors.bg },
  emptyText: { color: colors.textMuted, marginBottom: 12, textAlign: 'center' },
  backLinkRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  backLink: { color: colors.primary, fontWeight: '700' },

  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.md, paddingTop: 54, paddingBottom: 10, backgroundColor: colors.surface },
  topBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, padding: 4 },
  timer: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.surfaceAlt, paddingHorizontal: 14, paddingVertical: 7, borderRadius: radius.full, borderWidth: 1, borderColor: colors.border },
  timerUrgent: { backgroundColor: '#FEF2F2', borderColor: '#FECACA' },
  timerText: { fontSize: 15, fontWeight: '800', color: colors.text, fontVariant: ['tabular-nums'] },
  answeredBadge: { backgroundColor: colors.primaryLight, borderRadius: radius.full, paddingHorizontal: 7, paddingVertical: 2 },
  answeredBadgeText: { fontSize: 11, fontWeight: '800', color: colors.primary },

  progressBar: { height: 4, backgroundColor: colors.border },
  progressFill: { height: '100%', backgroundColor: colors.primary, borderRadius: 2 },

  body: { padding: spacing.lg, paddingBottom: 120 },
  qHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  qNumber: { fontSize: 14, fontWeight: '800', color: colors.primary },
  qTotal: { color: colors.textLight, fontWeight: '700' },
  qHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  qTimer: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.surfaceAlt, paddingHorizontal: 9, paddingVertical: 4, borderRadius: radius.full, borderWidth: 1, borderColor: colors.border },
  qTimerUrgent: { backgroundColor: '#FEF2F2', borderColor: '#FECACA' },
  qTimerExpired: { backgroundColor: '#FEF2F2', borderColor: '#FCA5A5' },
  qTimerDone: { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' },
  qTimerText: { fontSize: 12.5, fontWeight: '800', color: colors.text, fontVariant: ['tabular-nums'] },
  pointsBadge: { backgroundColor: colors.primaryLight, paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.sm },
  pointsText: { fontSize: 12, fontWeight: '800', color: colors.primary },
  expiredBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FCA5A5', borderRadius: radius.md, padding: 12, marginBottom: 16 },
  expiredText: { flex: 1, fontSize: 13, fontWeight: '700', color: colors.danger },
  lockedBlock: { opacity: 0.45 },
  enonce: { fontSize: 19, fontWeight: '700', color: colors.text, lineHeight: 28, marginBottom: 24 },

  optionsContainer: { gap: 10 },
  option: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.md, padding: 14, borderWidth: 1.5, borderColor: colors.border },
  optionSelected: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  optionKey: { width: 32, height: 32, borderRadius: 8, borderWidth: 1.5, borderColor: colors.borderStrong, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  optionKeySelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  optionKeyText: { fontSize: 14, fontWeight: '800', color: colors.textMuted },
  optionKeyTextSelected: { color: '#fff' },
  optionTexte: { flex: 1, fontSize: 15, color: colors.text, fontWeight: '500' },
  optionTexteSelected: { color: colors.text, fontWeight: '700' },
  openInput: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.border, padding: 14, fontSize: 15, color: colors.text, minHeight: 120 },
  openAnswer: { backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: 20, alignItems: 'center' },
  openAnswerText: { color: colors.textLight, fontStyle: 'italic' },

  footer: { position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', gap: 10, backgroundColor: colors.surface, padding: spacing.md, paddingBottom: 28, borderTopWidth: 1, borderTopColor: colors.border },
  navBtn: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 16, paddingVertical: 14, borderRadius: radius.md, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border },
  navBtnDisabled: { opacity: 0.5 },
  navBtnText: { fontSize: 14, fontWeight: '700', color: colors.text },
  nextBtn: { flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 4, backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: 14 },
  nextBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  submitBtn: { flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, backgroundColor: colors.emerald, borderRadius: radius.md, paddingVertical: 14 },
  submitBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },

  modalBackdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.lg, paddingBottom: 36 },
  sheetHandle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.borderStrong, marginBottom: 16 },
  sheetTitle: { fontSize: 18, fontWeight: '800', color: colors.text },
  sheetSub: { fontSize: 13, color: colors.textMuted, marginTop: 4, marginBottom: 18 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  gridCell: { width: 44, height: 44, borderRadius: radius.sm, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border, justifyContent: 'center', alignItems: 'center' },
  gridCellDone: { backgroundColor: colors.emerald, borderColor: colors.emerald },
  gridCellCurrent: { backgroundColor: colors.primary, borderColor: colors.primary },
  gridCellText: { fontSize: 15, fontWeight: '800', color: colors.textMuted },
  legendRow: { flexDirection: 'row', gap: 16, marginTop: 18 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 12, height: 12, borderRadius: 4 },
  legendText: { fontSize: 12, color: colors.textMuted, fontWeight: '600' },

  confirmCard: { backgroundColor: colors.surface, borderRadius: radius.xl, padding: spacing.lg, alignItems: 'center', ...shadow.lg },
  confirmIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.primaryLight, justifyContent: 'center', alignItems: 'center', marginBottom: 14 },
  confirmTitle: { fontSize: 19, fontWeight: '800', color: colors.text, marginBottom: 8 },
  confirmSub: { fontSize: 14, color: colors.textMuted, textAlign: 'center', lineHeight: 20, marginBottom: 22 },
  confirmPrimary: { width: '100%', backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: 15, alignItems: 'center' },
  confirmPrimaryText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  confirmSecondary: { paddingVertical: 14 },
  confirmSecondaryText: { color: colors.textMuted, fontSize: 14, fontWeight: '700' },

  assistBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 20, paddingVertical: 12, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.primaryLight, backgroundColor: colors.primaryLight },
  assistBtnText: { fontSize: 14, fontWeight: '800', color: colors.primary },
  assistHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 18 },
  assistAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primaryLight, justifyContent: 'center', alignItems: 'center' },
  assistHint: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  assistActions: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  assistChip: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 11, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.surface },
  assistChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  assistChipText: { fontSize: 13, fontWeight: '700', color: colors.primary },
  assistBody: { minHeight: 120, backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: 16, justifyContent: 'center' },
  assistLoading: { flexDirection: 'row', alignItems: 'center', gap: 10, justifyContent: 'center' },
  assistLoadingText: { fontSize: 14, color: colors.textMuted, fontWeight: '600' },
  assistAnswer: { fontSize: 15, color: colors.text, lineHeight: 23 },
  assistPlaceholder: { fontSize: 14, color: colors.textLight, textAlign: 'center', lineHeight: 20 },
  assistClose: { alignItems: 'center', paddingVertical: 14, marginTop: 8 },
  assistCloseText: { fontSize: 15, fontWeight: '700', color: colors.textMuted },
});
