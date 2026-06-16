import { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuthStore } from '@/src/store/authStore';
import { useI18n } from '@/src/i18n/useI18n';

const queryClient = new QueryClient();

function RootLayoutNav() {
  const { isAuthenticated, isLoading, loadUser, user, hasSeenOnboarding, loadOnboarding } = useAuthStore();
  const { loadLang } = useI18n();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    loadLang();
    loadUser();
    loadOnboarding();
  }, []);

  // Aligne la langue de l'app sur la préférence du compte une fois chargé.
  useEffect(() => {
    if (user?.langue === 'fr' || user?.langue === 'en') {
      useI18n.setState({ lang: user.langue });
    }
  }, [user?.langue]);

  useEffect(() => {
    // Attendre que l'auth ET l'onboarding soient chargés depuis le stockage.
    if (isLoading || hasSeenOnboarding === null) return;
    const inAuthGroup = segments[0] === '(auth)';
    const inOnboarding = segments[0] === 'onboarding';

    if (isAuthenticated) {
      // Connecté : sortir des écrans d'auth/onboarding vers le dashboard.
      if (inAuthGroup || inOnboarding) router.replace('/(tabs)/dashboard');
    } else if (!hasSeenOnboarding) {
      if (!inOnboarding) router.replace('/onboarding');
    } else if (!inAuthGroup) {
      router.replace('/(auth)/login');
    }
  }, [isAuthenticated, isLoading, segments, hasSeenOnboarding]);

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="cours/[id]" />
      <Stack.Screen name="sessions/nouvelle" />
      <Stack.Screen name="sessions/resultat" />
      <Stack.Screen name="notifications" />
      <Stack.Screen name="focus" />
      <Stack.Screen name="parent/dashboard" />
      <Stack.Screen name="parent/enfant/[id]" />
      <Stack.Screen name="abonnement" />
      <Stack.Screen name="planning" />
      <Stack.Screen name="diagnostic" />
      <Stack.Screen name="orientation" />
      <Stack.Screen name="enseignant/dashboard" />
      <Stack.Screen name="onboarding" />
      <Stack.Screen name="redaction" />
      <Stack.Screen name="concours" />
      <Stack.Screen name="verify-email" />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <RootLayoutNav />
    </QueryClientProvider>
  );
}
