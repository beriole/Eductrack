import { useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '@/src/lib/api';
import { colors, radius, spacing, shadow } from '@/src/theme';

export default function LierEnfantScreen() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);

  const lier = async () => {
    const value = code.trim().toUpperCase();
    if (value.length < 6) {
      return Alert.alert('Code invalide', 'Saisis le code de liaison (8 caractères) de ton enfant.');
    }
    setLoading(true);
    try {
      await api.post('/parents/lier/', { code: value });
      Alert.alert('Enfant lié', 'Le compte de votre enfant est maintenant suivi.', [
        { text: 'OK', onPress: () => router.replace('/parent/dashboard') },
      ]);
    } catch (e: any) {
      const msg = e?.response?.data?.error ?? 'Liaison impossible. Vérifie le code.';
      Alert.alert('Échec', msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backRow}>
          <Ionicons name="arrow-back" size={20} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Lier un enfant</Text>
      </View>

      <View style={styles.body}>
        <View style={styles.illu}>
          <Ionicons name="link" size={40} color={colors.primary} />
        </View>
        <Text style={styles.lead}>Saisis le code de liaison</Text>
        <Text style={styles.sub}>
          Demande à ton enfant son code de liaison (dans son profil → Liaison parentale).
          Il est composé de 8 caractères et expire au bout de 48 h.
        </Text>

        <TextInput
          style={styles.input}
          placeholder="Ex. 7XK2P9QA"
          placeholderTextColor={colors.textLight}
          value={code}
          onChangeText={(t) => setCode(t.toUpperCase())}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={8}
          textAlign="center"
        />

        <TouchableOpacity style={[styles.btn, loading && { opacity: 0.7 }]} onPress={lier} disabled={loading} activeOpacity={0.85}>
          {loading
            ? <ActivityIndicator color={colors.white} size="small" />
            : <><Ionicons name="checkmark-circle" size={18} color={colors.white} /><Text style={styles.btnText}>Lier l'enfant</Text></>}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: spacing.md, paddingTop: 56, paddingBottom: 12 },
  backRow: { width: 38, height: 38, borderRadius: 12, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', ...shadow.sm },
  title: { fontSize: 22, fontWeight: '800', color: colors.text, letterSpacing: -0.4 },
  body: { padding: spacing.lg, alignItems: 'center' },
  illu: { width: 84, height: 84, borderRadius: 28, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center', marginTop: 12, marginBottom: 20 },
  lead: { fontSize: 18, fontWeight: '800', color: colors.text },
  sub: { fontSize: 13.5, color: colors.textMuted, textAlign: 'center', lineHeight: 20, marginTop: 8, marginBottom: 24 },
  input: {
    alignSelf: 'stretch', backgroundColor: colors.surface, borderRadius: radius.md,
    paddingVertical: 16, fontSize: 24, fontWeight: '800', letterSpacing: 6, color: colors.text,
    borderWidth: 1.5, borderColor: colors.borderStrong, marginBottom: 20,
  },
  btn: { alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: 15, ...shadow.lg },
  btnText: { color: colors.white, fontWeight: '800', fontSize: 15 },
});
