import { useRef, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/src/store/authStore';
import { colors, radius, shadow } from '@/src/theme';

const { width } = Dimensions.get('window');

type Slide = {
  id: string;
  icon: keyof typeof Ionicons.glyphMap;
  tint: string;
  title: string;
  subtitle: string;
};

const SLIDES: Slide[] = [
  {
    id: '1', icon: 'school', tint: colors.primary,
    title: 'Bienvenue sur SmartSchool',
    subtitle: "La plateforme d'excellence scolaire pour les élèves camerounais. Prépare ton BAC avec les meilleures ressources.",
  },
  {
    id: '2', icon: 'library', tint: colors.accent,
    title: 'Apprends à ton rythme',
    subtitle: 'Épreuves officielles, cours interactifs, assistant IA, planning hebdomadaire et sessions Focus Pomodoro.',
  },
  {
    id: '3', icon: 'rocket', tint: colors.emerald,
    title: 'Trouve ta voie',
    subtitle: 'Teste tes aptitudes, détecte tes lacunes et reçois une orientation de série et de filière adaptée à ton profil.',
  },
];

export default function OnboardingScreen() {
  const router = useRouter();
  const [activeIndex, setActiveIndex] = useState(0);
  const flatListRef = useRef<FlatList>(null);
  const setOnboardingSeen = useAuthStore((s) => s.setOnboardingSeen);

  const goNext = () => {
    if (activeIndex < SLIDES.length - 1) {
      const next = activeIndex + 1;
      flatListRef.current?.scrollToIndex({ index: next, animated: true });
      setActiveIndex(next);
    } else {
      finish();
    }
  };

  const finish = async () => {
    await setOnboardingSeen();
    router.replace('/(auth)/login');
  };

  const isLast = activeIndex === SLIDES.length - 1;
  const tint = SLIDES[activeIndex].tint;

  return (
    <View style={styles.container}>
      <FlatList
        ref={flatListRef}
        data={SLIDES}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={(item) => item.id}
        scrollEnabled={false}
        renderItem={({ item }) => (
          <View style={styles.slide}>
            <View style={[styles.iconWrap, { backgroundColor: `${item.tint}14` }]}>
              <Ionicons name={item.icon} size={64} color={item.tint} />
            </View>
            <Text style={styles.slideTitle}>{item.title}</Text>
            <Text style={styles.slideSubtitle}>{item.subtitle}</Text>
          </View>
        )}
      />

      <View style={styles.dots}>
        {SLIDES.map((_, i) => (
          <View key={i} style={[styles.dot, i === activeIndex && { width: 28, backgroundColor: tint }]} />
        ))}
      </View>

      <View style={styles.actions}>
        <TouchableOpacity onPress={finish} style={styles.skipBtn} hitSlop={8}>
          <Text style={styles.skipText}>{isLast ? '' : 'Passer'}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={goNext} activeOpacity={0.9} style={[styles.nextBtn, { backgroundColor: tint }]}>
          <Text style={styles.nextText}>{isLast ? 'Commencer' : 'Suivant'}</Text>
          <Ionicons name="arrow-forward" size={20} color={colors.white} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  slide: { width, paddingHorizontal: 36, paddingTop: 150, alignItems: 'center' },
  iconWrap: {
    width: 136, height: 136, borderRadius: 44, marginBottom: 48,
    alignItems: 'center', justifyContent: 'center',
  },
  slideTitle: { fontSize: 28, fontWeight: '800', color: colors.text, textAlign: 'center', marginBottom: 16, letterSpacing: -0.5 },
  slideSubtitle: { fontSize: 16, color: colors.textMuted, textAlign: 'center', lineHeight: 25 },
  dots: { flexDirection: 'row', justifyContent: 'center', paddingBottom: 24, gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.borderStrong },
  actions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 28, paddingBottom: 48 },
  skipBtn: { paddingVertical: 14, paddingHorizontal: 8, minWidth: 80 },
  skipText: { color: colors.textMuted, fontWeight: '600', fontSize: 15 },
  nextBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderRadius: radius.full, paddingVertical: 15, paddingHorizontal: 30, ...shadow.lg,
  },
  nextText: { color: colors.white, fontWeight: '800', fontSize: 16 },
});
