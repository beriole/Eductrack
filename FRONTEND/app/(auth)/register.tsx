import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator, Alert, KeyboardAvoidingView,
  Platform, ScrollView, Image,
} from 'react-native';
import { Link, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '@/src/store/authStore';
import { colors, radius } from '@/src/theme';

const ROLES = [
  { key: 'eleve', label: 'Élève' },
  { key: 'parent', label: 'Parent' },
  { key: 'enseignant', label: 'Enseignant' },
] as const;

const SYSTEMES = [
  { key: 'francophone', label: 'Francophone' },
  { key: 'anglophone', label: 'Anglophone' },
] as const;

// Niveaux par sous-système (valeur backend / libellé affiché).
const NIVEAUX_FR = [
  { v: '6e', l: '6e' }, { v: '5e', l: '5e' }, { v: '4e', l: '4e' }, { v: '3e', l: '3e' },
  { v: '2nde', l: '2nde' }, { v: '1ere', l: '1ère' }, { v: 'Tle', l: 'Tle' },
];
const NIVEAUX_EN = [
  { v: 'Form1', l: 'Form 1' }, { v: 'Form2', l: 'Form 2' }, { v: 'Form3', l: 'Form 3' },
  { v: 'Form4', l: 'Form 4' }, { v: 'Form5', l: 'Form 5' },
  { v: 'LowerSixth', l: 'Lower Sixth' }, { v: 'UpperSixth', l: 'Upper Sixth' },
];
const REGIONS = [
  'Adamaoua', 'Centre', 'Est', 'Extrême-Nord', 'Littoral',
  'Nord', 'Nord-Ouest', 'Ouest', 'Sud', 'Sud-Ouest',
];

export default function RegisterScreen() {
  const router = useRouter();
  const { register } = useAuthStore();

  const [step, setStep] = useState<1 | 2>(1);
  const [loading, setLoading] = useState(false);

  const [nom, setNom] = useState('');
  const [prenom, setPrenom] = useState('');
  const [email, setEmail] = useState('');
  const [telephone, setTelephone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [role, setRole] = useState<'eleve' | 'parent' | 'enseignant'>('eleve');

  // Champs élève — la classe doit être choisie explicitement (aucune présélection).
  const [systeme, setSysteme] = useState<'francophone' | 'anglophone'>('francophone');
  const [niveauIndex, setNiveauIndex] = useState<number | null>(null);
  const [regionIndex, setRegionIndex] = useState(1); // Centre par défaut

  const niveaux = systeme === 'anglophone' ? NIVEAUX_EN : NIVEAUX_FR;

  const handleNext = () => {
    if (!nom.trim() || !prenom.trim() || !email.trim()) {
      Alert.alert('Champs requis', 'Veuillez remplir le nom, prénom et email.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      Alert.alert('Email invalide', 'Veuillez entrer un email valide.');
      return;
    }
    if (role === 'eleve' && niveauIndex === null) {
      Alert.alert('Classe requise', 'Choisis ta classe : tes cours et examens en dépendent.');
      return;
    }
    setStep(2);
  };

  const handleRegister = async () => {
    if (!password || password.length < 8) {
      Alert.alert('Mot de passe', 'Le mot de passe doit contenir au moins 8 caractères.');
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert('Erreur', 'Les mots de passe ne correspondent pas.');
      return;
    }

    setLoading(true);
    try {
      await register({
        nom: nom.trim(),
        prenom: prenom.trim(),
        email: email.trim().toLowerCase(),
        telephone: telephone.trim() || undefined,
        password,
        role,
        ...(role === 'eleve' && niveauIndex !== null && {
          systeme,
          niveau_scolaire: niveaux[niveauIndex].v,
          region: REGIONS[regionIndex],
        }),
      });
      // La redirection est gérée par le _layout (auth guard)
    } catch (error: any) {
      const errors = error?.response?.data;
      let msg = 'Impossible de créer le compte.';
      if (errors?.email) msg = `Email : ${errors.email}`;
      else if (errors?.telephone) msg = `Téléphone : ${errors.telephone}`;
      else if (errors?.non_field_errors) msg = errors.non_field_errors[0];
      else if (typeof errors === 'string') msg = errors;
      Alert.alert('Inscription échouée', msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.inner} keyboardShouldPersistTaps="handled">
        <Image source={require('@/assets/icon.png')} style={styles.logo} resizeMode="contain" />
        <Text style={styles.title}>SmartSchool</Text>
        <Text style={styles.subtitle}>
          {step === 1 ? 'Crée ton compte' : 'Sécurise ton compte'}
        </Text>

        {/* Indicateur d'étapes */}
        <View style={styles.steps}>
          <View style={[styles.step, step >= 1 && styles.stepActive]} />
          <View style={[styles.step, step >= 2 && styles.stepActive]} />
        </View>

        {step === 1 ? (
          <>
            {/* Choix du rôle */}
            <Text style={styles.label}>Je suis…</Text>
            <View style={styles.roleRow}>
              {ROLES.map((r) => (
                <TouchableOpacity
                  key={r.key}
                  style={[styles.roleBtn, role === r.key && styles.roleBtnActive]}
                  onPress={() => setRole(r.key)}
                >
                  <Text style={[styles.roleBtnText, role === r.key && styles.roleBtnTextActive]}>
                    {r.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <TextInput
              style={styles.input}
              placeholder="Prénom"
              placeholderTextColor="#9CA3AF"
              value={prenom}
              onChangeText={setPrenom}
            />
            <TextInput
              style={styles.input}
              placeholder="Nom"
              placeholderTextColor="#9CA3AF"
              value={nom}
              onChangeText={setNom}
            />
            <TextInput
              style={styles.input}
              placeholder="Email"
              placeholderTextColor="#9CA3AF"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <TextInput
              style={styles.input}
              placeholder="Téléphone (optionnel)"
              placeholderTextColor="#9CA3AF"
              value={telephone}
              onChangeText={setTelephone}
              keyboardType="phone-pad"
            />

            {/* Champs élève */}
            {role === 'eleve' && (
              <>
                <Text style={styles.label}>Sous-système</Text>
                <View style={styles.roleRow}>
                  {SYSTEMES.map((s) => (
                    <TouchableOpacity
                      key={s.key}
                      style={[styles.roleBtn, systeme === s.key && styles.roleBtnActive]}
                      onPress={() => { setSysteme(s.key); setNiveauIndex(null); }}
                    >
                      <Text style={[styles.roleBtnText, systeme === s.key && styles.roleBtnTextActive]}>
                        {s.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={styles.label}>Choisis ta classe *</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
                  {niveaux.map((n, i) => (
                    <TouchableOpacity
                      key={n.v}
                      style={[styles.chip, niveauIndex === i && styles.chipActive]}
                      onPress={() => setNiveauIndex(i)}
                    >
                      <Text style={[styles.chipText, niveauIndex === i && styles.chipTextActive]}>{n.l}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                <Text style={styles.label}>Région</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
                  {REGIONS.map((r, i) => (
                    <TouchableOpacity
                      key={r}
                      style={[styles.chip, regionIndex === i && styles.chipActive]}
                      onPress={() => setRegionIndex(i)}
                    >
                      <Text style={[styles.chipText, regionIndex === i && styles.chipTextActive]}>{r}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </>
            )}

            <TouchableOpacity style={[styles.button, styles.buttonRow]} onPress={handleNext}>
              <Text style={styles.buttonText}>Suivant</Text>
              <Ionicons name="arrow-forward" size={18} color="#fff" />
            </TouchableOpacity>
          </>
        ) : (
          <>
            <TextInput
              style={styles.input}
              placeholder="Mot de passe (8 caractères min.)"
              placeholderTextColor="#9CA3AF"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />
            <TextInput
              style={styles.input}
              placeholder="Confirmer le mot de passe"
              placeholderTextColor="#9CA3AF"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry
            />

            <TouchableOpacity
              style={styles.button}
              onPress={handleRegister}
              disabled={loading}
            >
              {loading
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.buttonText}>Créer mon compte</Text>
              }
            </TouchableOpacity>

            <TouchableOpacity style={[styles.backBtn, styles.buttonRow]} onPress={() => setStep(1)}>
              <Ionicons name="arrow-back" size={16} color="#6B7280" />
              <Text style={styles.backText}>Retour</Text>
            </TouchableOpacity>
          </>
        )}

        <Link href="/(auth)/login" asChild>
          <TouchableOpacity style={styles.linkContainer}>
            <Text style={styles.link}>Déjà un compte ? <Text style={styles.linkBold}>Se connecter</Text></Text>
          </TouchableOpacity>
        </Link>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const PRIMARY = colors.primary;
const ACCENT = colors.primary;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  inner: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 40 },
  logo: { width: 64, height: 64, borderRadius: 18, alignSelf: 'center', marginBottom: 10 },
  title: { fontSize: 32, fontWeight: '800', color: PRIMARY, textAlign: 'center', marginBottom: 4, letterSpacing: -0.5 },
  subtitle: { fontSize: 16, color: colors.textMuted, textAlign: 'center', marginBottom: 16 },
  steps: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 24 },
  step: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border },
  stepActive: { backgroundColor: ACCENT },
  label: { fontSize: 13, fontWeight: '600', color: colors.textMuted, marginBottom: 8, marginTop: 4 },
  roleRow: { flexDirection: 'row', gap: 8, marginBottom: 20 },
  roleBtn: {
    flex: 1, paddingVertical: 10, borderRadius: radius.sm, borderWidth: 1.5,
    borderColor: colors.border, alignItems: 'center', backgroundColor: colors.surface,
  },
  roleBtnActive: { borderColor: ACCENT, backgroundColor: colors.primaryLight },
  roleBtnText: { fontSize: 13, fontWeight: '600', color: colors.textMuted },
  roleBtnTextActive: { color: ACCENT },
  input: {
    backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.border,
    borderRadius: radius.md, paddingHorizontal: 16, paddingVertical: 14,
    fontSize: 16, marginBottom: 16, color: colors.text,
  },
  chipScroll: { marginBottom: 16 },
  chip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.full, borderWidth: 1.5,
    borderColor: colors.border, backgroundColor: colors.surface, marginRight: 8,
  },
  chipActive: { borderColor: ACCENT, backgroundColor: colors.primaryLight },
  chipText: { fontSize: 13, fontWeight: '600', color: colors.textMuted },
  chipTextActive: { color: ACCENT },
  button: {
    backgroundColor: PRIMARY, borderRadius: radius.md,
    paddingVertical: 16, alignItems: 'center', marginTop: 8,
  },
  buttonText: { color: colors.white, fontSize: 16, fontWeight: '700' },
  backBtn: { marginTop: 12, alignItems: 'center' },
  buttonRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  backText: { color: colors.textMuted, fontSize: 15 },
  linkContainer: { marginTop: 24, alignItems: 'center' },
  link: { color: colors.textMuted, fontSize: 14 },
  linkBold: { color: PRIMARY, fontWeight: '700' },
});
