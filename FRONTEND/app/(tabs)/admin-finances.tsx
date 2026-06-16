import { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, RefreshControl,
  Modal, Pressable, Alert,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '@/src/lib/api';
import { GradientBox } from '@/src/components/GradientBox';
import { KpiCard } from '@/src/components/KpiCard';
import { MiniBarChart } from '@/src/components/MiniBarChart';
import { colors, radius, spacing, shadow } from '@/src/theme';

interface Abo { id_abonnement: string; email: string; formule: string; montant: number; periodicite: string; statut: string; date_expiration: string }
interface Paie { id_paiement: string; email: string; montant: number; methode_paiement: string; reference_transaction: string; statut: string; date_paiement: string | null }
interface Stats {
  revenu_total: number; revenu_30j: number; mrr: number; abonnements_actifs: number;
  paiements_en_attente: number; taux_confirmation: number;
  serie_revenus: { label: string; valeur: number }[];
}

const STATUT_COLOR: Record<string, string> = {
  actif: colors.success, confirme: colors.success, expire: colors.textMuted, resilie: colors.danger,
  suspendu: colors.warning, en_attente: colors.warning, echoue: colors.danger, rembourse: colors.violet,
};
const fmtMoney = (v: number) => v >= 1000 ? `${Math.round(v / 1000)}k` : `${v}`;

export default function AdminFinancesScreen() {
  const router = useRouter();
  const [tab, setTab] = useState<'abos' | 'paie'>('abos');
  const [stats, setStats] = useState<Stats | null>(null);
  const [abos, setAbos] = useState<Abo[]>([]);
  const [paies, setPaies] = useState<Paie[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [manage, setManage] = useState<Abo | null>(null);

  const fetch = useCallback(async () => {
    try {
      const [s, a, p] = await Promise.all([
        api.get('/admin/finances/stats/'),
        api.get('/admin/abonnements/', { params: { page_size: '50' } }),
        api.get('/admin/paiements/', { params: { page_size: '50' } }),
      ]);
      setStats(s.data); setAbos(a.data.results ?? []); setPaies(p.data.results ?? []);
    } catch {}
  }, []);
  useFocusEffect(useCallback(() => { fetch().finally(() => setLoading(false)); }, [fetch]));
  const onRefresh = async () => { setRefreshing(true); await fetch(); setRefreshing(false); };

  const payAction = async (p: Paie, act: 'confirmer' | 'rembourser') => {
    setBusy(p.id_paiement);
    try { const r = await api.post(`/admin/paiements/${p.id_paiement}/action/`, { action: act });
      setPaies((prev) => prev.map((x) => x.id_paiement === p.id_paiement ? { ...x, statut: r.data.statut } : x)); await fetch(); }
    catch { Alert.alert('Erreur', 'Action impossible.'); }
    finally { setBusy(null); }
  };

  const aboAction = async (body: Record<string, any>) => {
    if (!manage) return;
    const id = manage.id_abonnement; setManage(null); setBusy(id);
    try { const r = await api.patch(`/admin/abonnements/${id}/`, body);
      setAbos((prev) => prev.map((x) => x.id_abonnement === id ? r.data : x)); await fetch(); }
    catch { Alert.alert('Erreur', 'Modification impossible.'); }
    finally { setBusy(null); }
  };

  const confirmDelete = () => {
    if (!manage) return;
    const a = manage; setManage(null);
    Alert.alert('Supprimer cet abonnement ?', `${a.email}\nCette action est irréversible (les paiements liés seront aussi supprimés).`, [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: async () => {
        setBusy(a.id_abonnement);
        try { await api.delete(`/admin/abonnements/${a.id_abonnement}/`);
          setAbos((prev) => prev.filter((x) => x.id_abonnement !== a.id_abonnement)); await fetch(); }
        catch { Alert.alert('Erreur', 'Suppression impossible.'); }
        finally { setBusy(null); }
      } },
    ]);
  };

  const Header = (
    <View>
      <GradientBox colors={colors.gradientPrimary} style={styles.header}>
        <Text style={styles.title}>Finances</Text>
        <Text style={styles.headSub}>Revenus & abonnements</Text>
      </GradientBox>

      {/* Carte revenu flottante */}
      <View style={styles.revenueCard}>
        <View style={{ flex: 1 }}>
          <Text style={styles.revenueLabel}>Revenu total</Text>
          <Text style={styles.revenueValue}>
            {(stats?.revenu_total ?? 0).toLocaleString('fr-FR')}<Text style={styles.revenueUnit}> FCFA</Text>
          </Text>
        </View>
        <View style={styles.revenueDivider} />
        <View style={styles.revenue30}>
          <View style={styles.revenue30Pill}>
            <Ionicons name="trending-up" size={13} color={colors.success} />
            <Text style={styles.revenue30Value}>{fmtMoney(stats?.revenu_30j ?? 0)} F</Text>
          </View>
          <Text style={styles.revenue30Label}>sur 30 jours</Text>
        </View>
      </View>

      <View style={styles.body}>
        <View style={styles.grid}>
          <KpiCard icon="repeat" label="MRR (mensuel)" value={fmtMoney(stats?.mrr ?? 0)} suffix=" F" color={colors.primary} />
          <KpiCard icon="card" label="Abonnés actifs" value={stats?.abonnements_actifs ?? 0} color={colors.accent} />
          <KpiCard icon="checkmark-done" label="Taux paiement" value={`${stats?.taux_confirmation ?? 0}%`} color={colors.violet} />
          <KpiCard icon="hourglass" label="En attente" value={stats?.paiements_en_attente ?? 0} color={colors.warning} />
        </View>

        <Text style={styles.section}>Revenus (6 semaines)</Text>
        <MiniBarChart data={stats?.serie_revenus ?? []} hint="Revenus confirmés / semaine (FCFA)" color={colors.success} format={fmtMoney} />

        <View style={styles.seg}>
          <Seg label={`Abonnements (${abos.length})`} active={tab === 'abos'} onPress={() => setTab('abos')} />
          <Seg label={`Paiements (${paies.length})`} active={tab === 'paie'} onPress={() => setTab('paie')} />
        </View>

        {tab === 'abos' && (
          <TouchableOpacity style={styles.createBtn} activeOpacity={0.85}
            onPress={() => router.push('/admin/abonnement-form?mode=create' as any)}>
            <Ionicons name="add-circle" size={18} color={colors.primary} />
            <Text style={styles.createBtnText}>Nouvel abonnement</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );

  if (loading) return <View style={styles.centered}><ActivityIndicator size="large" color={colors.primary} /></View>;

  return (
    <View style={styles.container}>
      {tab === 'abos' ? (
        <FlatList
          data={abos} keyExtractor={(a) => a.id_abonnement} ListHeaderComponent={Header}
          contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          ListEmptyComponent={<Text style={styles.empty}>Aucun abonnement.</Text>}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.card} activeOpacity={0.85} onPress={() => setManage(item)} disabled={busy === item.id_abonnement}>
              <View style={{ flex: 1 }}>
                <Text style={styles.email} numberOfLines={1}>{item.email}</Text>
                <Text style={styles.sub}>{item.formule} · {item.periodicite} · exp. {fmt(item.date_expiration)}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.amount}>{item.montant.toLocaleString('fr-FR')} F</Text>
                <Badge statut={item.statut} />
              </View>
              {busy === item.id_abonnement ? <ActivityIndicator size="small" color={colors.primary} style={{ marginLeft: 8 }} />
                : <Ionicons name="ellipsis-vertical" size={18} color={colors.textLight} style={{ marginLeft: 6 }} />}
            </TouchableOpacity>
          )}
        />
      ) : (
        <FlatList
          data={paies} keyExtractor={(p) => p.id_paiement} ListHeaderComponent={Header}
          contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          ListEmptyComponent={<Text style={styles.empty}>Aucun paiement.</Text>}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={{ flex: 1 }}>
                <Text style={styles.email} numberOfLines={1}>{item.email}</Text>
                <Text style={styles.sub}>{methodLabel(item.methode_paiement)} · {item.reference_transaction}</Text>
                {item.statut === 'en_attente' && (
                  <View style={styles.payActions}>
                    <TouchableOpacity style={[styles.payBtn, { backgroundColor: colors.success }]} disabled={busy === item.id_paiement}
                      onPress={() => payAction(item, 'confirmer')} activeOpacity={0.85}>
                      {busy === item.id_paiement ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.payBtnText}>Confirmer</Text>}
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.payBtn, styles.refund]} disabled={busy === item.id_paiement}
                      onPress={() => payAction(item, 'rembourser')} activeOpacity={0.85}>
                      <Text style={[styles.payBtnText, { color: colors.violet }]}>Rembourser</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.amount}>{item.montant.toLocaleString('fr-FR')} F</Text>
                <Badge statut={item.statut} />
              </View>
            </View>
          )}
        />
      )}

      {/* Gestion d'un abonnement */}
      <Modal visible={!!manage} transparent animationType="fade" onRequestClose={() => setManage(null)}>
        <Pressable style={styles.backdrop} onPress={() => setManage(null)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle} numberOfLines={1}>{manage?.email}</Text>
            <Text style={styles.sheetSub}>{manage?.formule} · {manage?.periodicite} · {manage?.statut}</Text>

            {manage?.statut !== 'actif' && (
              <Act icon="play-circle-outline" color={colors.success} label="Réactiver" onPress={() => aboAction({ statut: 'actif' })} />
            )}
            {manage?.statut !== 'suspendu' && (
              <Act icon="pause-circle-outline" color={colors.warning} label="Suspendre" onPress={() => aboAction({ statut: 'suspendu' })} />
            )}
            <Act icon="time-outline" color={colors.primary} label="Prolonger de 30 jours" onPress={() => aboAction({ prolonger_jours: 30 })} />
            <Act icon="create-outline" color={colors.violet} label="Modifier (formule, montant…)" onPress={() => {
              const a = manage!; setManage(null);
              router.push(`/admin/abonnement-form?mode=edit&id=${a.id_abonnement}&email=${encodeURIComponent(a.email)}&formule=${a.formule}&periodicite=${a.periodicite}&montant=${a.montant}&statut=${a.statut}` as any);
            }} />
            {manage?.statut !== 'resilie' && (
              <Act icon="close-circle-outline" color={colors.danger} label="Résilier" onPress={() => aboAction({ statut: 'resilie' })} />
            )}
            <Act icon="trash-outline" color={colors.danger} label="Supprimer définitivement" onPress={confirmDelete} />
            <TouchableOpacity onPress={() => setManage(null)} style={styles.cancel}><Text style={styles.cancelText}>Annuler</Text></TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function Seg({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity style={[styles.segBtn, active && styles.segActive]} onPress={onPress} activeOpacity={0.8}>
      <Text style={[styles.segText, active && styles.segTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}
function Act({ icon, color, label, onPress }: { icon: any; color: string; label: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.act} onPress={onPress} activeOpacity={0.8}>
      <View style={[styles.actIcon, { backgroundColor: `${color}15` }]}><Ionicons name={icon} size={19} color={color} /></View>
      <Text style={styles.actLabel}>{label}</Text>
      <Ionicons name="chevron-forward" size={16} color={colors.textLight} />
    </TouchableOpacity>
  );
}
function Badge({ statut }: { statut: string }) {
  const c = STATUT_COLOR[statut] ?? colors.textMuted;
  return <View style={[styles.badge, { backgroundColor: `${c}1A` }]}><Text style={[styles.badgeText, { color: c }]}>{statut}</Text></View>;
}
function fmt(iso?: string | null) { return iso ? new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: '2-digit' }) : '—'; }
function methodLabel(m: string) { return ({ mtn_momo: 'MTN MoMo', orange_money: 'Orange Money', carte: 'Carte' } as Record<string, string>)[m] ?? m; }

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.bg },
  header: { paddingTop: 56, paddingBottom: 44, paddingHorizontal: spacing.lg, borderBottomLeftRadius: radius.xl, borderBottomRightRadius: radius.xl },
  title: { fontSize: 26, fontWeight: '800', color: '#fff', letterSpacing: -0.5 },
  headSub: { fontSize: 12.5, color: 'rgba(255,255,255,0.85)', marginTop: 4 },
  revenueCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, marginHorizontal: spacing.md, marginTop: -26, borderRadius: radius.lg, padding: spacing.md, ...shadow.md },
  revenueLabel: { fontSize: 12, fontWeight: '700', color: colors.textMuted },
  revenueValue: { fontSize: 24, fontWeight: '900', color: colors.text, letterSpacing: -0.6, marginTop: 2 },
  revenueUnit: { fontSize: 13, fontWeight: '700', color: colors.textMuted },
  revenueDivider: { width: 1, height: 40, backgroundColor: colors.border, marginHorizontal: 14 },
  revenue30: { alignItems: 'flex-end' },
  revenue30Pill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: `${colors.success}15`, paddingHorizontal: 9, paddingVertical: 4, borderRadius: radius.full },
  revenue30Value: { fontSize: 13.5, fontWeight: '800', color: colors.success },
  revenue30Label: { fontSize: 11, color: colors.textLight, fontWeight: '600', marginTop: 4 },
  body: { paddingHorizontal: spacing.md, paddingTop: spacing.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  section: { fontSize: 15, fontWeight: '800', color: colors.text, marginTop: 18, marginBottom: 10 },
  seg: { flexDirection: 'row', gap: 8, marginTop: 18 },
  segBtn: { flex: 1, paddingVertical: 9, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  segActive: { backgroundColor: colors.primaryLight, borderColor: colors.primary },
  segText: { fontSize: 13, fontWeight: '700', color: colors.textMuted },
  segTextActive: { color: colors.primary },
  createBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 10, paddingVertical: 11, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.primary, backgroundColor: colors.primaryLight },
  createBtnText: { color: colors.primary, fontWeight: '800', fontSize: 13.5 },
  list: { paddingHorizontal: spacing.md, paddingBottom: 32 },
  empty: { textAlign: 'center', color: colors.textMuted, marginTop: 20 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, borderWidth: 1, borderColor: colors.border, marginBottom: 10, ...shadow.sm },
  email: { fontSize: 14.5, fontWeight: '800', color: colors.text },
  sub: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  amount: { fontSize: 15, fontWeight: '800', color: colors.text },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.full, marginTop: 6 },
  badgeText: { fontSize: 10.5, fontWeight: '800' },
  payActions: { flexDirection: 'row', gap: 8, marginTop: 10 },
  payBtn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: radius.full },
  refund: { backgroundColor: `${colors.violet}15` },
  payBtnText: { fontSize: 12.5, fontWeight: '800', color: '#fff' },
  backdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.lg, paddingBottom: 32 },
  sheetHandle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.borderStrong, marginBottom: 14 },
  sheetTitle: { fontSize: 17, fontWeight: '800', color: colors.text },
  sheetSub: { fontSize: 12.5, color: colors.textMuted, marginTop: 2, marginBottom: 12, textTransform: 'capitalize' },
  act: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderTopWidth: 1, borderTopColor: colors.border },
  actIcon: { width: 38, height: 38, borderRadius: 11, justifyContent: 'center', alignItems: 'center' },
  actLabel: { flex: 1, fontSize: 14.5, fontWeight: '700', color: colors.text },
  cancel: { alignItems: 'center', paddingVertical: 12, marginTop: 6 },
  cancelText: { fontSize: 15, fontWeight: '700', color: colors.textMuted },
});
