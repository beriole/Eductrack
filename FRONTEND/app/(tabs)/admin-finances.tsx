import { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, RefreshControl, Alert,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '@/src/lib/api';
import { colors, radius, spacing, shadow } from '@/src/theme';

interface Abo { id_abonnement: string; email: string; formule: string; montant: number; periodicite: string; statut: string; date_expiration: string }
interface Paie { id_paiement: string; email: string; montant: number; methode_paiement: string; reference_transaction: string; statut: string; date_paiement: string | null }

const STATUT_COLOR: Record<string, string> = {
  actif: colors.success, confirme: colors.success, expire: colors.textMuted, resilie: colors.danger,
  suspendu: colors.warning, en_attente: colors.warning, echoue: colors.danger, rembourse: colors.violet,
};

export default function AdminFinancesScreen() {
  const [tab, setTab] = useState<'abos' | 'paie'>('abos');
  const [abos, setAbos] = useState<Abo[]>([]);
  const [paies, setPaies] = useState<Paie[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    try {
      const [a, p] = await Promise.all([
        api.get('/admin/abonnements/', { params: { page_size: '50' } }),
        api.get('/admin/paiements/', { params: { page_size: '50' } }),
      ]);
      setAbos(a.data.results ?? []); setPaies(p.data.results ?? []);
    } catch {}
  }, []);
  useFocusEffect(useCallback(() => { fetch().finally(() => setLoading(false)); }, [fetch]));
  const onRefresh = async () => { setRefreshing(true); await fetch(); setRefreshing(false); };

  const action = async (p: Paie, act: 'confirmer' | 'rembourser') => {
    setBusy(p.id_paiement);
    try { const r = await api.post(`/admin/paiements/${p.id_paiement}/action/`, { action: act });
      setPaies((prev) => prev.map((x) => x.id_paiement === p.id_paiement ? { ...x, statut: r.data.statut } : x)); }
    catch { Alert.alert('Erreur', 'Action impossible.'); }
    finally { setBusy(null); }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Finances</Text>
      </View>
      <View style={styles.seg}>
        <Seg label={`Abonnements (${abos.length})`} active={tab === 'abos'} onPress={() => setTab('abos')} />
        <Seg label={`Paiements (${paies.length})`} active={tab === 'paie'} onPress={() => setTab('paie')} />
      </View>

      {loading ? (
        <View style={styles.centered}><ActivityIndicator size="large" color={colors.primary} /></View>
      ) : tab === 'abos' ? (
        <FlatList
          data={abos} keyExtractor={(a) => a.id_abonnement} contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          ListEmptyComponent={<Text style={styles.empty}>Aucun abonnement.</Text>}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={{ flex: 1 }}>
                <Text style={styles.email} numberOfLines={1}>{item.email}</Text>
                <Text style={styles.sub}>{item.formule} · {item.periodicite} · exp. {fmt(item.date_expiration)}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.amount}>{item.montant.toLocaleString('fr-FR')} F</Text>
                <Badge statut={item.statut} />
              </View>
            </View>
          )}
        />
      ) : (
        <FlatList
          data={paies} keyExtractor={(p) => p.id_paiement} contentContainerStyle={styles.list}
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
                      onPress={() => action(item, 'confirmer')} activeOpacity={0.85}>
                      {busy === item.id_paiement ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.payBtnText}>Confirmer</Text>}
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.payBtn, styles.refund]} disabled={busy === item.id_paiement}
                      onPress={() => action(item, 'rembourser')} activeOpacity={0.85}>
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
function Badge({ statut }: { statut: string }) {
  const c = STATUT_COLOR[statut] ?? colors.textMuted;
  return <View style={[styles.badge, { backgroundColor: `${c}1A` }]}><Text style={[styles.badgeText, { color: c }]}>{statut}</Text></View>;
}
function fmt(iso?: string | null) { return iso ? new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: '2-digit' }) : '—'; }
function methodLabel(m: string) { return ({ mtn_momo: 'MTN MoMo', orange_money: 'Orange Money', carte: 'Carte' } as Record<string, string>)[m] ?? m; }

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', marginTop: 40 },
  header: { paddingHorizontal: spacing.md, paddingTop: 56, paddingBottom: 6 },
  title: { fontSize: 28, fontWeight: '800', color: colors.text, letterSpacing: -0.5 },
  seg: { flexDirection: 'row', gap: 8, paddingHorizontal: spacing.md, paddingVertical: 10 },
  segBtn: { flex: 1, paddingVertical: 9, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  segActive: { backgroundColor: colors.primaryLight, borderColor: colors.primary },
  segText: { fontSize: 13, fontWeight: '700', color: colors.textMuted },
  segTextActive: { color: colors.primary },
  list: { padding: spacing.md, paddingBottom: 32 },
  empty: { textAlign: 'center', color: colors.textMuted, marginTop: 40 },
  card: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, borderWidth: 1, borderColor: colors.border, marginBottom: 10, ...shadow.sm },
  email: { fontSize: 14.5, fontWeight: '800', color: colors.text },
  sub: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  amount: { fontSize: 15, fontWeight: '800', color: colors.text },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.full, marginTop: 6 },
  badgeText: { fontSize: 10.5, fontWeight: '800' },
  payActions: { flexDirection: 'row', gap: 8, marginTop: 10 },
  payBtn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: radius.full },
  refund: { backgroundColor: `${colors.violet}15` },
  payBtnText: { fontSize: 12.5, fontWeight: '800', color: '#fff' },
});
