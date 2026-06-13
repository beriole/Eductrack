import { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, ActivityIndicator, RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '@/src/store/authStore';
import { useI18n } from '@/src/i18n/useI18n';
import { colors, radius, shadow } from '@/src/theme';
import { api } from '@/src/lib/api';
import { TeacherHome } from '@/src/components/TeacherHome';

interface DashboardData {
  stats_globales: {
    points_gamification: number;
    streak_jours: number;
    score_global: number;
    total_sessions: number;
    taux_reussite: number;
  };
  lacunes_actives: Array<{ id_lacune: string; chapitre: string; notion: string; taux_maitrise: number; matiere_nom: string }>;
  cours_recents: Array<{ id_cours: string; titre: string; matiere_nom: string; niveau: string }>;
  sessions_recentes: Array<{ id_session: string; epreuve_titre: string; note_obtenue: string; date_fin: string }>;
  badges_recents: Array<{ id_badge: { nom: string; icone_url: string } }>;
}

type IconName = keyof typeof Ionicons.glyphMap;

export default function DashboardScreen() {
  const router = useRouter();
  const { user } = useAuthStore();
  const { t } = useI18n();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [coach, setCoach] = useState<string | null>(null);
  const [coachLoading, setCoachLoading] = useState(false);
  const [revision, setRevision] = useState<{ disponible: boolean; id_epreuve: string | null; duree_minutes: number; nb_questions: number; completee: boolean; serie_revisions: number } | null>(null);

  const fetchDashboard = async () => {
    try {
      const res = await api.get('/analytique/dashboard/');
      setData(res.data);
    } catch {}
  };

  const fetchCoach = async () => {
    setCoachLoading(true);
    try {
      const res = await api.get('/coach/conseil/');
      setCoach(res.data.message);
    } catch {} finally {
      setCoachLoading(false);
    }
  };

  const fetchRevision = async () => {
    try {
      const res = await api.get('/revisions/du-jour/');
      setRevision(res.data);
    } catch {}
  };

  useEffect(() => {
    fetchDashboard().finally(() => setLoading(false));
    if (user?.role === 'eleve') { fetchCoach(); fetchRevision(); }
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchDashboard();
    setRefreshing(false);
  };

  if (loading) {
    return <View style={styles.centered}><ActivityIndicator size="large" color={colors.primary} /></View>;
  }

  // ── Enseignant : tableau de bord direct (modules accessibles via les onglets) ──
  if (user?.role === 'enseignant') {
    return <TeacherHome />;
  }

  // ── Parent ──
  if (user?.role === 'parent') {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.scroll}>
        <Header prenom={user?.prenom} subtitle="Espace parent" />
        <View style={{ paddingHorizontal: 20, gap: 12 }}>
          <RoleCard icon="people" title="Suivi de mes enfants" sub="Stats, rapports et progression" onPress={() => router.push('/parent/dashboard')} />
          <RoleCard icon="notifications" title="Notifications" sub="Alertes et mises à jour" onPress={() => router.push('/notifications')} />
        </View>
      </ScrollView>
    );
  }

  const stats = data?.stats_globales;
  const isEmpty = !data?.cours_recents?.length && !data?.lacunes_actives?.length;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scroll}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
    >
      <Header
        prenom={user?.prenom}
        subtitle={t('dashboard.subtitle')}
        right={!user?.email_verifie ? (
          <TouchableOpacity style={styles.verifyChip} onPress={() => router.push('/(auth)/verify-email')}>
            <Ionicons name="warning-outline" size={13} color={colors.warning} />
            <Text style={styles.verifyChipText}>Vérifier l'email</Text>
          </TouchableOpacity>
        ) : null}
      />

      {/* Streak */}
      {(stats?.streak_jours ?? 0) > 0 && (
        <View style={styles.streakChip}>
          <Ionicons name="flame" size={16} color={colors.amber} />
          <Text style={styles.streakText}>{stats?.streak_jours} jours de série</Text>
        </View>
      )}

      {/* Coach IA */}
      {(coach || coachLoading) && (
        <View style={styles.coachCard}>
          <View style={styles.coachIcon}>
            <Ionicons name="sparkles" size={18} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.coachLabel}>Ton coach</Text>
            {coachLoading
              ? <ActivityIndicator size="small" color={colors.primary} style={{ alignSelf: 'flex-start', marginTop: 4 }} />
              : <Text style={styles.coachText}>{coach}</Text>}
          </View>
          <TouchableOpacity onPress={fetchCoach} disabled={coachLoading} style={styles.coachRefresh}>
            <Ionicons name="refresh" size={16} color={colors.textLight} />
          </TouchableOpacity>
        </View>
      )}

      {/* Révision du jour */}
      {revision?.disponible && (
        <TouchableOpacity
          style={[styles.revCard, revision.completee && styles.revCardDone]}
          activeOpacity={0.9}
          disabled={revision.completee || !revision.id_epreuve}
          onPress={() => router.push(`/sessions/nouvelle?epreuveId=${revision.id_epreuve}&mode=exercice&duree=${revision.duree_minutes}&revision=1`)}
        >
          <View style={[styles.revIcon, { backgroundColor: revision.completee ? `${colors.success}20` : 'rgba(255,255,255,0.2)' }]}>
            <Ionicons name={revision.completee ? 'checkmark-done' : 'flash'} size={22} color={revision.completee ? colors.success : colors.white} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.revTitle, revision.completee && { color: colors.text }]}>
              {revision.completee ? 'Révision du jour terminée' : 'Révision du jour'}
            </Text>
            <Text style={[styles.revSub, revision.completee && { color: colors.textMuted }]}>
              {revision.completee
                ? `Série de ${revision.serie_revisions} jour(s) 🔥 Reviens demain !`
                : `${revision.nb_questions} questions · ${revision.serie_revisions} jour(s) de série`}
            </Text>
          </View>
          {!revision.completee && <Ionicons name="arrow-forward-circle" size={28} color={colors.white} />}
        </TouchableOpacity>
      )}

      {/* Stats */}
      <View style={styles.statsGrid}>
        <StatCard icon="trophy" label={t('dashboard.stat.score')} value={`${stats?.score_global ?? 0}`} unit="/100" color={colors.primary} />
        <StatCard icon="flash" label={t('dashboard.stat.xp')} value={`${stats?.points_gamification ?? 0}`} color={colors.amber} />
        <StatCard icon="documents" label={t('dashboard.stat.sessions')} value={`${stats?.total_sessions ?? 0}`} color={colors.violet} />
        <StatCard icon="checkmark-circle" label={t('dashboard.stat.success')} value={`${stats?.taux_reussite ?? 0}`} unit="%" color={colors.emerald} />
      </View>

      {/* Raccourcis — compacts */}
      <View style={styles.shortcuts}>
        <Shortcut icon="sparkles-outline" label="Révision IA" color={colors.violet} onPress={() => router.push('/revision')} />
        <Shortcut icon="timer-outline" label={t('dashboard.shortcut.focus')} color={colors.rose} onPress={() => router.push('/focus')} />
        <Shortcut icon="calendar-outline" label={t('dashboard.shortcut.planning')} color={colors.primary} onPress={() => router.push('/planning')} />
        <Shortcut icon="flask-outline" label={t('dashboard.shortcut.diagnostic')} color={colors.accent} onPress={() => router.push('/diagnostic')} />
      </View>

      {/* Cours récents */}
      {(data?.cours_recents?.length ?? 0) > 0 && (
        <Section title="Cours récents" onMore={() => router.push('/(tabs)/matieres')}>
          {data!.cours_recents.map((cours) => (
            <TouchableOpacity key={cours.id_cours} style={styles.listItem} onPress={() => router.push(`/cours/${cours.id_cours}`)}>
              <IconTile icon="book" tint={colors.primary} />
              <View style={styles.listItemContent}>
                <Text style={styles.listItemTitle} numberOfLines={1}>{cours.titre}</Text>
                <Text style={styles.listItemSub}>{cours.matiere_nom} · {cours.niveau}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textLight} />
            </TouchableOpacity>
          ))}
        </Section>
      )}

      {/* Lacunes */}
      {(data?.lacunes_actives?.length ?? 0) > 0 && (
        <Section title="Lacunes à travailler" accent={colors.danger} onMore={() => router.push('/revision')}>
          {data!.lacunes_actives.map((lacune) => (
            <TouchableOpacity key={lacune.id_lacune} style={styles.listItem} onPress={() => router.push('/revision')} activeOpacity={0.7}>
              <IconTile icon="alert-circle" tint={colors.danger} />
              <View style={styles.listItemContent}>
                <Text style={styles.listItemTitle} numberOfLines={1}>{lacune.notion}</Text>
                <Text style={styles.listItemSub}>{lacune.matiere_nom} · {lacune.taux_maitrise}%</Text>
                <View style={styles.masteryBar}>
                  <View style={[styles.masteryFill, { width: `${lacune.taux_maitrise}%` }]} />
                </View>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textLight} />
            </TouchableOpacity>
          ))}
        </Section>
      )}

      {/* Sessions */}
      {(data?.sessions_recentes?.length ?? 0) > 0 && (
        <Section title="Dernières sessions" onMore={() => router.push('/(tabs)/examens')}>
          {data!.sessions_recentes.map((session) => {
            const note = parseFloat(session.note_obtenue ?? '0');
            const ok = note >= 10;
            return (
              <View key={session.id_session} style={styles.listItem}>
                <IconTile icon={ok ? 'checkmark-circle' : 'close-circle'} tint={ok ? colors.success : colors.danger} />
                <View style={styles.listItemContent}>
                  <Text style={styles.listItemTitle} numberOfLines={1}>{session.epreuve_titre}</Text>
                  <Text style={styles.listItemSub}>{note.toFixed(1)} / 20</Text>
                </View>
              </View>
            );
          })}
        </Section>
      )}

      {/* Vide */}
      {isEmpty && (
        <View style={styles.emptyState}>
          <View style={styles.emptyIconWrap}><Ionicons name="rocket-outline" size={36} color={colors.primary} /></View>
          <Text style={styles.emptyTitle}>{t('dashboard.empty.title')}</Text>
          <Text style={styles.emptySub}>{t('dashboard.empty.sub')}</Text>
          <TouchableOpacity style={styles.emptyBtn} onPress={() => router.push('/(tabs)/examens')}>
            <Text style={styles.emptyBtnText}>Voir les épreuves</Text>
            <Ionicons name="arrow-forward" size={18} color={colors.white} />
          </TouchableOpacity>
        </View>
      )}

      <View style={{ height: 20 }} />
    </ScrollView>
  );
}

// ── Sous-composants ──

function Header({ prenom, subtitle, right }: { prenom?: string; subtitle: string; right?: React.ReactNode }) {
  const router = useRouter();
  const initial = (prenom?.[0] ?? '?').toUpperCase();
  const h = new Date().getHours();
  const salut = h < 5 ? 'Bonne nuit' : h < 12 ? 'Bonjour' : h < 18 ? 'Bon après-midi' : 'Bonsoir';
  return (
    <View style={styles.header}>
      <View style={styles.avatar}><Text style={styles.avatarText}>{initial}</Text></View>
      <View style={{ flex: 1 }}>
        <Text style={styles.greeting}>{salut}, {prenom} 👋</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
      </View>
      {right}
      <TouchableOpacity style={styles.bell} onPress={() => router.push('/notifications')} activeOpacity={0.7}>
        <Ionicons name="notifications-outline" size={20} color={colors.text} />
      </TouchableOpacity>
    </View>
  );
}

function StatCard({ icon, label, value, unit, color }: { icon: IconName; label: string; value: string; unit?: string; color: string }) {
  return (
    <View style={styles.statCard}>
      <View style={[styles.statIcon, { backgroundColor: `${color}15` }]}>
        <Ionicons name={icon} size={16} color={color} />
      </View>
      <Text style={styles.statValue}>{value}<Text style={styles.statUnit}>{unit}</Text></Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function Shortcut({ icon, label, color, onPress }: { icon: IconName; label: string; color: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.shortcut} onPress={onPress} activeOpacity={0.7}>
      <View style={[styles.shortcutIcon, { backgroundColor: `${color}15` }]}>
        <Ionicons name={icon} size={20} color={color} />
      </View>
      <Text style={styles.shortcutLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

function IconTile({ icon, tint }: { icon: IconName; tint: string }) {
  return (
    <View style={[styles.listItemIcon, { backgroundColor: `${tint}15` }]}>
      <Ionicons name={icon} size={18} color={tint} />
    </View>
  );
}

function RoleCard({ icon, title, sub, onPress }: { icon: IconName; title: string; sub: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.roleCard} onPress={onPress} activeOpacity={0.85}>
      <View style={styles.roleIcon}><Ionicons name={icon} size={26} color={colors.primary} /></View>
      <View style={{ flex: 1 }}>
        <Text style={styles.roleTitle}>{title}</Text>
        <Text style={styles.roleSub}>{sub}</Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color={colors.textLight} />
    </TouchableOpacity>
  );
}

function Section({ title, accent, onMore, children }: { title: string; accent?: string; onMore?: () => void; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, accent ? { color: accent } : null]}>{title}</Text>
        {onMore && <TouchableOpacity onPress={onMore}><Text style={styles.seeAll}>Voir tout</Text></TouchableOpacity>}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scroll: { paddingTop: 56, paddingBottom: 16 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.bg },

  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, marginBottom: 18 },
  avatar: { width: 44, height: 44, borderRadius: 14, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', ...shadow.md },
  avatarText: { color: colors.white, fontSize: 18, fontWeight: '800' },
  bell: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', ...shadow.sm },
  greeting: { fontSize: 19, fontWeight: '800', color: colors.text, letterSpacing: -0.3 },
  subtitle: { fontSize: 13, color: colors.textMuted, marginTop: 1 },
  verifyChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#FEF3C7', paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.full },
  verifyChipText: { fontSize: 11, fontWeight: '700', color: '#92400E' },

  streakChip: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginHorizontal: 20, backgroundColor: '#FFF7ED', borderWidth: 1, borderColor: '#FED7AA', paddingHorizontal: 12, paddingVertical: 7, borderRadius: radius.full, marginBottom: 16 },
  streakText: { fontSize: 13, fontWeight: '700', color: '#9A3412' },

  coachCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginHorizontal: 16, marginBottom: 14, backgroundColor: colors.surface, borderRadius: radius.lg, padding: 14, borderLeftWidth: 3, borderLeftColor: colors.primary, ...shadow.sm },
  coachIcon: { width: 36, height: 36, borderRadius: 12, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  coachLabel: { fontSize: 11, fontWeight: '800', color: colors.primary, textTransform: 'uppercase', letterSpacing: 0.5 },
  coachText: { fontSize: 13.5, color: colors.text, lineHeight: 19, marginTop: 3 },
  coachRefresh: { padding: 4 },

  revCard: { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 16, marginBottom: 14, backgroundColor: colors.primary, borderRadius: radius.lg, padding: 16, ...shadow.lg },
  revCardDone: { backgroundColor: colors.surface, ...shadow.sm },
  revIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  revTitle: { fontSize: 15, fontWeight: '800', color: colors.white },
  revSub: { fontSize: 12.5, color: '#E0E7FF', marginTop: 2, fontWeight: '600' },

  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16, justifyContent: 'space-between', rowGap: 10, marginBottom: 6 },
  statCard: { width: '48.5%', backgroundColor: colors.surface, borderRadius: radius.lg, padding: 14, borderWidth: 1, borderColor: colors.border, ...shadow.sm },
  statIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  statValue: { fontSize: 22, fontWeight: '800', color: colors.text, letterSpacing: -0.5 },
  statUnit: { fontSize: 13, fontWeight: '700', color: colors.textLight },
  statLabel: { fontSize: 12, color: colors.textMuted, fontWeight: '500', marginTop: 1 },

  shortcuts: { flexDirection: 'row', paddingHorizontal: 16, gap: 10, marginTop: 14, marginBottom: 2 },
  shortcut: { flex: 1, alignItems: 'center', gap: 6 },
  shortcutIcon: { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  shortcutLabel: { fontSize: 11, fontWeight: '600', color: colors.textMuted },

  section: { backgroundColor: colors.surface, marginHorizontal: 16, marginTop: 16, borderRadius: radius.lg, padding: 16, ...shadow.sm },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: colors.text, letterSpacing: -0.2 },
  seeAll: { fontSize: 13, color: colors.primary, fontWeight: '700' },
  listItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 9 },
  listItemIcon: { width: 38, height: 38, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  listItemContent: { flex: 1 },
  listItemTitle: { fontSize: 14, fontWeight: '700', color: colors.text },
  listItemSub: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  masteryBar: { height: 5, backgroundColor: colors.border, borderRadius: 3, overflow: 'hidden', marginTop: 7 },
  masteryFill: { height: '100%', borderRadius: 3, backgroundColor: colors.danger },

  roleCard: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: colors.surface, borderRadius: radius.lg, padding: 18, ...shadow.sm },
  roleIcon: { width: 52, height: 52, borderRadius: 16, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  roleTitle: { fontSize: 15, fontWeight: '800', color: colors.text },
  roleSub: { fontSize: 13, color: colors.textMuted, marginTop: 2 },

  emptyState: { alignItems: 'center', paddingVertical: 48, paddingHorizontal: 32 },
  emptyIconWrap: { width: 80, height: 80, borderRadius: 26, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  emptyTitle: { fontSize: 19, fontWeight: '800', color: colors.text, marginBottom: 8 },
  emptySub: { fontSize: 14, color: colors.textMuted, textAlign: 'center', marginBottom: 22, lineHeight: 21 },
  emptyBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: 13, paddingHorizontal: 22, ...shadow.lg },
  emptyBtnText: { color: colors.white, fontWeight: '800', fontSize: 15 },
});
