import { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '@/src/lib/api';
import { useAuthStore } from '@/src/store/authStore';
import { GradientBox } from '@/src/components/GradientBox';
import { KpiCard } from '@/src/components/KpiCard';
import { MiniBarChart } from '@/src/components/MiniBarChart';
import { colors, radius, spacing, shadow } from '@/src/theme';

type IconName = keyof typeof Ionicons.glyphMap;

interface Overview {
  utilisateurs: { total: number; eleves: number; parents: number; enseignants: number; admins: number; nouveaux_7j: number; nouveaux_30j: number; actifs_7j: number };
  finances: { revenu_total: number; revenu_30j: number; abonnements_actifs: number; paiements_en_attente: number };
  contenu: { sessions_total: number; moderation_attente: number; cours_par_statut: Record<string, number>; epreuves_par_statut: Record<string, number> };
  series: { inscriptions: { label: string; valeur: number }[]; revenus: { label: string; valeur: number }[] };
}

const fmtMoney = (v: number) => v >= 1000 ? `${Math.round(v / 1000)}k` : `${v}`;

export function AdminHome() {
  const router = useRouter();
  const { user } = useAuthStore();
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetch = useCallback(async () => {
    try { const r = await api.get('/admin/overview/'); setData(r.data); } catch {}
  }, []);
  useFocusEffect(useCallback(() => { fetch().finally(() => setLoading(false)); }, [fetch]));
  const onRefresh = async () => { setRefreshing(true); await fetch(); setRefreshing(false); };

  if (loading) return <View style={styles.centered}><ActivityIndicator size="large" color={colors.primary} /></View>;

  const u = data?.utilisateurs;
  const f = data?.finances;
  const c = data?.contenu;

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}>

      <GradientBox colors={colors.gradientPrimary} style={styles.header}>
        <View style={styles.badge}><Ionicons name="shield-checkmark" size={13} color="#fff" /><Text style={styles.badgeText}>SUPER-ADMIN</Text></View>
        <Text style={styles.hello}>Bonjour {user?.prenom || 'Admin'}</Text>
        <Text style={styles.sub}>Pilotage de la plateforme SmartSchool</Text>
      </GradientBox>

      <View style={styles.body}>
        {/* Modération en attente — bandeau d'action */}
        {c && c.moderation_attente > 0 && (
          <TouchableOpacity style={styles.alertBanner} activeOpacity={0.85} onPress={() => router.push('/(tabs)/admin-moderation' as any)}>
            <Ionicons name="shield-half-outline" size={20} color={colors.warning} />
            <Text style={styles.alertText}>{c.moderation_attente} contenu(s) en attente de modération</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.warning} />
          </TouchableOpacity>
        )}

        {/* Utilisateurs */}
        <Text style={styles.section}>Utilisateurs</Text>
        <View style={styles.grid}>
          <KpiCard icon="people" label="Total" value={u?.total ?? 0} color={colors.primary} delta={u?.nouveaux_7j} />
          <KpiCard icon="school" label="Élèves" value={u?.eleves ?? 0} color={colors.accent} />
          <KpiCard icon="person" label="Enseignants" value={u?.enseignants ?? 0} color={colors.violet} />
          <KpiCard icon="pulse" label="Actifs (7j)" value={u?.actifs_7j ?? 0} color={colors.success} />
        </View>

        <Text style={styles.section}>Nouvelles inscriptions (6 sem.)</Text>
        <MiniBarChart data={data?.series.inscriptions ?? []} hint="Inscriptions par semaine" color={colors.primary} />

        {/* Finances */}
        <Text style={styles.section}>Finances</Text>
        <View style={styles.grid}>
          <KpiCard icon="cash" label="Revenu total" value={fmtMoney(f?.revenu_total ?? 0)} suffix=" F" color={colors.success} />
          <KpiCard icon="trending-up" label="Revenu (30j)" value={fmtMoney(f?.revenu_30j ?? 0)} suffix=" F" color={colors.emerald} />
          <KpiCard icon="card" label="Abonnés actifs" value={f?.abonnements_actifs ?? 0} color={colors.primary} />
          <KpiCard icon="hourglass" label="Paiements en attente" value={f?.paiements_en_attente ?? 0} color={colors.warning} />
        </View>

        {/* Contenu */}
        <Text style={styles.section}>Contenu & activité</Text>
        <View style={styles.grid}>
          <KpiCard icon="library" label="Cours publiés" value={c?.cours_par_statut?.publie ?? 0} color={colors.accent} />
          <KpiCard icon="documents" label="Épreuves actives" value={c?.epreuves_par_statut?.actif ?? 0} color={colors.violet} />
          <KpiCard icon="checkbox" label="Sessions passées" value={c?.sessions_total ?? 0} color={colors.primary} />
          <KpiCard icon="shield-half" label="À modérer" value={c?.moderation_attente ?? 0} color={colors.warning} />
        </View>

        {/* Accès rapides */}
        <Text style={styles.section}>Gestion</Text>
        <View style={styles.linksGrid}>
          <QuickLink icon="people-outline" label="Utilisateurs" onPress={() => router.push('/(tabs)/admin-users' as any)} />
          <QuickLink icon="shield-checkmark-outline" label="Modération" onPress={() => router.push('/(tabs)/admin-moderation' as any)} />
          <QuickLink icon="cash-outline" label="Finances" onPress={() => router.push('/(tabs)/admin-finances' as any)} />
          <QuickLink icon="wallet-outline" label="Rémunérations" onPress={() => router.push('/admin/remunerations' as any)} />
          <QuickLink icon="megaphone-outline" label="Diffusion" onPress={() => router.push('/admin/broadcast' as any)} />
          <QuickLink icon="construct-outline" label="Plateforme" onPress={() => router.push('/admin/plateforme' as any)} />
          <QuickLink icon="receipt-outline" label="Journal d'audit" onPress={() => router.push('/admin/audit' as any)} />
        </View>

        <View style={{ height: 32 }} />
      </View>
    </ScrollView>
  );
}

function QuickLink({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.link} activeOpacity={0.85} onPress={onPress}>
      <View style={styles.linkIcon}><Ionicons name={icon} size={22} color={colors.primary} /></View>
      <Text style={styles.linkLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.bg },
  header: { paddingTop: 56, paddingBottom: 24, paddingHorizontal: spacing.lg, borderBottomLeftRadius: radius.xl, borderBottomRightRadius: radius.xl },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', backgroundColor: 'rgba(255,255,255,0.22)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.full, marginBottom: 10 },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  hello: { fontSize: 24, fontWeight: '800', color: '#fff', letterSpacing: -0.4 },
  sub: { fontSize: 13, color: 'rgba(255,255,255,0.85)', marginTop: 2 },
  body: { padding: spacing.md },
  alertBanner: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: '#FDE68A', borderRadius: radius.md, padding: 14, marginBottom: 6 },
  alertText: { flex: 1, fontSize: 13.5, fontWeight: '700', color: '#92400E' },
  section: { fontSize: 15, fontWeight: '800', color: colors.text, marginTop: 18, marginBottom: 10, letterSpacing: -0.2 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  linksGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  link: { width: '31%', flexGrow: 1, alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.lg, paddingVertical: 16, borderWidth: 1, borderColor: colors.border, ...shadow.sm },
  linkIcon: { width: 44, height: 44, borderRadius: 13, backgroundColor: colors.primaryLight, justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
  linkLabel: { fontSize: 12.5, fontWeight: '700', color: colors.text },
});
