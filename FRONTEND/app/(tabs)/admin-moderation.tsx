import { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, RefreshControl,
  Modal, Pressable, TextInput, Alert,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '@/src/lib/api';
import { colors, radius, spacing, shadow, subjectColor, subjectIconName } from '@/src/theme';

interface ModItem {
  type: string; id: string; titre: string; matiere: string; code: string;
  niveau: string; auteur: string; has_pdf: boolean; date: string;
}

export default function AdminModerationScreen() {
  const [items, setItems] = useState<ModItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [reject, setReject] = useState<ModItem | null>(null);
  const [motif, setMotif] = useState('');

  const fetch = useCallback(async () => {
    try { const r = await api.get('/admin/moderation/'); setItems(r.data.results ?? []); } catch {}
  }, []);
  useFocusEffect(useCallback(() => { fetch().finally(() => setLoading(false)); }, [fetch]));
  const onRefresh = async () => { setRefreshing(true); await fetch(); setRefreshing(false); };

  const valider = async (it: ModItem) => {
    setBusyId(it.id);
    try { await api.post(`/admin/cours/${it.id}/valider/`); setItems((p) => p.filter((x) => x.id !== it.id)); }
    catch { Alert.alert('Erreur', 'Validation impossible.'); }
    finally { setBusyId(null); }
  };
  const confirmReject = async () => {
    if (!reject) return;
    const it = reject; setReject(null);
    setBusyId(it.id);
    try { await api.post(`/admin/cours/${it.id}/rejeter/`, { motif: motif.trim() }); setItems((p) => p.filter((x) => x.id !== it.id)); setMotif(''); }
    catch { Alert.alert('Erreur', 'Action impossible.'); }
    finally { setBusyId(null); }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Modération</Text>
        <Text style={styles.subtitle}>{items.length} contenu(s) en attente</Text>
      </View>

      {loading ? (
        <View style={styles.centered}><ActivityIndicator size="large" color={colors.primary} /></View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(i) => i.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          ListEmptyComponent={
            <View style={styles.centered}>
              <View style={styles.okIcon}><Ionicons name="checkmark-done" size={34} color={colors.success} /></View>
              <Text style={styles.empty}>Rien à modérer. Tout est à jour 🎉</Text>
            </View>
          }
          renderItem={({ item }) => {
            const tint = subjectColor(item.code);
            const busy = busyId === item.id;
            return (
              <View style={styles.card}>
                <View style={styles.cardTop}>
                  <View style={[styles.icon, { backgroundColor: `${tint}15` }]}>
                    <Ionicons name={subjectIconName(item.code)} size={20} color={tint} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardTitle} numberOfLines={2}>{item.titre}</Text>
                    <Text style={styles.cardSub}>{item.matiere} · {item.niveau} · par {item.auteur}</Text>
                    {item.has_pdf ? <View style={styles.pdfTag}><Ionicons name="document-text" size={11} color={colors.info} /><Text style={styles.pdfText}>PDF joint</Text></View> : null}
                  </View>
                </View>
                <View style={styles.actions}>
                  <TouchableOpacity style={[styles.btn, styles.reject]} disabled={busy} onPress={() => { setReject(item); setMotif(''); }} activeOpacity={0.85}>
                    <Ionicons name="close" size={16} color={colors.danger} /><Text style={[styles.btnText, { color: colors.danger }]}>Rejeter</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.btn, styles.approve]} disabled={busy} onPress={() => valider(item)} activeOpacity={0.85}>
                    {busy ? <ActivityIndicator size="small" color="#fff" /> : <><Ionicons name="checkmark" size={16} color="#fff" /><Text style={[styles.btnText, { color: '#fff' }]}>Publier</Text></>}
                  </TouchableOpacity>
                </View>
              </View>
            );
          }}
        />
      )}

      <Modal visible={!!reject} transparent animationType="fade" onRequestClose={() => setReject(null)}>
        <Pressable style={styles.backdrop} onPress={() => setReject(null)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.sheetTitle}>Rejeter ce cours</Text>
            <Text style={styles.sheetSub}>Le motif sera envoyé à l'enseignant. Le cours repasse en brouillon.</Text>
            <TextInput style={styles.input} placeholder="Motif (ex. contenu incomplet)…" placeholderTextColor={colors.textLight}
              value={motif} onChangeText={setMotif} multiline />
            <TouchableOpacity style={styles.confirmReject} onPress={confirmReject} activeOpacity={0.85}>
              <Text style={styles.confirmRejectText}>Confirmer le rejet</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setReject(null)} style={{ alignItems: 'center', paddingVertical: 10 }}>
              <Text style={{ color: colors.textMuted, fontWeight: '700' }}>Annuler</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', marginTop: 50, padding: spacing.xl },
  header: { paddingHorizontal: spacing.md, paddingTop: 56, paddingBottom: 6 },
  title: { fontSize: 28, fontWeight: '800', color: colors.text, letterSpacing: -0.5 },
  subtitle: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  list: { padding: spacing.md, paddingBottom: 32 },
  okIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: '#ECFDF5', justifyContent: 'center', alignItems: 'center', marginBottom: 14 },
  empty: { color: colors.textMuted, fontWeight: '600', textAlign: 'center' },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, borderWidth: 1, borderColor: colors.border, marginBottom: 12, ...shadow.sm },
  cardTop: { flexDirection: 'row', gap: 12 },
  icon: { width: 46, height: 46, borderRadius: radius.md, justifyContent: 'center', alignItems: 'center' },
  cardTitle: { fontSize: 15, fontWeight: '800', color: colors.text, lineHeight: 20 },
  cardSub: { fontSize: 12.5, color: colors.textMuted, marginTop: 3 },
  pdfTag: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', marginTop: 6, backgroundColor: `${colors.info}12`, paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.full },
  pdfText: { fontSize: 10.5, fontWeight: '800', color: colors.info },
  actions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  btn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: radius.md, paddingVertical: 11 },
  reject: { backgroundColor: '#FEF2F2', borderWidth: 1.5, borderColor: '#FCA5A5' },
  approve: { backgroundColor: colors.success },
  btnText: { fontSize: 14, fontWeight: '800' },
  backdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.lg, paddingBottom: 32 },
  sheetTitle: { fontSize: 18, fontWeight: '800', color: colors.text },
  sheetSub: { fontSize: 13, color: colors.textMuted, marginTop: 4, marginBottom: 14 },
  input: { backgroundColor: colors.surfaceAlt, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 14, fontSize: 15, color: colors.text, minHeight: 90, textAlignVertical: 'top' },
  confirmReject: { backgroundColor: colors.danger, borderRadius: radius.md, paddingVertical: 14, alignItems: 'center', marginTop: 16 },
  confirmRejectText: { color: '#fff', fontWeight: '800', fontSize: 15 },
});
