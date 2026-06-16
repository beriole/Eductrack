import { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Alert,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '@/src/lib/api';
import { colors, radius, spacing, shadow } from '@/src/theme';

const FORMULES: { key: string; label: string; mensuel: number }[] = [
  { key: 'basic', label: 'Basic', mensuel: 1000 },
  { key: 'standard', label: 'Standard', mensuel: 2500 },
  { key: 'premium', label: 'Premium', mensuel: 5000 },
  { key: 'pro', label: 'Pro', mensuel: 9000 },
];
const PERIODES: { key: string; label: string; mult: number }[] = [
  { key: 'mensuel', label: 'Mensuel', mult: 1 },
  { key: 'trimestriel', label: 'Trimestriel', mult: 3 },
  { key: 'annuel', label: 'Annuel', mult: 12 },
];
const STATUTS = ['actif', 'suspendu', 'expire', 'resilie'];

interface UserRow { id_utilisateur: string; prenom: string; nom: string; email: string; role: string }

export default function AbonnementForm() {
  const router = useRouter();
  const params = useLocalSearchParams<{ mode?: string; id?: string; email?: string; formule?: string; periodicite?: string; montant?: string; statut?: string }>();
  const isEdit = params.mode === 'edit';

  const [user, setUser] = useState<{ id: string; email: string } | null>(
    isEdit && params.email ? { id: '', email: params.email } : null);
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<UserRow[]>([]);
  const [searching, setSearching] = useState(false);

  const [formule, setFormule] = useState(params.formule || 'basic');
  const [periodicite, setPeriodicite] = useState(params.periodicite || 'mensuel');
  const [montant, setMontant] = useState(params.montant || '');
  const [montantTouched, setMontantTouched] = useState(isEdit);
  const [statut, setStatut] = useState(params.statut || 'actif');
  const [saving, setSaving] = useState(false);

  // Montant auto selon formule × périodicité, tant que l'admin ne l'a pas saisi.
  useEffect(() => {
    if (montantTouched) return;
    const f = FORMULES.find((x) => x.key === formule);
    const p = PERIODES.find((x) => x.key === periodicite);
    if (f && p) setMontant(String(f.mensuel * p.mult));
  }, [formule, periodicite, montantTouched]);

  // Recherche d'utilisateur (création).
  useEffect(() => {
    if (isEdit || user) return;
    const q = search.trim();
    if (q.length < 2) { setResults([]); return; }
    const t = setTimeout(async () => {
      setSearching(true);
      try { const r = await api.get('/admin/users/', { params: { search: q, page_size: '8' } }); setResults(r.data.results ?? []); }
      catch {} finally { setSearching(false); }
    }, 350);
    return () => clearTimeout(t);
  }, [search, isEdit, user]);

  const submit = async () => {
    if (!isEdit && !user?.id) { Alert.alert('Utilisateur requis', 'Choisis un utilisateur.'); return; }
    setSaving(true);
    try {
      const body: Record<string, any> = { formule, periodicite, montant: Number(montant) || 0, statut };
      if (isEdit) {
        await api.patch(`/admin/abonnements/${params.id}/`, body);
      } else {
        await api.post('/admin/abonnements/', { id_utilisateur: user!.id, ...body });
      }
      Alert.alert('Enregistré', isEdit ? 'Abonnement mis à jour.' : 'Abonnement créé.', [{ text: 'OK', onPress: () => router.back() }]);
    } catch (e: any) {
      Alert.alert('Erreur', e?.response?.data?.error ?? "L'enregistrement a échoué.");
    } finally { setSaving(false); }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backRow}><Ionicons name="arrow-back" size={20} color={colors.text} /></TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{isEdit ? 'Modifier l\'abonnement' : 'Nouvel abonnement'}</Text>
          {user?.email ? <Text style={styles.subtitle}>{user.email}</Text> : null}
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {/* Sélection utilisateur (création) */}
        {!isEdit && (
          <>
            <Text style={styles.label}>Utilisateur</Text>
            {user ? (
              <View style={styles.userPicked}>
                <Ionicons name="person-circle" size={22} color={colors.primary} />
                <Text style={styles.userPickedText} numberOfLines={1}>{user.email}</Text>
                <TouchableOpacity onPress={() => { setUser(null); setSearch(''); }}><Ionicons name="close-circle" size={20} color={colors.textLight} /></TouchableOpacity>
              </View>
            ) : (
              <>
                <View style={styles.searchBar}>
                  <Ionicons name="search" size={18} color={colors.textLight} style={{ marginRight: 8 }} />
                  <TextInput style={styles.searchInput} placeholder="Rechercher (nom ou email)…" placeholderTextColor={colors.textLight}
                    value={search} onChangeText={setSearch} autoCapitalize="none" />
                  {searching && <ActivityIndicator size="small" color={colors.primary} />}
                </View>
                {results.map((u) => (
                  <TouchableOpacity key={u.id_utilisateur} style={styles.resultRow}
                    onPress={() => { setUser({ id: u.id_utilisateur, email: u.email }); setResults([]); }}>
                    <Text style={styles.resultName}>{u.prenom} {u.nom}</Text>
                    <Text style={styles.resultEmail} numberOfLines={1}>{u.email} · {u.role}</Text>
                  </TouchableOpacity>
                ))}
              </>
            )}
          </>
        )}

        <Text style={styles.label}>Formule</Text>
        <View style={styles.chips}>
          {FORMULES.map((f) => (
            <Chip key={f.key} label={f.label} active={formule === f.key} onPress={() => { setFormule(f.key); setMontantTouched(false); }} />
          ))}
        </View>

        <Text style={styles.label}>Périodicité</Text>
        <View style={styles.chips}>
          {PERIODES.map((p) => (
            <Chip key={p.key} label={p.label} active={periodicite === p.key} onPress={() => { setPeriodicite(p.key); setMontantTouched(false); }} />
          ))}
        </View>

        <Text style={styles.label}>Montant (FCFA)</Text>
        <TextInput style={styles.input} value={montant} onChangeText={(v) => { setMontant(v.replace(/[^0-9]/g, '')); setMontantTouched(true); }}
          keyboardType="number-pad" placeholder="0" placeholderTextColor={colors.textLight} />

        <Text style={styles.label}>Statut</Text>
        <View style={styles.chips}>
          {STATUTS.map((s) => <Chip key={s} label={s} active={statut === s} onPress={() => setStatut(s)} />)}
        </View>

        <TouchableOpacity style={[styles.submit, saving && { opacity: 0.7 }]} onPress={submit} disabled={saving} activeOpacity={0.85}>
          {saving ? <ActivityIndicator color="#fff" /> : <><Ionicons name="save-outline" size={18} color="#fff" /><Text style={styles.submitText}>{isEdit ? 'Enregistrer' : 'Créer l\'abonnement'}</Text></>}
        </TouchableOpacity>
        <View style={{ height: 24 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity style={[styles.chip, active && styles.chipActive]} onPress={onPress} activeOpacity={0.8}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: spacing.md, paddingTop: 56, paddingBottom: 10 },
  backRow: { width: 38, height: 38, borderRadius: 12, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', ...shadow.sm },
  title: { fontSize: 21, fontWeight: '800', color: colors.text, letterSpacing: -0.4 },
  subtitle: { fontSize: 12.5, color: colors.textMuted, marginTop: 1 },
  scroll: { padding: spacing.md },
  label: { fontSize: 13, fontWeight: '800', color: colors.textMuted, marginBottom: 8, marginTop: 16 },
  searchBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.md, paddingHorizontal: 14, borderWidth: 1, borderColor: colors.border },
  searchInput: { flex: 1, fontSize: 15, color: colors.text, paddingVertical: 12 },
  resultRow: { backgroundColor: colors.surface, borderRadius: radius.md, padding: 12, marginTop: 8, borderWidth: 1, borderColor: colors.border },
  resultName: { fontSize: 14, fontWeight: '800', color: colors.text },
  resultEmail: { fontSize: 12, color: colors.textMuted, marginTop: 1 },
  userPicked: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.primaryLight, borderRadius: radius.md, padding: 12, borderWidth: 1, borderColor: colors.primary },
  userPickedText: { flex: 1, fontSize: 14, fontWeight: '700', color: colors.text },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.full, backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.border },
  chipActive: { backgroundColor: colors.primaryLight, borderColor: colors.primary },
  chipText: { fontSize: 13, fontWeight: '700', color: colors.textMuted, textTransform: 'capitalize' },
  chipTextActive: { color: colors.primary },
  input: { backgroundColor: colors.surface, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, fontWeight: '700', color: colors.text, borderWidth: 1, borderColor: colors.border },
  submit: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: 15, marginTop: 24, ...shadow.lg },
  submitText: { color: '#fff', fontWeight: '800', fontSize: 15 },
});
