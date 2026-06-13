import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { Redirect } from 'expo-router';
import { useAuthStore } from '@/src/store/authStore';
import { colors } from '@/src/theme';

/**
 * Route racine "/" : aiguille l'utilisateur selon son état
 * (onboarding non vu → onboarding, non connecté → login, connecté → dashboard).
 * Évite l'écran "Unmatched Route" au démarrage / deep-link.
 */
export default function Index() {
  const { isAuthenticated, isLoading, hasSeenOnboarding } = useAuthStore();

  if (isLoading || hasSeenOnboarding === null) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (isAuthenticated) return <Redirect href="/(tabs)/dashboard" />;
  if (!hasSeenOnboarding) return <Redirect href="/onboarding" />;
  return <Redirect href="/(auth)/login" />;
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.bg },
});
