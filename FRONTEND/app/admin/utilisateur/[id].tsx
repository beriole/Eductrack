import { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '@/src/lib/api';
import { GradientBox } from '@/src/components/GradientBox';
import { colors, radius, spacing, shadow } from '@/src/theme';

interface Detail {
  id_utilisateur: string; nom: string; prenom: string; email: string; telephone?: string | null;
  role: string; actif: boolean; email_verifie: boolean; langue?: string;
  date_creation: string | null; derniere_connexion: string | null;
  profil?: Record<string, any>;
  abonnement?: { formule: string; statut: string; date_expiration: string } | null;
}

const ROLE_COLOR: Record<string, string> = {
  eleve: colors.accent, enseignant: colors.violet, parent: colors.primary, admin: colors.danger,
};

export default function AdminUserDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [u, setU] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const fetch = async () => {
    try { const r = await api.get(`/admin/users/${id}/`); setU(r.data); } catch {}
  };
  useEffect(() => { fetch().finally(() => setLoading(false)); }, [id]);

  const patch = async (body: Record<string, any>, okMsg: string) => {
    setBusy(true);
    try { const r = await api.patch(`/admin/users/${id}/`, body); setU((p) => p ? { ...p, ...r.data } : p); await fetch(); Alert.alert('OK', okMsg); }
    catch (e: any) { Alert.alert('Erreur', e?.response?.data?.error ?? 'Action impossible.'); }
    finally { setBusy(false); }
  };

  if (loading) return <View style={styles.centered}><ActivityIndicator size="large" color={colors.primary} /></View>;
  if (!u) return <View style={styles.centered}><Text style={{ color: colors.danger }}>Utilisateur introuvable.</Text></View>;

  const rc = ROLE_COLOR[u.role] ?? colors.textMuted;

  const toggleActif = () => {
    Alert.alert(u.actif ? 'Suspendre ce compte ?' : 'Réactiver ce compte ?',
      u.actif ? "L'utilisateur ne pourra plus se connecter." : "L'utilisateur pourra de nouveau se connecter.",
      [{ text: 'Annuler', style: 'cancel' },
       { text: u.actif ? 'Suspendre' : 'Réactiver', style: u.actif ? 'destructive' : 'default',
         onPress: () => patch({ actif: !u.actif }, u.actif ? 'Compte suspendu.' : 'Compte réactivé.') }]);
  };

  return (
    <View style={styles.container}>
      <GradientBox colors={colors.gradientPrimary} style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backRow}>
          <Ionicons name="arrow-back" size={18} color="rgba(255,255,255,0.9)" /><Text style={styles.backText}>Retour</Text>
        </TouchableOpacity>
        <View style={styles.headRow}>
          <View style={styles.avatar}><Text style={styles.avatarText}>{(u.prenom?.[0] ?? '') + (u.nom?.[0] ?? '') || '?'}</Text></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{u.prenom} {u.nom}</Text>
            <Text style={styles.email}>{u.email}</Text>
            <View style={[styles.roleTag, { backgroundColor: 'rgba(255,255,255,0.22)' }]}><Text style={styles.roleTagText}>{u.role}</Text></View>
          </View>
        </View>
      </GradientBox>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {/* État */}
        <View style={styles.card}>
          <Row label="Statut" value={u.actif ? 'Actif' : 'Suspendu'} color={u.actif ? colors.success : colors.danger} />
          <Row label="Email vérifié" value={u.email_verifie ? 'Oui' : 'Non'} color={u.email_verifie ? colors.success : colors.warning} />
          {u.telephone ? <Row label="Téléphone" value={u.telephone} /> : null}
          <Row label="Inscrit le" value={fmt(u.date_creation)} />
          <Row label="Dernière connexion" value={fmt(u.derniere_connexion)} />
        </View>

        {/* Profil spécifique */}
        {u.profil && (
          <>
            <Text style={styles.section}>Profil</Text>
            <View style={styles.card}>
              {Object.entries(u.profil).map(([k, v]) => (
                <Row key={k} label={labelize(k)} value={String(v)} />
              ))}
            </View>
          </>
        )}

        {/* Abonnement */}
        {u.abonnement && (
          <>
            <Text style={styles.section}>Abonnement</Text>
            <View style={styles.card}>
              <Row label="Formule" value={u.abonnement.formule} />
              <Row label="Statut" value={u.abonnement.statut} />
              <Row label="Expire le" value={fmt(u.abonnement.date_expiration)} />
            </View>
          </>
        )}

        {/* Actions */}
        <Text style={styles.section}>Actions</Text>
        {u.role === 'enseignant' && (
          <TouchableOpacity style={[styles.actionBtn, { backgroundColor: u.profil?.verifie ? colors.surfaceAlt : colors.primary }]}
            disabled={busy} activeOpacity={0.85}
            onPress={() => patch({ verifie: !u.profil?.verifie }, u.profil?.verifie ? 'Vérification retirée.' : 'Enseignant vérifié.')}>
            <Ionicons name="shield-checkmark-outline" size={18} color={u.profil?.verifie ? colors.text : '#fff'} />
            <Text style={[styles.actionText, { color: u.profil?.verifie ? colors.text : '#fff' }]}>
              {u.profil?.verifie ? 'Retirer la vérification' : 'Vérifier cet enseignant'}
            </Text>
          </TouchableOpacity>
        )}
        {!u.email_verifie && (
          <TouchableOpacity style={[styles.actionBtn, styles.outline]} disabled={busy} activeOpacity={0.85}
            onPress={() => patch({ email_verifie: true }, 'Email marqué vérifié.')}>
            <Ionicons name="mail-open-outline" size={18} color={colors.primary} />
            <Text style={[styles.actionText, { color: colors.primary }]}>Marquer l'email comme vérifié</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={[styles.actionBtn, u.actif ? styles.danger : { backgroundColor: colors.success }]}
          disabled={busy} activeOpacity={0.85} onPress={toggleActif}>
          {busy ? <ActivityIndicator color={u.actif ? colors.danger : '#fff'} size="small" /> : (
            <>
              <Ionicons name={u.actif ? 'ban-outline' : 'checkmark-circle-outline'} size={18} color={u.actif ? colors.danger : '#fff'} />
              <Text style={[styles.actionText, { color: u.actif ? colors.danger : '#fff' }]}>{u.actif ? 'Suspendre le compte' : 'Réactiver le compte'}</Text>
            </>
          )}
        </TouchableOpacity>
        <View style={{ height: 32 }} />
      </ScrollView>
    </View>
  );
}

function Row({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, color ? { color } : null]} numberOfLines={1}>{value}</Text>
    </View>
  );
}
function fmt(iso?: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}
function labelize(k: string) { return k.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase()); }

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.bg },
  header: { paddingTop: 56, paddingBottom: 22, paddingHorizontal: spacing.lg, borderBottomLeftRadius: radius.xl, borderBottomRightRadius: radius.xl },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 14 },
  backText: { color: 'rgba(255,255,255,0.9)', fontSize: 14, fontWeight: '600' },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatar: { width: 58, height: 58, borderRadius: 29, backgroundColor: 'rgba(255,255,255,0.25)', justifyContent: 'center', alignItems: 'center' },
  avatarText: { fontSize: 20, fontWeight: '900', color: '#fff' },
  name: { fontSize: 21, fontWeight: '800', color: '#fff' },
  email: { fontSize: 12.5, color: 'rgba(255,255,255,0.85)', marginTop: 1 },
  roleTag: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 3, borderRadius: radius.full, marginTop: 8 },
  roleTagText: { color: '#fff', fontSize: 11, fontWeight: '800', textTransform: 'capitalize' },
  body: { padding: spacing.md },
  section: { fontSize: 15, fontWeight: '800', color: colors.text, marginTop: 18, marginBottom: 10 },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, borderWidth: 1, borderColor: colors.border, ...shadow.sm },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 7 },
  rowLabel: { fontSize: 13, color: colors.textMuted, fontWeight: '600' },
  rowValue: { fontSize: 13.5, color: colors.text, fontWeight: '700', maxWidth: '60%' },
  actionBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: radius.md, paddingVertical: 14, marginBottom: 10, ...shadow.sm },
  outline: { backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.primary },
  danger: { backgroundColor: '#FEF2F2', borderWidth: 1.5, borderColor: '#FCA5A5' },
  actionText: { fontSize: 14.5, fontWeight: '800' },
});
