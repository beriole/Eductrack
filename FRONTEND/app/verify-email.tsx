import { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '@/src/lib/api';
import { useAuthStore } from '@/src/store/authStore';
import { colors, radius, shadow } from '@/src/theme';

export default function VerifyEmailScreen() {
  const router = useRouter();
  const { user, refreshUser } = useAuthStore();

  const [otp, setOtp] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [sending, setSending] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  // Envoie un code dès l'ouverture si l'email n'est pas encore vérifié.
  useEffect(() => {
    if (user && !user.email_verifie) envoyerCode(true);
  }, []);

  // Compte à rebours du renvoi.
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const envoyerCode = async (silencieux = false) => {
    if (!user?.email || cooldown > 0) return;
    setSending(true);
    try {
      await api.post('/auth/email/resend/', { email: user.email });
      setCooldown(60);
      if (!silencieux) Alert.alert('Code envoyé', 'Vérifie ta boîte mail (et les spams).');
    } catch (error: any) {
      const msg = error?.response?.data?.error ?? "Impossible d'envoyer le code.";
      if (!silencieux) Alert.alert('Erreur', msg);
    } finally {
      setSending(false);
    }
  };

  const verifier = async () => {
    if (!user?.email) return;
    if (otp.trim().length !== 6) {
      Alert.alert('Code invalide', 'Le code comporte 6 chiffres.');
      return;
    }
    setVerifying(true);
    try {
      await api.post('/auth/email/verify/', { email: user.email, otp: otp.trim() });
      await refreshUser();
      Alert.alert('Email vérifié', 'Ton compte est maintenant vérifié.', [
        { text: 'Continuer', onPress: () => router.replace('/(tabs)/dashboard') },
      ]);
    } catch (error: any) {
      const msg = error?.response?.data?.error ?? 'Code invalide ou expiré.';
      Alert.alert('Échec', msg);
    } finally {
      setVerifying(false);
    }
  };

  return (
    <View style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <TouchableOpacity style={styles.back} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={20} color={colors.text} />
          </TouchableOpacity>
          <View style={styles.logoBadge}>
            <Ionicons name="mail-open" size={30} color={colors.white} />
          </View>
          <Text style={styles.brand}>Vérifie ton email</Text>
          <Text style={styles.tagline}>
            Un code à 6 chiffres a été envoyé à{'\n'}
            <Text style={styles.email}>{user?.email ?? 'ton adresse'}</Text>
          </Text>

          <View style={styles.card}>
            <Text style={styles.label}>Code de vérification</Text>
            <View style={styles.inputWrap}>
              <Ionicons name="keypad-outline" size={20} color={colors.textLight} />
              <TextInput
                style={[styles.input, styles.otpInput]}
                placeholder="______"
                placeholderTextColor={colors.textLight}
                value={otp}
                onChangeText={(t) => setOtp(t.replace(/[^0-9]/g, '').slice(0, 6))}
                keyboardType="number-pad"
                maxLength={6}
                returnKeyType="done"
                onSubmitEditing={verifier}
              />
            </View>

            <TouchableOpacity onPress={verifier} disabled={verifying} activeOpacity={0.9} style={styles.button}>
              {verifying
                ? <ActivityIndicator color={colors.white} />
                : (<><Text style={styles.buttonText}>Vérifier</Text><Ionicons name="checkmark" size={20} color={colors.white} /></>)}
            </TouchableOpacity>

            <TouchableOpacity onPress={() => envoyerCode(false)} disabled={sending || cooldown > 0} style={styles.resend}>
              <Text style={styles.resendText}>
                {cooldown > 0 ? `Renvoyer le code dans ${cooldown}s` : sending ? 'Envoi…' : 'Renvoyer le code'}
              </Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.skip} onPress={() => router.replace('/(tabs)/dashboard')}>
            <Text style={styles.skipText}>Plus tard</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  scroll: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 22, paddingVertical: 40 },
  back: { position: 'absolute', top: 16, left: 4, width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  logoBadge: {
    width: 64, height: 64, borderRadius: 20, backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center', alignSelf: 'center', ...shadow.lg,
  },
  brand: { fontSize: 24, fontWeight: '800', color: colors.text, textAlign: 'center', marginTop: 16, letterSpacing: -0.5 },
  tagline: { fontSize: 14, color: colors.textMuted, textAlign: 'center', marginTop: 6, marginBottom: 28, lineHeight: 20 },
  email: { color: colors.primary, fontWeight: '700' },
  card: { backgroundColor: colors.surface, borderRadius: radius.xl, padding: 24, ...shadow.md },
  label: { fontSize: 13, fontWeight: '600', color: colors.textMuted, marginBottom: 8 },
  inputWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: colors.surfaceAlt, borderWidth: 1.5, borderColor: colors.border,
    borderRadius: radius.md, paddingHorizontal: 14,
  },
  input: { flex: 1, paddingVertical: 14, fontSize: 16, color: colors.text },
  otpInput: { letterSpacing: 8, fontWeight: '700' },
  button: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: 16, marginTop: 22, ...shadow.lg,
  },
  buttonText: { color: colors.white, fontSize: 16, fontWeight: '800' },
  resend: { alignSelf: 'center', marginTop: 16 },
  resendText: { fontSize: 13, color: colors.primary, fontWeight: '600' },
  skip: { marginTop: 24, alignItems: 'center' },
  skipText: { color: colors.textMuted, fontSize: 14, fontWeight: '600' },
});
