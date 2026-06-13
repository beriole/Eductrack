import { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '@/src/lib/api';
import { useAuthStore } from '@/src/store/authStore';

export default function VerifyEmailScreen() {
  const { token, uid } = useLocalSearchParams<{ token?: string; uid?: string }>();
  const router = useRouter();
  const { refreshUser } = useAuthStore();

  const [status, setStatus] = useState<'idle' | 'verifying' | 'success' | 'error'>('idle');
  const [resendLoading, setResendLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  // Vérification automatique si token présent dans l'URL (deep link)
  useEffect(() => {
    if (token && uid) {
      verifyEmail();
    }
  }, [token, uid]);

  // Compte à rebours après renvoi
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  const verifyEmail = async () => {
    setStatus('verifying');
    try {
      await api.post('/auth/email/verify/', { uid, token });
      setStatus('success');
      await refreshUser();
    } catch {
      setStatus('error');
    }
  };

  const handleResend = async () => {
    const user = useAuthStore.getState().user;
    if (!user) return;

    setResendLoading(true);
    try {
      await api.post('/auth/email/resend/', { email: user.email });
      setResendCooldown(60);
      Alert.alert('Email envoyé', 'Vérifiez votre boîte mail.');
    } catch (error: any) {
      const msg = error?.response?.data?.error ?? 'Impossible d\'envoyer l\'email.';
      Alert.alert('Erreur', msg);
    } finally {
      setResendLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      {status === 'verifying' ? (
        <>
          <ActivityIndicator size="large" color="#6C63FF" />
          <Text style={styles.text}>Vérification en cours…</Text>
        </>
      ) : status === 'success' ? (
        <>
          <Ionicons name="checkmark-circle" size={72} color="#10B981" style={styles.icon} />
          <Text style={styles.title}>Email vérifié !</Text>
          <Text style={styles.text}>Votre compte est maintenant actif.</Text>
          <TouchableOpacity style={styles.button} onPress={() => router.replace('/(tabs)/dashboard')}>
            <Text style={styles.buttonText}>Accéder au tableau de bord</Text>
          </TouchableOpacity>
        </>
      ) : status === 'error' ? (
        <>
          <Ionicons name="close-circle" size={72} color="#EF4444" style={styles.icon} />
          <Text style={styles.title}>Lien invalide</Text>
          <Text style={styles.text}>Ce lien a expiré ou est incorrect.</Text>
          <TouchableOpacity
            style={styles.button}
            onPress={handleResend}
            disabled={resendLoading || resendCooldown > 0}
          >
            {resendLoading
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.buttonText}>
                  {resendCooldown > 0 ? `Renvoyer dans ${resendCooldown}s` : 'Renvoyer le lien'}
                </Text>
            }
          </TouchableOpacity>
        </>
      ) : (
        <>
          <Ionicons name="mail" size={72} color="#6C63FF" style={styles.icon} />
          <Text style={styles.title}>Vérifiez votre email</Text>
          <Text style={styles.text}>
            Un lien de vérification vous a été envoyé.{'\n'}
            Cliquez dessus pour activer votre compte.
          </Text>
          <TouchableOpacity
            style={styles.button}
            onPress={handleResend}
            disabled={resendLoading || resendCooldown > 0}
          >
            {resendLoading
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.buttonText}>
                  {resendCooldown > 0 ? `Renvoyer dans ${resendCooldown}s` : 'Renvoyer l\'email'}
                </Text>
            }
          </TouchableOpacity>
          <TouchableOpacity style={styles.skipBtn} onPress={() => router.replace('/(tabs)/dashboard')}>
            <Text style={styles.skipText}>Ignorer pour l'instant</Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 },
  icon: { fontSize: 64, marginBottom: 16 },
  title: { fontSize: 24, fontWeight: '800', color: '#1E3A5F', marginBottom: 12, textAlign: 'center' },
  text: { fontSize: 15, color: '#6B7280', textAlign: 'center', lineHeight: 22, marginBottom: 32 },
  button: {
    backgroundColor: '#6C63FF', borderRadius: 12,
    paddingVertical: 14, paddingHorizontal: 32, alignItems: 'center',
  },
  buttonText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  skipBtn: { marginTop: 16 },
  skipText: { color: '#9CA3AF', fontSize: 14 },
});
