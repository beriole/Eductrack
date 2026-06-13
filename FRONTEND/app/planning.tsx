import { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl, Alert, Switch,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '@/src/lib/api';
import { GradientBox } from '@/src/components/GradientBox';
import { colors, radius, spacing, shadow, subjectColor } from '@/src/theme';

interface SessionEtude {
  id_session_etude: string;
  matiere_nom: string;
  matiere_code: string;
  date_heure: string;
  duree_minutes: number;
  objectif: string;
  completee: boolean;
}

interface Planning {
  id_planning: string;
  semaine_debut: string;
  nb_sessions: number;
  actif: boolean;
}

const JOURS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const JOURS_FULL = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
const CRENEAUX_DEFAUT: Record<string, string[]> = {
  lundi: [], mardi: [], mercredi: [], jeudi: [], vendredi: [], samedi: [], dimanche: [],
};
const HEURES = ['06:00', '07:00', '08:00', '09:00', '10:00', '12:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00', '21:00'];

const estPointFaible = (objectif?: string) => !!objectif && objectif.startsWith('Renforcer');

export default function PlanningScreen() {
  const router = useRouter();
  const [planning, setPlanning] = useState<Planning | null>(null);
  const [sessions, setSessions] = useState<SessionEtude[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [autoLoading, setAutoLoading] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [disponibilites, setDisponibilites] = useState<Record<string, string[]>>(CRENEAUX_DEFAUT);
  const [joursActifs, setJoursActifs] = useState<Record<string, boolean>>({
    lundi: false, mardi: false, mercredi: false, jeudi: false,
    vendredi: false, samedi: false, dimanche: false,
  });

  const fetchPlanning = async () => {
    try {
      const res = await api.get('/plannings/actif/');
      setPlanning(res.data.planning);
      setSessions(res.data.sessions ?? []);
    } catch {}
  };

  useEffect(() => {
    fetchPlanning().finally(() => setLoading(false));
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchPlanning();
    setRefreshing(false);
  };

  const toggleJour = (jour: string) => {
    const next = !joursActifs[jour];
    setJoursActifs((prev) => ({ ...prev, [jour]: next }));
    if (next && !disponibilites[jour].length) {
      setDisponibilites((prev) => ({ ...prev, [jour]: ['18:00', '20:00'] }));
    }
  };

  const setHeure = (jour: string, index: 0 | 1, heure: string) => {
    setDisponibilites((prev) => {
      const slot = [...(prev[jour] ?? ['08:00', '10:00'])];
      slot[index] = heure;
      return { ...prev, [jour]: slot };
    });
  };

  // Génération automatique : l'app propose un emploi du temps réaliste
  // (rythme scolaire camerounais + priorité aux matières faibles).
  const genererAuto = async () => {
    setAutoLoading(true);
    try {
      const res = await api.post('/plannings/creer/', { mode: 'auto' });
      setPlanning(res.data.planning);
      setSessions(res.data.sessions ?? []);
      setShowForm(false);
      Alert.alert('Planning généré', `${res.data.sessions?.length ?? 0} sessions adaptées à tes points faibles et à ton emploi du temps.`);
    } catch {
      Alert.alert('Erreur', 'Impossible de générer le planning.');
    } finally {
      setAutoLoading(false);
    }
  };

  const creerPlanning = async () => {
    const dispo: Record<string, string[]> = {};
    JOURS_FULL.forEach((j) => {
      if (joursActifs[j] && disponibilites[j]?.length === 2) {
        dispo[j] = disponibilites[j];
      }
    });
    if (Object.keys(dispo).length === 0) {
      Alert.alert('Aucun créneau', 'Activez au moins un jour de disponibilité.');
      return;
    }
    setCreating(true);
    try {
      const res = await api.post('/plannings/creer/', { disponibilites: dispo });
      setPlanning(res.data.planning);
      setSessions(res.data.sessions ?? []);
      setShowForm(false);
      Alert.alert('Planning créé', `${res.data.sessions?.length ?? 0} sessions générées pour cette semaine.`);
    } catch {
      Alert.alert('Erreur', 'Impossible de créer le planning.');
    } finally {
      setCreating(false);
    }
  };

  const completerSession = async (id: string) => {
    try {
      const res = await api.post(`/plannings/sessions/${id}/completer/`);
      setSessions((prev) => prev.map((s) => s.id_session_etude === id ? { ...s, completee: true } : s));
      Alert.alert('Session complétée', `+${res.data.xp_gagne} XP gagnés !`);
    } catch {}
  };

  const sessionsParJour = JOURS_FULL.map((jour) => {
    const dayIndex = JOURS_FULL.indexOf(jour);
    const sessionsJour = sessions
      .filter((s) => {
        const d = new Date(s.date_heure);
        return (d.getDay() === 0 ? 6 : d.getDay() - 1) === dayIndex;
      })
      .sort((a, b) => +new Date(a.date_heure) - +new Date(b.date_heure));
    return { jour, sessionsJour };
  }).filter((d) => d.sessionsJour.length > 0);

  if (loading) {
    return <View style={styles.centered}><ActivityIndicator size="large" color={colors.primary} /></View>;
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
    >
      {/* Header */}
      <GradientBox colors={colors.gradientPrimary} style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backRow}>
          <Ionicons name="arrow-back" size={18} color="rgba(255,255,255,0.9)" />
          <Text style={styles.backText}>Retour</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Mon Planning</Text>
        {planning ? (
          <Text style={styles.subtitle}>
            Semaine du {new Date(planning.semaine_debut).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}
            {' · '}{sessions.filter(s => s.completee).length}/{sessions.length} complétées
          </Text>
        ) : (
          <Text style={styles.subtitle}>Organise tes révisions intelligemment</Text>
        )}
      </GradientBox>

      {/* Génération automatique (mise en avant) */}
      <TouchableOpacity style={styles.autoBtn} onPress={genererAuto} disabled={autoLoading} activeOpacity={0.9}>
        {autoLoading
          ? <ActivityIndicator color="#fff" />
          : (
            <>
              <View style={styles.autoBtnTitleRow}>
                <Ionicons name="sparkles" size={16} color="#fff" />
                <Text style={styles.autoBtnTitle}>Générer automatiquement</Text>
              </View>
              <Text style={styles.autoBtnSub}>Adapté à tes points faibles · 2-3 matières/jour · mercredi & week-end</Text>
            </>
          )}
      </TouchableOpacity>

      {/* Personnalisation manuelle */}
      <TouchableOpacity style={styles.createBtn} onPress={() => setShowForm(!showForm)}>
        <Ionicons name={showForm ? 'close' : 'options-outline'} size={16} color={colors.primary} />
        <Text style={styles.createBtnText}>
          {showForm ? 'Fermer' : 'Personnaliser mes créneaux'}
        </Text>
      </TouchableOpacity>

      {showForm && (
        <View style={styles.formCard}>
          <Text style={styles.formTitle}>Mes disponibilités cette semaine</Text>
          {JOURS_FULL.map((jour, i) => (
            <View key={jour} style={styles.jourRow}>
              <Switch
                value={joursActifs[jour]}
                onValueChange={() => toggleJour(jour)}
                trackColor={{ false: colors.border, true: '#C4B5FD' }}
                thumbColor={joursActifs[jour] ? colors.primary : '#9CA3AF'}
              />
              <Text style={[styles.jourLabel, joursActifs[jour] && styles.jourLabelActive]}>
                {JOURS[i]}
              </Text>
              {joursActifs[jour] && (
                <View style={styles.heuresRow}>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    {HEURES.map((h) => (
                      <TouchableOpacity
                        key={`${jour}-debut-${h}`}
                        style={[styles.heureBtn, disponibilites[jour]?.[0] === h && styles.heureBtnActive]}
                        onPress={() => setHeure(jour, 0, h)}
                      >
                        <Text style={[styles.heureBtnText, disponibilites[jour]?.[0] === h && styles.heureBtnTextActive]}>{h}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                  <Text style={styles.heureSep}>→</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    {HEURES.map((h) => (
                      <TouchableOpacity
                        key={`${jour}-fin-${h}`}
                        style={[styles.heureBtn, disponibilites[jour]?.[1] === h && styles.heureBtnActive]}
                        onPress={() => setHeure(jour, 1, h)}
                      >
                        <Text style={[styles.heureBtnText, disponibilites[jour]?.[1] === h && styles.heureBtnTextActive]}>{h}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}
            </View>
          ))}
          <TouchableOpacity
            style={[styles.genererBtn, creating && styles.genererBtnLoading]}
            onPress={creerPlanning}
            disabled={creating}
          >
            {creating
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.genererBtnText}>Générer avec mes créneaux</Text>
            }
          </TouchableOpacity>
        </View>
      )}

      {/* Sessions par jour */}
      {sessionsParJour.length === 0 && !showForm ? (
        <View style={styles.emptyState}>
          <Ionicons name="calendar-outline" size={48} color={colors.textLight} style={styles.emptyIcon} />
          <Text style={styles.emptyTitle}>Aucun planning cette semaine</Text>
          <Text style={styles.emptySub}>Appuie sur « Générer automatiquement » pour un programme adapté à tes besoins.</Text>
        </View>
      ) : (
        <View style={styles.content}>
          {sessionsParJour.map(({ jour, sessionsJour }) => (
            <View key={jour} style={styles.jourSection}>
              <Text style={styles.jourTitre}>{jour.charAt(0).toUpperCase() + jour.slice(1)}</Text>
              {sessionsJour.map((s) => {
                const color = subjectColor(s.matiere_code);
                const faible = estPointFaible(s.objectif);
                return (
                  <View key={s.id_session_etude} style={[styles.sessionCard, s.completee && styles.sessionCardDone]}>
                    <View style={[styles.sessionColorBar, { backgroundColor: color }]} />
                    <View style={styles.sessionContent}>
                      <View style={styles.sessionTitleRow}>
                        <Text style={styles.sessionMatiere}>{s.matiere_nom}</Text>
                        {faible && (
                          <View style={styles.faibleBadge}>
                            <Ionicons name="alert-circle" size={11} color="#B91C1C" />
                            <Text style={styles.faibleBadgeText}>Point faible</Text>
                          </View>
                        )}
                      </View>
                      <Text style={styles.sessionHeure}>
                        {new Date(s.date_heure).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                        {' · '}{s.duree_minutes} min
                      </Text>
                      <Text style={styles.sessionObjectif} numberOfLines={1}>{s.objectif}</Text>
                    </View>
                    {s.completee ? (
                      <Ionicons name="checkmark-circle" size={26} color={colors.success} style={styles.doneCheck} />
                    ) : (
                      <TouchableOpacity
                        style={[styles.completerBtn, { backgroundColor: `${color}1A`, borderColor: color }]}
                        onPress={() => completerSession(s.id_session_etude)}
                      >
                        <Text style={[styles.completerBtnText, { color }]}>Fait</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })}
            </View>
          ))}
        </View>
      )}

      <View style={{ height: 32 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.bg },
  header: { paddingTop: 56, paddingBottom: spacing.lg, paddingHorizontal: spacing.lg },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 12 },
  backText: { color: 'rgba(255,255,255,0.9)', fontWeight: '700', fontSize: 14 },
  title: { fontSize: 24, fontWeight: '800', color: '#fff' },
  subtitle: { fontSize: 13, color: 'rgba(255,255,255,0.85)', marginTop: 4 },

  autoBtn: {
    backgroundColor: colors.primary, marginHorizontal: spacing.md, marginTop: spacing.md,
    borderRadius: radius.lg, paddingVertical: spacing.md, paddingHorizontal: spacing.md,
    alignItems: 'center', ...shadow.lg,
  },
  autoBtnTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  autoBtnTitle: { color: '#fff', fontWeight: '800', fontSize: 16 },
  autoBtnSub: { color: 'rgba(255,255,255,0.85)', fontSize: 11.5, marginTop: 4, fontWeight: '600', textAlign: 'center' },

  createBtn: { flexDirection: 'row', gap: 6, marginHorizontal: spacing.md, marginTop: 12, paddingVertical: 12, alignItems: 'center', justifyContent: 'center' },
  createBtnText: { color: colors.primary, fontWeight: '700', fontSize: 14 },

  formCard: { backgroundColor: colors.surface, marginHorizontal: spacing.md, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.border, ...shadow.sm },
  formTitle: { fontSize: 15, fontWeight: '800', color: colors.text, marginBottom: 14 },
  jourRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' },
  jourLabel: { fontSize: 14, fontWeight: '700', color: colors.textLight, marginLeft: 10, width: 36 },
  jourLabelActive: { color: colors.text },
  heuresRow: { flex: 1, flexDirection: 'row', alignItems: 'center', marginLeft: 8 },
  heureSep: { marginHorizontal: 4, color: colors.textLight, fontWeight: '700' },
  heureBtn: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.sm, backgroundColor: colors.surfaceAlt, marginHorizontal: 2 },
  heureBtnActive: { backgroundColor: colors.primary },
  heureBtnText: { fontSize: 11, color: colors.textMuted, fontWeight: '700' },
  heureBtnTextActive: { color: '#fff' },
  genererBtn: { backgroundColor: colors.primaryDark, borderRadius: radius.md, paddingVertical: 14, alignItems: 'center', marginTop: 12 },
  genererBtnLoading: { backgroundColor: colors.textLight },
  genererBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },

  content: { paddingHorizontal: spacing.md, marginTop: spacing.sm },
  jourSection: { marginBottom: spacing.md },
  jourTitre: { fontSize: 14, fontWeight: '800', color: colors.textMuted, textTransform: 'uppercase', marginBottom: 8, letterSpacing: 1 },
  sessionCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.md, marginBottom: 8, overflow: 'hidden', borderWidth: 1, borderColor: colors.border, ...shadow.sm },
  sessionCardDone: { opacity: 0.55 },
  sessionColorBar: { width: 5, alignSelf: 'stretch' },
  sessionContent: { flex: 1, padding: 12 },
  sessionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  sessionMatiere: { fontSize: 14, fontWeight: '800', color: colors.text },
  faibleBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#FEF2F2', paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.full },
  faibleBadgeText: { fontSize: 10, fontWeight: '800', color: colors.rose },
  sessionHeure: { fontSize: 12, color: colors.textMuted, marginTop: 3 },
  sessionObjectif: { fontSize: 12, color: colors.textLight, marginTop: 2, fontStyle: 'italic' },
  doneCheck: { marginRight: 12 },
  completerBtn: { marginRight: 12, paddingHorizontal: 14, paddingVertical: 7, borderRadius: radius.sm, borderWidth: 1.5 },
  completerBtnText: { fontSize: 13, fontWeight: '800' },
  emptyState: { alignItems: 'center', paddingVertical: 48, paddingHorizontal: spacing.xl },
  emptyIcon: { marginBottom: 12 },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: colors.text, marginBottom: 8 },
  emptySub: { fontSize: 14, color: colors.textMuted, textAlign: 'center', lineHeight: 22 },
});
