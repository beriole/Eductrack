import { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  Alert, Vibration, ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '@/src/lib/api';

const DUREES = [15, 20, 25, 30, 45];

type TimerState = 'idle' | 'running' | 'paused' | 'break';

export default function FocusScreen() {
  const router = useRouter();
  const [duree, setDuree] = useState(25);
  const [timerState, setTimerState] = useState<TimerState>('idle');
  const [remaining, setRemaining] = useState(25 * 60);
  const [sessionsDone, setSessionsDone] = useState(0);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [xpTotal, setXpTotal] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (timerState === 'running') {
      intervalRef.current = setInterval(() => {
        setRemaining((r) => {
          if (r <= 1) {
            handleSessionComplete();
            return 0;
          }
          return r - 1;
        });
      }, 1000);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [timerState]);

  const handleSessionComplete = () => {
    Vibration.vibrate([0, 500, 200, 500]);
    const newDone = sessionsDone + 1;
    setSessionsDone(newDone);
    setTimerState('break');
    Alert.alert(
      'Pomodoro terminé !',
      `Bravo ! Tu as complété ${newDone} pomodoro(s).\nFais une pause de 5 minutes.`,
      [
        { text: 'Reprendre', onPress: () => startNewPomodoro() },
        { text: 'Arrêter', style: 'destructive', onPress: () => stopSession(newDone) },
      ],
    );
  };

  const startNewPomodoro = () => {
    setRemaining(duree * 60);
    setTimerState('running');
  };

  const startSession = async () => {
    try {
      const res = await api.post('/focus/start/', { duree_pomodoro_min: duree });
      setFocusId(res.data.id_focus);
      setRemaining(duree * 60);
      setSessionsDone(0);
      setXpTotal(0);
      setTimerState('running');
    } catch {
      Alert.alert('Erreur', 'Impossible de démarrer la session.');
    }
  };

  const stopSession = async (nb?: number) => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setTimerState('idle');
    const completedSessions = nb ?? sessionsDone;
    if (focusId && completedSessions > 0) {
      try {
        const res = await api.post(`/focus/${focusId}/stop/`, { nb_sessions: completedSessions });
        setXpTotal((prev) => prev + (res.data.xp_gagne ?? 0));
      } catch {}
    }
    setFocusId(null);
    setRemaining(duree * 60);
    setSessionsDone(0);
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const progress = (duree * 60 - remaining) / (duree * 60);
  const isRunning = timerState === 'running' || timerState === 'paused';

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {/* Header */}
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backRow}>
          <Ionicons name="arrow-back" size={18} color={ACCENT} />
          <Text style={styles.backText}>Retour</Text>
        </TouchableOpacity>
        <View style={styles.headerTitleRow}>
          <Ionicons name="timer" size={18} color={PRIMARY} />
          <Text style={styles.headerTitle}>Focus Pomodoro</Text>
        </View>
        <View style={{ width: 60 }} />
      </View>

      {/* Stats */}
      {xpTotal > 0 && (
        <View style={styles.xpBanner}>
          <Text style={styles.xpText}>+{xpTotal} XP gagnés cette session !</Text>
        </View>
      )}

      {/* Timer circle */}
      <View style={styles.timerContainer}>
        <View style={[styles.timerCircle, { borderColor: timerState === 'running' ? '#10B981' : timerState === 'paused' ? '#F59E0B' : '#6C63FF' }]}>
          <Text style={styles.timerText}>{formatTime(remaining)}</Text>
          <Text style={styles.timerLabel}>
            {timerState === 'idle' ? 'Prêt' : timerState === 'running' ? 'En cours...' : timerState === 'paused' ? 'Pause' : 'Repos'}
          </Text>
        </View>
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
        </View>
      </View>

      {/* Sessions faites */}
      {sessionsDone > 0 && (
        <View style={styles.dotsRow}>
          {Array.from({ length: sessionsDone }).map((_, i) => (
            <Ionicons key={i} name="checkmark-circle" size={20} color="#10B981" />
          ))}
        </View>
      )}

      {/* Sélection durée */}
      {!isRunning && (
        <>
          <Text style={styles.sectionLabel}>Durée du pomodoro</Text>
          <View style={styles.dureesRow}>
            {DUREES.map((d) => (
              <TouchableOpacity
                key={d}
                style={[styles.dureeBtn, duree === d && styles.dureeBtnActive]}
                onPress={() => { setDuree(d); setRemaining(d * 60); }}
              >
                <Text style={[styles.dureeBtnText, duree === d && styles.dureeBtnTextActive]}>{d} min</Text>
              </TouchableOpacity>
            ))}
          </View>
        </>
      )}

      {/* Boutons de contrôle */}
      <View style={styles.controls}>
        {!isRunning ? (
          <TouchableOpacity style={styles.startBtn} onPress={startSession}>
            <Ionicons name="play" size={20} color="#fff" />
            <Text style={styles.startBtnText}>Démarrer</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.controlRow}>
            <TouchableOpacity
              style={styles.pauseBtn}
              onPress={() => setTimerState((s) => s === 'running' ? 'paused' : 'running')}
            >
              <Ionicons name={timerState === 'running' ? 'pause' : 'play'} size={18} color="#fff" />
              <Text style={styles.pauseBtnText}>{timerState === 'running' ? 'Pause' : 'Reprendre'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.stopBtn} onPress={() => stopSession()}>
              <Ionicons name="stop" size={18} color="#fff" />
              <Text style={styles.stopBtnText}>Arrêter</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Infos */}
      <View style={styles.infoBox}>
        <Ionicons name="bulb" size={18} color="#7C3AED" style={{ marginBottom: 6 }} />
        <Text style={styles.infoText}>
          {'La technique Pomodoro améliore ta concentration.\n'
          + 'Travaille 25 min intensément, puis fais une pause de 5 min.\n'
          + 'Après 4 pomodoros, fais une grande pause de 15-30 min.'}
        </Text>
      </View>
    </ScrollView>
  );
}

const PRIMARY = '#1E3A5F';
const ACCENT = '#6C63FF';

const styles = StyleSheet.create({
  container: { flexGrow: 1, backgroundColor: '#F9FAFB', paddingHorizontal: 24, paddingBottom: 40, paddingTop: 56 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: 4, width: 60 },
  backText: { color: ACCENT, fontWeight: '600', fontSize: 14 },
  headerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  headerTitle: { fontSize: 18, fontWeight: '800', color: PRIMARY },
  xpBanner: { backgroundColor: '#FEF3C7', borderRadius: 12, padding: 12, marginBottom: 16, alignItems: 'center' },
  xpText: { color: '#92400E', fontWeight: '700', fontSize: 15 },
  timerContainer: { alignItems: 'center', marginVertical: 32 },
  timerCircle: {
    width: 200, height: 200, borderRadius: 100, borderWidth: 8,
    justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff', elevation: 4,
  },
  timerText: { fontSize: 52, fontWeight: '900', color: PRIMARY },
  timerLabel: { fontSize: 14, color: '#9CA3AF', marginTop: 4 },
  progressBar: { width: '100%', height: 6, backgroundColor: '#E5E7EB', borderRadius: 3, marginTop: 24 },
  progressFill: { height: '100%', backgroundColor: ACCENT, borderRadius: 3 },
  dotsRow: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 8 },
  dot: { fontSize: 20 },
  sectionLabel: { fontSize: 14, fontWeight: '700', color: '#6B7280', marginBottom: 10 },
  dureesRow: { flexDirection: 'row', gap: 10, marginBottom: 32, flexWrap: 'wrap' },
  dureeBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#E5E7EB' },
  dureeBtnActive: { borderColor: ACCENT, backgroundColor: `${ACCENT}15` },
  dureeBtnText: { fontSize: 14, fontWeight: '600', color: '#6B7280' },
  dureeBtnTextActive: { color: ACCENT },
  controls: { marginBottom: 24 },
  startBtn: { flexDirection: 'row', gap: 8, backgroundColor: ACCENT, borderRadius: 16, paddingVertical: 18, alignItems: 'center', justifyContent: 'center' },
  startBtnText: { color: '#fff', fontSize: 18, fontWeight: '800' },
  controlRow: { flexDirection: 'row', gap: 12 },
  pauseBtn: { flex: 1, flexDirection: 'row', gap: 6, backgroundColor: '#F59E0B', borderRadius: 14, paddingVertical: 16, alignItems: 'center', justifyContent: 'center' },
  pauseBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  stopBtn: { flex: 1, flexDirection: 'row', gap: 6, backgroundColor: '#EF4444', borderRadius: 14, paddingVertical: 16, alignItems: 'center', justifyContent: 'center' },
  stopBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  infoBox: { backgroundColor: '#EDE9FE', borderRadius: 12, padding: 16 },
  infoText: { fontSize: 13, color: '#4B5563', lineHeight: 20 },
});
