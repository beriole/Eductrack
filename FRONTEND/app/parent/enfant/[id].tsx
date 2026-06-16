import { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl, Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '@/src/lib/api';
import { telechargerEtPartagerPdf } from '@/src/lib/pdfShare';
import { GradientBox } from '@/src/components/GradientBox';
import { colors, radius, spacing, shadow, subjectColor } from '@/src/theme';

type IconName = keyof typeof Ionicons.glyphMap;

interface Suivi {
  enfant: {
    prenom: string; nom: string; niveau_scolaire: string; serie: string | null;
    region: string; etablissement: string | null; score_global: number;
    streak_jours: number; points_gamification: number;
    derniere_activite: string | null; jours_inactif: number | null;
  };
  kpis: {
    moyenne: number | null; moyenne_delta: number | null; taux_reussite: number;
    temps_etude_min: number; jours_actifs: number; nb_sessions: number;
  };
  progression: { label: string; moyenne: number | null; nb_sessions: number }[];
  par_matiere: { matiere: string; code: string; moyenne: number | null; nb_sessions: number; maitrise: string }[];
  lacunes: { notion: string; chapitre: string; matiere: string; code: string; taux_maitrise: number; statut: string }[];
  activite_recente: { titre: string; matiere: string; code: string; mode: string; note: number | null; date: string | null }[];
  badges_recents: { nom: string; categorie: string; date: string }[];
  alertes: { niveau: string; icone: string; texte: string }[];
  conseils: string[];
}

const MAITRISE: Record<string, { color: string; label: string }> = {
  fort: { color: colors.success, label: 'Maîtrisé' },
  moyen: { color: colors.warning, label: 'Moyen' },
  faible: { color: colors.danger, label: 'Fragile' },
  inconnu: { color: colors.textLight, label: '—' },
};
const ALERTE_COLOR: Record<string, string> = {
  danger: colors.danger, warning: colors.warning, info: colors.info,
};

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
}

export default function EnfantSuiviScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [data, setData] = useState<Suivi | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [sharing, setSharing] = useState(false);

  const fetch = async () => {
    try {
      const r = await api.get(`/parents/enfants/${id}/suivi/`);
      setData(r.data); setError(false);
    } catch { setError(true); }
  };
  useEffect(() => { fetch().finally(() => setLoading(false)); }, [id]);
  const onRefresh = async () => { setRefreshing(true); await fetch(); setRefreshing(false); };

  const genererRapport = async () => {
    setGenerating(true);
    try {
      const r = await api.post('/parents/rapports/generer/', { enfant_id: id });
      const rp = r.data.rapport;
      Alert.alert('Rapport généré',
        `Période : 7 derniers jours\nMoyenne : ${rp.moyenne_globale ?? '—'}/20\nSessions : ${rp.nb_sessions}\nTemps d'étude : ${rp.temps_etude_total} min`);
    } catch (e: any) {
      Alert.alert('Info', e?.response?.data?.message ?? 'Erreur lors de la génération.');
    } finally { setGenerating(false); }
  };

  const partagerRapport = async () => {
    if (!data) return;
    setSharing(true);
    try {
      // S'assure qu'un rapport existe (génère, sinon récupère le plus récent).
      let rid: string | null = null;
      try {
        const g = await api.post('/parents/rapports/generer/', { enfant_id: id });
        rid = g.data.rapport?.id_rapport ?? null;
      } catch { /* déjà généré aujourd'hui → on prend le dernier */ }
      if (!rid) {
        const list = await api.get('/parents/rapports/', { params: { enfant_id: id } });
        const arr = list.data.results ?? list.data;
        rid = arr?.[0]?.id_rapport ?? null;
      }
      if (!rid) { Alert.alert('Info', 'Aucun rapport disponible.'); return; }
      const fn = `rapport_${data.enfant.prenom}_${data.enfant.nom}.pdf`;
      await telechargerEtPartagerPdf(`/parents/rapports/${rid}/pdf/`, fn);
    } finally { setSharing(false); }
  };

  if (loading) return <View style={styles.centered}><ActivityIndicator size="large" color={colors.primary} /></View>;
  if (error || !data) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errText}>Suivi indisponible.</Text>
        <TouchableOpacity onPress={() => router.back()} style={styles.backLink}><Text style={styles.backLinkText}>Retour</Text></TouchableOpacity>
      </View>
    );
  }

  const { enfant, kpis, progression, par_matiere, lacunes, activite_recente, badges_recents, alertes, conseils } = data;
  const presence = enfant.jours_inactif === null ? 'Jamais actif'
    : enfant.jours_inactif === 0 ? "Actif aujourd'hui"
    : `Vu il y a ${enfant.jours_inactif} j`;
  const presenceOk = enfant.jours_inactif !== null && enfant.jours_inactif <= 2;
  const maxMoy = Math.max(20, ...progression.map((p) => p.moyenne ?? 0));

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}>

        {/* En-tête */}
        <GradientBox colors={colors.gradientPrimary} style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backRow}>
            <Ionicons name="arrow-back" size={18} color="rgba(255,255,255,0.9)" />
            <Text style={styles.backText}>Retour</Text>
          </TouchableOpacity>
          <View style={styles.headerRow}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{(enfant.prenom?.[0] ?? '') + (enfant.nom?.[0] ?? '')}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{enfant.prenom} {enfant.nom}</Text>
              <Text style={styles.sub}>
                {enfant.niveau_scolaire}{enfant.serie ? ` · ${enfant.serie}` : ''}{enfant.etablissement ? ` · ${enfant.etablissement}` : ''}
              </Text>
              <View style={[styles.presence, { backgroundColor: presenceOk ? 'rgba(255,255,255,0.22)' : 'rgba(239,68,68,0.3)' }]}>
                <Ionicons name={presenceOk ? 'ellipse' : 'time-outline'} size={10} color="#fff" />
                <Text style={styles.presenceText}>{presence}</Text>
              </View>
            </View>
          </View>
        </GradientBox>

        <View style={styles.body}>
          {/* Alertes */}
          {alertes.length > 0 && (
            <View style={styles.section}>
              {alertes.map((a, i) => (
                <View key={i} style={[styles.alerte, { borderLeftColor: ALERTE_COLOR[a.niveau] ?? colors.info }]}>
                  <Ionicons name={a.icone as IconName} size={18} color={ALERTE_COLOR[a.niveau] ?? colors.info} />
                  <Text style={styles.alerteText}>{a.texte}</Text>
                </View>
              ))}
            </View>
          )}

          {/* KPIs */}
          <Text style={styles.sectionTitle}>Cette semaine</Text>
          <View style={styles.kpiGrid}>
            <Kpi icon="school-outline" label="Moyenne" value={kpis.moyenne != null ? `${kpis.moyenne}/20` : '—'}
              delta={kpis.moyenne_delta} color={colors.primary} />
            <Kpi icon="checkmark-done-outline" label="Réussite" value={`${kpis.taux_reussite}%`} color={colors.success} />
            <Kpi icon="time-outline" label="Temps d'étude" value={`${kpis.temps_etude_min} min`} color={colors.violet} />
            <Kpi icon="calendar-outline" label="Jours actifs" value={`${kpis.jours_actifs}/7`} color={colors.accent} />
          </View>

          {/* Progression */}
          <Text style={styles.sectionTitle}>Progression (6 semaines)</Text>
          <View style={styles.card}>
            <View style={styles.chart}>
              {progression.map((p, i) => {
                const h = p.moyenne != null ? Math.max(4, (p.moyenne / maxMoy) * 90) : 2;
                const col = p.moyenne == null ? colors.border
                  : p.moyenne >= 14 ? colors.success : p.moyenne >= 10 ? colors.warning : colors.danger;
                return (
                  <View key={i} style={styles.chartCol}>
                    <Text style={styles.chartVal}>{p.moyenne ?? ''}</Text>
                    <View style={[styles.bar, { height: h, backgroundColor: col }]} />
                    <Text style={styles.chartLabel}>{p.label}</Text>
                  </View>
                );
              })}
            </View>
            <Text style={styles.chartHint}>Moyenne /20 par semaine</Text>
          </View>

          {/* Par matière */}
          <Text style={styles.sectionTitle}>Par matière</Text>
          <View style={styles.card}>
            {par_matiere.length === 0 ? <Text style={styles.empty}>Pas encore de résultats.</Text> :
              par_matiere.map((m, i) => {
                const mt = MAITRISE[m.maitrise] ?? MAITRISE.inconnu;
                const tint = subjectColor(m.code);
                return (
                  <View key={i} style={[styles.matRow, i > 0 && styles.divider]}>
                    <View style={[styles.matDot, { backgroundColor: tint }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.matName}>{m.matiere}</Text>
                      <Text style={styles.matSub}>{m.nb_sessions} session{m.nb_sessions > 1 ? 's' : ''}</Text>
                    </View>
                    <Text style={[styles.matMoy, { color: mt.color }]}>{m.moyenne != null ? `${m.moyenne}/20` : '—'}</Text>
                    <View style={[styles.matBadge, { backgroundColor: `${mt.color}15` }]}>
                      <Text style={[styles.matBadgeText, { color: mt.color }]}>{mt.label}</Text>
                    </View>
                  </View>
                );
              })}
          </View>

          {/* Lacunes */}
          <Text style={styles.sectionTitle}>Points à renforcer</Text>
          <View style={styles.card}>
            {lacunes.length === 0 ? <Text style={styles.empty}>Aucune lacune détectée 🎉</Text> :
              lacunes.map((l, i) => (
                <View key={i} style={[styles.lacRow, i > 0 && styles.divider]}>
                  <Ionicons name="alert-circle" size={18} color={colors.danger} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.lacNotion}>{l.notion}</Text>
                    <Text style={styles.lacSub}>{l.matiere}{l.chapitre ? ` · ${l.chapitre}` : ''}</Text>
                  </View>
                  <Text style={styles.lacTaux}>{l.taux_maitrise}%</Text>
                </View>
              ))}
          </View>

          {/* Activité récente */}
          <Text style={styles.sectionTitle}>Activité récente</Text>
          <View style={styles.card}>
            {activite_recente.length === 0 ? <Text style={styles.empty}>Aucune activité.</Text> :
              activite_recente.map((a, i) => {
                const tint = subjectColor(a.code);
                const noteCol = a.note == null ? colors.textLight : a.note >= 10 ? colors.success : colors.danger;
                return (
                  <View key={i} style={[styles.actRow, i > 0 && styles.divider]}>
                    <View style={[styles.actDot, { backgroundColor: `${tint}15` }]}>
                      <Ionicons name="document-text-outline" size={15} color={tint} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.actTitre} numberOfLines={1}>{a.titre}</Text>
                      <Text style={styles.actSub}>{a.matiere} · {formatDate(a.date)}</Text>
                    </View>
                    <Text style={[styles.actNote, { color: noteCol }]}>{a.note != null ? `${a.note}/20` : '—'}</Text>
                  </View>
                );
              })}
          </View>

          {/* Badges */}
          {badges_recents.length > 0 && (
            <>
              <Text style={styles.sectionTitle}>Récompenses récentes</Text>
              <View style={styles.badgeRow}>
                {badges_recents.map((b, i) => (
                  <View key={i} style={styles.badge}>
                    <Ionicons name="trophy" size={18} color={colors.amber} />
                    <Text style={styles.badgeName} numberOfLines={2}>{b.nom}</Text>
                  </View>
                ))}
              </View>
            </>
          )}

          {/* Conseils */}
          <Text style={styles.sectionTitle}>Conseils pour vous</Text>
          <View style={[styles.card, { backgroundColor: colors.primaryLight, borderColor: colors.primaryLight }]}>
            {conseils.map((c, i) => (
              <View key={i} style={styles.conseilRow}>
                <Ionicons name="bulb-outline" size={17} color={colors.primary} />
                <Text style={styles.conseilText}>{c}</Text>
              </View>
            ))}
          </View>

          {/* Rapport */}
          <Text style={styles.sectionTitle}>Rapport hebdomadaire</Text>
          <View style={styles.rapportRow}>
            <TouchableOpacity style={[styles.rapportBtn, styles.rapportOutline]} onPress={genererRapport} disabled={generating} activeOpacity={0.85}>
              {generating ? <ActivityIndicator color={colors.primary} size="small" /> :
                <><Ionicons name="eye-outline" size={17} color={colors.primary} /><Text style={[styles.rapportText, { color: colors.primary }]}>Résumé</Text></>}
            </TouchableOpacity>
            <TouchableOpacity style={[styles.rapportBtn, styles.rapportPrimary]} onPress={partagerRapport} disabled={sharing} activeOpacity={0.85}>
              {sharing ? <ActivityIndicator color={colors.white} size="small" /> :
                <><Ionicons name="share-social-outline" size={17} color={colors.white} /><Text style={styles.rapportText}>Partager le PDF</Text></>}
            </TouchableOpacity>
          </View>

          <View style={{ height: 32 }} />
        </View>
      </ScrollView>
    </View>
  );
}

function Kpi({ icon, label, value, color, delta }: { icon: IconName; label: string; value: string; color: string; delta?: number | null }) {
  const up = delta != null && delta > 0;
  const down = delta != null && delta < 0;
  return (
    <View style={styles.kpi}>
      <View style={[styles.kpiIcon, { backgroundColor: `${color}15` }]}><Ionicons name={icon} size={18} color={color} /></View>
      <Text style={styles.kpiValue}>{value}</Text>
      <View style={styles.kpiLabelRow}>
        <Text style={styles.kpiLabel}>{label}</Text>
        {delta != null && delta !== 0 ? (
          <View style={styles.kpiDelta}>
            <Ionicons name={up ? 'arrow-up' : 'arrow-down'} size={11} color={up ? colors.success : colors.danger} />
            <Text style={[styles.kpiDeltaText, { color: up ? colors.success : colors.danger }]}>{Math.abs(delta)}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.bg, padding: spacing.lg },
  errText: { color: colors.danger, fontSize: 16, marginBottom: 12 },
  backLink: { padding: 8 }, backLinkText: { color: colors.primary, fontWeight: '700' },

  header: { paddingTop: 56, paddingBottom: 22, paddingHorizontal: spacing.lg, borderBottomLeftRadius: radius.xl, borderBottomRightRadius: radius.xl },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 14 },
  backText: { color: 'rgba(255,255,255,0.9)', fontSize: 14, fontWeight: '600' },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatar: { width: 60, height: 60, borderRadius: 30, backgroundColor: 'rgba(255,255,255,0.25)', justifyContent: 'center', alignItems: 'center' },
  avatarText: { fontSize: 22, fontWeight: '900', color: colors.white },
  name: { fontSize: 22, fontWeight: '800', color: colors.white, letterSpacing: -0.4 },
  sub: { fontSize: 12.5, color: 'rgba(255,255,255,0.85)', marginTop: 2 },
  presence: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', marginTop: 8, paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.full },
  presenceText: { color: colors.white, fontSize: 11.5, fontWeight: '700' },

  body: { padding: spacing.md },
  section: { marginBottom: 4 },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: colors.text, marginTop: 18, marginBottom: 10, letterSpacing: -0.2 },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, borderWidth: 1, borderColor: colors.border, ...shadow.sm },
  empty: { color: colors.textMuted, fontSize: 13, textAlign: 'center', paddingVertical: 8 },

  alerte: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.surface, borderRadius: radius.md, borderLeftWidth: 4, padding: 12, marginBottom: 8, ...shadow.sm },
  alerteText: { flex: 1, fontSize: 13.5, fontWeight: '600', color: colors.text },

  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  kpi: { width: '47.5%', flexGrow: 1, backgroundColor: colors.surface, borderRadius: radius.lg, padding: 14, borderWidth: 1, borderColor: colors.border, ...shadow.sm },
  kpiIcon: { width: 34, height: 34, borderRadius: 10, justifyContent: 'center', alignItems: 'center', marginBottom: 10 },
  kpiValue: { fontSize: 20, fontWeight: '800', color: colors.text, letterSpacing: -0.5 },
  kpiLabelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 },
  kpiLabel: { fontSize: 12, color: colors.textMuted, fontWeight: '600' },
  kpiDelta: { flexDirection: 'row', alignItems: 'center', gap: 1 },
  kpiDeltaText: { fontSize: 11.5, fontWeight: '800' },

  chart: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', height: 120, paddingTop: 8 },
  chartCol: { flex: 1, alignItems: 'center', justifyContent: 'flex-end' },
  bar: { width: 22, borderRadius: 6, marginTop: 4 },
  chartVal: { fontSize: 10, fontWeight: '700', color: colors.textMuted, height: 14 },
  chartLabel: { fontSize: 10, color: colors.textLight, marginTop: 6, fontWeight: '600' },
  chartHint: { fontSize: 11.5, color: colors.textLight, textAlign: 'center', marginTop: 10 },

  matRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  divider: { borderTopWidth: 1, borderTopColor: colors.border },
  matDot: { width: 10, height: 10, borderRadius: 5 },
  matName: { fontSize: 14, fontWeight: '700', color: colors.text },
  matSub: { fontSize: 11.5, color: colors.textLight, marginTop: 1 },
  matMoy: { fontSize: 14, fontWeight: '800' },
  matBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.full, minWidth: 64, alignItems: 'center' },
  matBadgeText: { fontSize: 10.5, fontWeight: '800' },

  lacRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  lacNotion: { fontSize: 14, fontWeight: '700', color: colors.text },
  lacSub: { fontSize: 11.5, color: colors.textMuted, marginTop: 1 },
  lacTaux: { fontSize: 14, fontWeight: '800', color: colors.danger },

  actRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  actDot: { width: 32, height: 32, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  actTitre: { fontSize: 13.5, fontWeight: '700', color: colors.text },
  actSub: { fontSize: 11.5, color: colors.textMuted, marginTop: 1 },
  actNote: { fontSize: 14, fontWeight: '800' },

  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  badge: { width: '47.5%', flexGrow: 1, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.surface, borderRadius: radius.md, padding: 12, borderWidth: 1, borderColor: colors.border },
  badgeName: { flex: 1, fontSize: 12.5, fontWeight: '700', color: colors.text },

  conseilRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 6 },
  conseilText: { flex: 1, fontSize: 13.5, color: colors.text, fontWeight: '600', lineHeight: 19 },

  rapportRow: { flexDirection: 'row', gap: 10 },
  rapportBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: radius.md, paddingVertical: 15 },
  rapportPrimary: { backgroundColor: colors.primary, ...shadow.md },
  rapportOutline: { backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.primary },
  rapportText: { color: colors.white, fontWeight: '800', fontSize: 14.5 },
});
