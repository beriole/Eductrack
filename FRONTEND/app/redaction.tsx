import { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '@/src/lib/api';

type IoniconName = keyof typeof Ionicons.glyphMap;

interface Resultat {
  score: number;
  appreciation: string;
  type_exercice: string;
  ia_disponible: boolean;
  statistiques: {
    nb_mots: number;
    nb_phrases: number;
    nb_paragraphes: number;
    longueur_moyenne_phrase: number;
    diversite_lexicale: number;
    connecteurs_utilises: string[];
  };
  points_forts: string[];
  suggestions: string[];
}

const TYPES: { code: string; label: string; icone: IoniconName }[] = [
  { code: 'dissertation', label: 'Dissertation', icone: 'document-text-outline' },
  { code: 'commentaire', label: 'Commentaire', icone: 'chatbox-ellipses-outline' },
  { code: 'resume', label: 'Résumé', icone: 'reader-outline' },
  { code: 'redaction', label: 'Rédaction', icone: 'create-outline' },
];

function scoreColor(score: number): string {
  if (score >= 80) return '#10B981';
  if (score >= 60) return '#3B82F6';
  if (score >= 40) return '#F59E0B';
  return '#EF4444';
}

export default function RedactionScreen() {
  const router = useRouter();
  const [type, setType] = useState('redaction');
  const [texte, setTexte] = useState('');
  const [loading, setLoading] = useState(false);
  const [resultat, setResultat] = useState<Resultat | null>(null);

  const analyser = async () => {
    if (texte.trim().length < 20) return;
    setLoading(true);
    setResultat(null);
    try {
      const res = await api.post('/redaction/analyser/', {
        texte: texte.trim(),
        type_exercice: type,
      });
      setResultat(res.data);
    } catch {
    } finally {
      setLoading(false);
    }
  };

  const recommencer = () => {
    setResultat(null);
    setTexte('');
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backRow}>
            <Ionicons name="arrow-back" size={18} color="#93C5FD" />
            <Text style={styles.backText}>Retour</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Atelier Rédaction</Text>
          <Text style={styles.subtitle}>Soumets ton texte et reçois un score d'expression</Text>
        </View>

        {!resultat ? (
          <View style={styles.content}>
            <Text style={styles.label}>Type d'exercice</Text>
            <View style={styles.typeRow}>
              {TYPES.map((tp) => (
                <TouchableOpacity
                  key={tp.code}
                  style={[styles.typeBtn, type === tp.code && styles.typeBtnActive]}
                  onPress={() => setType(tp.code)}
                >
                  <Ionicons name={tp.icone} size={22} color={type === tp.code ? '#6C63FF' : '#6B7280'} style={styles.typeIcon} />
                  <Text style={[styles.typeLabel, type === tp.code && styles.typeLabelActive]}>
                    {tp.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.label}>Ton texte</Text>
            <TextInput
              style={styles.textarea}
              value={texte}
              onChangeText={setTexte}
              placeholder="Rédige ton texte ici…"
              multiline
              textAlignVertical="top"
            />
            <Text style={styles.counter}>{texte.trim().split(/\s+/).filter(Boolean).length} mots</Text>

            <TouchableOpacity
              style={[styles.submitBtn, (texte.trim().length < 20 || loading) && styles.submitBtnDisabled]}
              onPress={analyser}
              disabled={texte.trim().length < 20 || loading}
            >
              {loading
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.submitText}>Analyser mon texte</Text>}
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.content}>
            {/* Score */}
            <View style={[styles.scoreCircle, { borderColor: scoreColor(resultat.score) }]}>
              <Text style={[styles.scoreValue, { color: scoreColor(resultat.score) }]}>
                {resultat.score}
              </Text>
              <Text style={styles.scoreMax}>/ 100</Text>
            </View>
            <Text style={styles.appreciation}>{resultat.appreciation}</Text>

            {/* Statistiques */}
            <View style={styles.statsCard}>
              <Stat label="Mots" value={resultat.statistiques.nb_mots} />
              <Stat label="Phrases" value={resultat.statistiques.nb_phrases} />
              <Stat label="Paragraphes" value={resultat.statistiques.nb_paragraphes} />
              <Stat label="Diversité" value={`${resultat.statistiques.diversite_lexicale}%`} />
            </View>

            {/* Points forts */}
            {resultat.points_forts.length > 0 && (
              <View style={styles.block}>
                <View style={styles.blockTitleRow}>
                  <Ionicons name="checkmark-circle" size={16} color="#10B981" />
                  <Text style={[styles.blockTitle, { color: '#10B981', marginBottom: 0 }]}>Points forts</Text>
                </View>
                {resultat.points_forts.map((p, i) => (
                  <Text key={i} style={styles.item}>• {p}</Text>
                ))}
              </View>
            )}

            {/* Suggestions */}
            {resultat.suggestions.length > 0 && (
              <View style={styles.block}>
                <View style={styles.blockTitleRow}>
                  <Ionicons name="bulb" size={16} color="#F59E0B" />
                  <Text style={[styles.blockTitle, { color: '#F59E0B', marginBottom: 0 }]}>À améliorer</Text>
                </View>
                {resultat.suggestions.map((s, i) => (
                  <Text key={i} style={styles.item}>• {s}</Text>
                ))}
              </View>
            )}

            <TouchableOpacity style={styles.submitBtn} onPress={recommencer}>
              <Text style={styles.submitText}>Écrire un nouveau texte</Text>
            </TouchableOpacity>
          </View>
        )}
        <View style={{ height: 40 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const PRIMARY = '#1E3A5F';
const ACCENT = '#6C63FF';

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  header: { backgroundColor: PRIMARY, paddingTop: 56, paddingBottom: 20, paddingHorizontal: 20 },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 12 },
  backText: { color: '#93C5FD', fontWeight: '600', fontSize: 14 },
  title: { fontSize: 22, fontWeight: '800', color: '#fff' },
  subtitle: { fontSize: 12, color: '#93C5FD', marginTop: 4 },
  content: { padding: 16 },
  label: { fontSize: 14, fontWeight: '700', color: PRIMARY, marginBottom: 8, marginTop: 8 },
  typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  typeBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, borderWidth: 1.5, borderColor: '#E5E7EB', backgroundColor: '#fff' },
  typeBtnActive: { borderColor: ACCENT, backgroundColor: `${ACCENT}12` },
  typeIcon: { marginBottom: 2 },
  typeLabel: { fontSize: 13, fontWeight: '600', color: '#6B7280' },
  typeLabelActive: { color: ACCENT },
  textarea: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, padding: 14, fontSize: 15, color: '#111827', minHeight: 200 },
  counter: { textAlign: 'right', fontSize: 12, color: '#9CA3AF', marginTop: 6 },
  submitBtn: { backgroundColor: ACCENT, borderRadius: 12, paddingVertical: 15, alignItems: 'center', marginTop: 16 },
  submitBtnDisabled: { backgroundColor: '#C7C5E8' },
  submitText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  scoreCircle: { alignSelf: 'center', width: 120, height: 120, borderRadius: 60, borderWidth: 6, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff', marginVertical: 12 },
  scoreValue: { fontSize: 40, fontWeight: '800' },
  scoreMax: { fontSize: 12, color: '#9CA3AF' },
  appreciation: { textAlign: 'center', fontSize: 15, color: PRIMARY, fontWeight: '600', marginBottom: 16, paddingHorizontal: 12 },
  statsCard: { flexDirection: 'row', backgroundColor: '#fff', borderRadius: 14, padding: 16, justifyContent: 'space-around', elevation: 1, marginBottom: 16 },
  stat: { alignItems: 'center' },
  statValue: { fontSize: 20, fontWeight: '800', color: ACCENT },
  statLabel: { fontSize: 11, color: '#6B7280', marginTop: 2 },
  block: { backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 12, elevation: 1 },
  blockTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  blockTitle: { fontSize: 14, fontWeight: '800', marginBottom: 8 },
  item: { fontSize: 13, color: '#374151', marginBottom: 6, lineHeight: 19 },
});
