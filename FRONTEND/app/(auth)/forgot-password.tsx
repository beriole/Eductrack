import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '@/src/lib/api';
import { colors, radius, shadow } from '@/src/theme';

type Step = 'request' | 'confirm';

export default function ForgotPasswordScreen() {
  const router = useRouter();

  const [step, setStep] = useState<Step>('request');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);

  // Étape 1 : demande du code par email
  const handleRequest = async () => {
    const mail = email.trim().toLowerCase();
    if (!mail) {
      Alert.alert('Email requis', 'Saisissez votre adresse email.');
      return;
    }
    setLoading(true);
    try {
      await api.post('/auth/password/reset/', { email: mail });
      setEmail(mail);
      setStep('confirm');
      Alert.alert(
        'Code envoyé',
        'Si cet email est enregistré, vous recevrez un code à 6 chiffres. Saisissez-le ci-dessous.',
      );
    } catch (error: any) {
      const msg = error?.response?.data?.error
        ?? 'Impossible d\'envoyer le code pour le moment.';
      Alert.alert('Erreur', msg);
    } finally {
      setLoading(false);
    }
  };

  // Étape 2 : validation OTP + nouveau mot de passe
  const handleConfirm = async () => {
    if (otp.trim().length !== 6) {
      Alert.alert('Code invalide', 'Le code doit comporter 6 chiffres.');
      return;
    }
    if (newPassword.length < 8) {
      Alert.alert('Mot de passe trop court', 'Au moins 8 caractères.');
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert('Erreur', 'Les deux mots de passe ne correspondent pas.');
      return;
    }
    setLoading(true);
    try {
      await api.post('/auth/password/reset/confirm/', {
        email,
        otp: otp.trim(),
        new_password: newPassword,
      });
      Alert.alert(
        'Mot de passe réinitialisé',
        'Vous pouvez maintenant vous connecter avec votre nouveau mot de passe.',
        [{ text: 'Se connecter', onPress: () => router.replace('/(auth)/login') }],
      );
    } catch (error: any) {
      const data = error?.response?.data;
      const msg = data?.otp?.[0] ?? data?.new_password?.[0] ?? data?.error
        ?? 'Code invalide ou expiré.';
      Alert.alert('Échec', msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <TouchableOpacity style={styles.back} onPress={() => router.back()} hitSlop={10}>
            <Ionicons name="arrow-back" size={22} color={colors.text} />
          </TouchableOpacity>

          <View style={styles.logoBadge}>
            <Ionicons name="lock-closed" size={30} color={colors.white} />
          </View>
          <Text style={styles.brand}>Mot de passe oublié</Text>
          <Text style={styles.tagline}>
            {step === 'request'
              ? 'Recevez un code pour réinitialiser votre mot de passe'
              : 'Saisissez le code reçu et votre nouveau mot de passe'}
          </Text>

          <View style={styles.card}>
            {step === 'request' ? (
              <>
                <Text style={styles.label}>Adresse email</Text>
                <View style={styles.inputWrap}>
                  <Ionicons name="mail-outline" size={20} color={colors.textLight} />
                  <TextInput
                    style={styles.input}
                    placeholder="ton@email.cm"
                    placeholderTextColor={colors.textLight}
                    value={email}
                    onChangeText={setEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    returnKeyType="send"
                    onSubmitEditing={handleRequest}
                  />
                </View>

                <TouchableOpacity onPress={handleRequest} disabled={loading} activeOpacity={0.9} style={styles.button}>
                  {loading
                    ? <ActivityIndicator color={colors.white} />
                    : (<><Text style={styles.buttonText}>Envoyer le code</Text><Ionicons name="paper-plane" size={18} color={colors.white} /></>)}
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={styles.label}>Code à 6 chiffres</Text>
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
                  />
                </View>

                <Text style={[styles.label, { marginTop: 16 }]}>Nouveau mot de passe</Text>
                <View style={styles.inputWrap}>
                  <Ionicons name="lock-closed-outline" size={20} color={colors.textLight} />
                  <TextInput
                    style={styles.input}
                    placeholder="••••••••"
                    placeholderTextColor={colors.textLight}
                    value={newPassword}
                    onChangeText={setNewPassword}
                    secureTextEntry={!showPwd}
                  />
                  <TouchableOpacity onPress={() => setShowPwd((v) => !v)} hitSlop={8}>
                    <Ionicons name={showPwd ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.textLight} />
                  </TouchableOpacity>
                </View>

                <Text style={[styles.label, { marginTop: 16 }]}>Confirmer le mot de passe</Text>
                <View style={styles.inputWrap}>
                  <Ionicons name="lock-closed-outline" size={20} color={colors.textLight} />
                  <TextInput
                    style={styles.input}
                    placeholder="••••••••"
                    placeholderTextColor={colors.textLight}
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    secureTextEntry={!showPwd}
                    returnKeyType="done"
                    onSubmitEditing={handleConfirm}
                  />
                </View>

                <TouchableOpacity onPress={handleConfirm} disabled={loading} activeOpacity={0.9} style={styles.button}>
                  {loading
                    ? <ActivityIndicator color={colors.white} />
                    : (<><Text style={styles.buttonText}>Réinitialiser</Text><Ionicons name="checkmark" size={20} color={colors.white} /></>)}
                </TouchableOpacity>

                <TouchableOpacity onPress={handleRequest} disabled={loading} style={styles.resend}>
                  <Text style={styles.resendText}>Renvoyer le code</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  scroll: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 22, paddingVertical: 40 },
  back: { position: 'absolute', top: 8, left: 4, padding: 8 },
  logoBadge: {
    width: 64, height: 64, borderRadius: 20, backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center', alignSelf: 'center', ...shadow.lg,
  },
  brand: { fontSize: 24, fontWeight: '800', color: colors.text, textAlign: 'center', marginTop: 16, letterSpacing: -0.5 },
  tagline: { fontSize: 14, color: colors.textMuted, textAlign: 'center', marginTop: 6, marginBottom: 28, paddingHorizontal: 10 },
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
});
