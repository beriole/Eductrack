import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '@/src/store/authStore';
import { colors } from '@/src/theme';

type IconName = keyof typeof Ionicons.glyphMap;

export default function TabsLayout() {
  const { user } = useAuthStore();
  const role = user?.role;
  const isEleve = role === 'eleve';
  const isEns = role === 'enseignant';
  const isParent = role === 'parent';

  // On garde TOUS les écrans enregistrés en permanence (jamais de href:null
  // dynamique, sinon React plante « rendered fewer hooks »). On masque
  // seulement le bouton d'onglet selon le rôle.
  const show = (visible: boolean) => (visible ? undefined : ({ display: 'none' } as const));

  const icon = (name: IconName) =>
    ({ color, focused }: { color: string; focused: boolean }) =>
      <Ionicons name={focused ? name : (`${name}-outline` as IconName)} size={22} color={color} />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textLight,
        tabBarStyle: {
          height: 62, paddingBottom: 9, paddingTop: 8,
          backgroundColor: colors.surface, borderTopColor: colors.border, borderTopWidth: 1,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}
    >
      {/* Commun à tous */}
      <Tabs.Screen name="dashboard" options={{ title: 'Accueil', tabBarIcon: icon('home') }} />

      {/* Élève */}
      <Tabs.Screen name="matieres" options={{ title: 'Cours', tabBarIcon: icon('book'), tabBarItemStyle: show(isEleve) }} />
      <Tabs.Screen name="examens" options={{ title: 'Examens', tabBarIcon: icon('create'), tabBarItemStyle: show(isEleve) }} />
      <Tabs.Screen name="chatbot" options={{ title: 'EduBot', tabBarIcon: icon('chatbubbles'), tabBarItemStyle: show(isEleve) }} />
      <Tabs.Screen name="classement" options={{ title: 'Top', tabBarIcon: icon('trophy'), tabBarItemStyle: show(isEleve || isParent) }} />

      {/* Enseignant — modules en onglets */}
      <Tabs.Screen name="ens-cours" options={{ title: 'Cours', tabBarIcon: icon('library'), tabBarItemStyle: show(isEns) }} />
      <Tabs.Screen name="ens-exercices" options={{ title: 'Exercices', tabBarIcon: icon('barbell'), tabBarItemStyle: show(isEns) }} />
      <Tabs.Screen name="ens-examens" options={{ title: 'Examens', tabBarIcon: icon('documents'), tabBarItemStyle: show(isEns) }} />

      {/* Commun à tous */}
      <Tabs.Screen name="profil" options={{ title: 'Profil', tabBarIcon: icon('person') }} />
    </Tabs>
  );
}
