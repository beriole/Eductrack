import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { Link } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '@/src/store/authStore';
import { colors, radius, shadow } from '@/src/theme';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [focus, setFocus] = useState<'email' | 'pwd' | null>(null);
  const [loading, setLoading] = useState(false);
  const { login } = useAuthStore();

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Champs requis', 'Veuillez remplir tous les champs.');
      return;
    }
    setLoading(true);
    try {
      await login(email.trim().toLowerCase(), password);
    } catch (error: any) {
      const msg = error?.response?.data?.message ?? 'Email ou mot de passe incorrect.';
      Alert.alert('Connexion échouée', msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {/* Logo */}
          <View style={styles.logoBadge}>
            <Ionicons name="school" size={32} color={colors.white} />
          </View>
          <Text style={styles.brand}>SmartSchool</Text>
          <Text style={styles.tagline}>Ton excellence scolaire commence ici</Text>

          {/* Carte */}
          <View style={styles.card}>
            <Text style={styles.title}>Connexion</Text>
            <Text style={styles.subtitle}>Heureux de te revoir</Text>

            <Text style={styles.label}>Adresse email</Text>
            <View style={[styles.inputWrap, focus === 'email' && styles.inputFocus]}>
              <Ionicons name="mail-outline" size={20} color={focus === 'email' ? colors.primary : colors.textLight} />
              <TextInput
                style={styles.input}
                placeholder="ton@email.cm"
                placeholderTextColor={colors.textLight}
                value={email}
                onChangeText={setEmail}
                onFocus={() => setFocus('email')}
                onBlur={() => setFocus(null)}
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>

            <Text style={[styles.label, { marginTop: 16 }]}>Mot de passe</Text>
            <View style={[styles.inputWrap, focus === 'pwd' && styles.inputFocus]}>
              <Ionicons name="lock-closed-outline" size={20} color={focus === 'pwd' ? colors.primary : colors.textLight} />
              <TextInput
                style={styles.input}
                placeholder="••••••••"
                placeholderTextColor={colors.textLight}
                value={password}
                onChangeText={setPassword}
                onFocus={() => setFocus('pwd')}
                onBlur={() => setFocus(null)}
                secureTextEntry={!showPwd}
                returnKeyType="go"
                onSubmitEditing={handleLogin}
              />
              <TouchableOpacity onPress={() => setShowPwd((v) => !v)} hitSlop={8}>
                <Ionicons name={showPwd ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.textLight} />
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.forgot}>
              <Text style={styles.forgotText}>Mot de passe oublié ?</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={handleLogin} disabled={loading} activeOpacity={0.9} style={styles.button}>
              {loading
                ? <ActivityIndicator color={colors.white} />
                : (<><Text style={styles.buttonText}>Se connecter</Text><Ionicons name="arrow-forward" size={20} color={colors.white} /></>)}
            </TouchableOpacity>
          </View>

          <Link href="/(auth)/register" asChild>
            <TouchableOpacity style={styles.registerLink}>
              <Text style={styles.registerText}>Pas encore de compte ? <Text style={styles.registerBold}>S'inscrire</Text></Text>
            </TouchableOpacity>
          </Link>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  scroll: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 22, paddingVertical: 40 },
  logoBadge: {
    width: 64, height: 64, borderRadius: 20, backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center', alignSelf: 'center', ...shadow.lg,
  },
  brand: { fontSize: 26, fontWeight: '800', color: colors.text, textAlign: 'center', marginTop: 16, letterSpacing: -0.5 },
  tagline: { fontSize: 14, color: colors.textMuted, textAlign: 'center', marginTop: 4, marginBottom: 28 },
  card: { backgroundColor: colors.surface, borderRadius: radius.xl, padding: 24, ...shadow.md },
  title: { fontSize: 22, fontWeight: '800', color: colors.text, marginBottom: 4 },
  subtitle: { fontSize: 14, color: colors.textMuted, marginBottom: 22 },
  label: { fontSize: 13, fontWeight: '600', color: colors.textMuted, marginBottom: 8 },
  inputWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: colors.surfaceAlt, borderWidth: 1.5, borderColor: colors.border,
    borderRadius: radius.md, paddingHorizontal: 14,
  },
  inputFocus: { borderColor: colors.primary, backgroundColor: colors.white },
  input: { flex: 1, paddingVertical: 14, fontSize: 16, color: colors.text },
  forgot: { alignSelf: 'flex-end', marginTop: 12 },
  forgotText: { fontSize: 13, color: colors.primary, fontWeight: '600' },
  button: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: 16, marginTop: 18, ...shadow.lg,
  },
  buttonText: { color: colors.white, fontSize: 16, fontWeight: '800' },
  registerLink: { marginTop: 24, alignItems: 'center' },
  registerText: { color: colors.textMuted, fontSize: 14 },
  registerBold: { color: colors.primary, fontWeight: '800' },
});
