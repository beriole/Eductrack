import { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { api } from '@/src/lib/api';
import { colors, radius, spacing, shadow } from '@/src/theme';
import { SYSTEMES, niveauxFor, Systeme } from '@/src/lib/niveaux';

interface Matiere { id_matiere: string; nom: string; code: string; niveaux: string[]; }

const TYPES = [
  { key: 'officielle', label: 'Annale' },
  { key: 'simulation', label: 'Simulation' },
  { key: 'exercice', label: 'Exercice' },
] as const;

export default function ImporterAnnaleScreen() {
  const router = useRouter();
  const [matieres, setMatieres] = useState<Matiere[]>([]);
  const [fichier, setFichier] = useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const [corrige, setCorrige] = useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const [titre, setTitre] = useState('');
  const [systeme, setSysteme] = useState<Systeme>('francophone');
  const [type, setType] = useState<'officielle' | 'simulation' | 'exercice'>('officielle');
  const [idMatiere, setIdMatiere] = useState<string | null>(null);
  const [niveau, setNiveau] = useState('Tle');
  const [annee, setAnnee] = useState('');
  const [analyser, setAnalyser] = useState(false); // analyse IA = OPTION (off par défaut)
  const [uploading, setUploading] = useState(false);

  const niveaux = niveauxFor(systeme);
  const matieresNiveau = matieres.filter((m) => !m.niveaux?.length || m.niveaux.includes(niveau));

  const changerSysteme = (s: Systeme) => {
    setSysteme(s);
    setNiveau(niveauxFor(s)[0].v);
    setIdMatiere(null);
  };

  useEffect(() => {
    api.get('/matieres/')
      .then((res) => setMatieres(res.data.results ?? res.data))
      .catch(() => {});
  }, []);

  const choisirFichier = async () => {
    const res = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true });
    if (!res.canceled && res.assets?.length) {
      setFichier(res.assets[0]);
      if (!titre) setTitre(res.assets[0].name.replace(/\.pdf$/i, ''));
    }
  };

  const choisirCorrige = async () => {
    const res = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true });
    if (!res.canceled && res.assets?.length) setCorrige(res.assets[0]);
  };

  const importer = async () => {
    if (!fichier) return Alert.alert('Fichier manquant', 'Choisis le sujet (PDF) à importer.');
    if (!titre.trim() || !idMatiere) return Alert.alert('Champs requis', 'Renseigne le titre et la matière.');

    const form = new FormData();
    // En React Native, un fichier se passe sous forme { uri, name, type }.
    form.append('fichier', { uri: fichier.uri, name: fichier.name, type: 'application/pdf' } as any);
    if (corrige) form.append('corrige_pdf', { uri: corrige.uri, name: corrige.name, type: 'application/pdf' } as any);
    form.append('titre', titre.trim());
    form.append('id_matiere', idMatiere);
    form.append('niveau', niveau);
    form.append('type_epreuve', type);
    form.append('analyser', analyser ? 'true' : 'false');
    if (annee.trim()) form.append('annee', annee.trim());

    setUploading(true);
    try {
      const res = await api.post('/epreuves/importer-pdf/', form, { timeout: 90000 });
      const n = res.data.nb_questions_extraites ?? 0;
      const msg = analyser
        ? (n > 0
            ? `${n} question(s) extraite(s). L'épreuve « ${res.data.titre} » est disponible.`
            : `Aucune question extraite (PDF scanné ?), mais le sujet${corrige ? ' et son corrigé' : ''} reste(nt) consultable(s) en PDF.`)
        : `Sujet${corrige ? ' + corrigé' : ''} importé(s). « ${res.data.titre} » est disponible pour les élèves.`;
      Alert.alert('Import réussi', msg, [{ text: 'OK', onPress: () => router.back() }]);
    } catch (e: any) {
      const msg = e?.response?.data?.error ?? "L'import a échoué. Réessaie.";
      Alert.alert('Échec', msg);
    } finally {
      setUploading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backRow}>
          <Ionicons name="arrow-back" size={20} color={colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Importer une épreuve</Text>
          <Text style={styles.subtitle}>Sujet PDF (+ corrigé). L'analyse IA est optionnelle.</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {/* Sujet PDF */}
        <Text style={styles.label}>Sujet (PDF) *</Text>
        <TouchableOpacity style={styles.fileBtn} onPress={choisirFichier} activeOpacity={0.85}>
          <Ionicons name={fichier ? 'document-text' : 'cloud-upload-outline'} size={22} color={colors.primary} />
          <Text style={styles.fileBtnText} numberOfLines={1}>
            {fichier ? fichier.name : 'Choisir le sujet PDF'}
          </Text>
          {fichier && <Ionicons name="checkmark-circle" size={20} color={colors.success} />}
        </TouchableOpacity>

        {/* Corrigé PDF (optionnel) */}
        <Text style={styles.label}>Corrigé (PDF) — optionnel</Text>
        <TouchableOpacity style={styles.fileBtn} onPress={choisirCorrige} activeOpacity={0.85}>
          <Ionicons name={corrige ? 'document-text' : 'cloud-upload-outline'} size={22} color={colors.emerald} />
          <Text style={styles.fileBtnText} numberOfLines={1}>
            {corrige ? corrige.name : 'Ajouter le corrigé PDF'}
          </Text>
          {corrige
            ? <TouchableOpacity onPress={() => setCorrige(null)} hitSlop={8}><Ionicons name="close-circle" size={20} color={colors.textMuted} /></TouchableOpacity>
            : null}
        </TouchableOpacity>

        {/* Analyse IA (option) */}
        <TouchableOpacity style={[styles.analyseRow, analyser && styles.analyseRowActive]} onPress={() => setAnalyser((v) => !v)} activeOpacity={0.85}>
          <Ionicons name="sparkles" size={20} color={analyser ? colors.primary : colors.textLight} />
          <View style={{ flex: 1 }}>
            <Text style={styles.analyseTitle}>Analyser avec l'IA</Text>
            <Text style={styles.analyseSub}>Extrait des QCM jouables depuis le PDF (nécessite un PDF avec texte).</Text>
          </View>
          <View style={[styles.switch, analyser && styles.switchOn]}><View style={[styles.knob, analyser && styles.knobOn]} /></View>
        </TouchableOpacity>

        {/* Titre */}
        <Text style={styles.label}>Titre de l'épreuve</Text>
        <TextInput
          style={styles.input}
          placeholder="Ex. BAC Mathématiques 2023"
          placeholderTextColor={colors.textLight}
          value={titre}
          onChangeText={setTitre}
        />

        {/* Sous-système */}
        <Text style={styles.label}>Sous-système</Text>
        <View style={styles.chipsWrap}>
          {SYSTEMES.map((s) => (
            <TouchableOpacity
              key={s.key}
              style={[styles.chip, systeme === s.key && styles.chipActive]}
              onPress={() => changerSysteme(s.key)}
            >
              <Text style={[styles.chipText, systeme === s.key && styles.chipTextActive]}>{s.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Type d'épreuve */}
        <Text style={styles.label}>Type</Text>
        <View style={styles.chipsWrap}>
          {TYPES.map((t) => (
            <TouchableOpacity
              key={t.key}
              style={[styles.chip, type === t.key && styles.chipActive]}
              onPress={() => setType(t.key)}
            >
              <Text style={[styles.chipText, type === t.key && styles.chipTextActive]}>{t.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Niveau */}
        <Text style={styles.label}>Niveau</Text>
        <View style={styles.chipsWrap}>
          {niveaux.map((n) => (
            <TouchableOpacity
              key={n.v}
              style={[styles.chip, niveau === n.v && styles.chipActive]}
              onPress={() => { setNiveau(n.v); setIdMatiere(null); }}
            >
              <Text style={[styles.chipText, niveau === n.v && styles.chipTextActive]}>{n.l}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Matière (filtrée par niveau) */}
        <Text style={styles.label}>Matière</Text>
        <View style={styles.chipsWrap}>
          {matieresNiveau.map((m) => (
            <TouchableOpacity
              key={m.id_matiere}
              style={[styles.chip, idMatiere === m.id_matiere && styles.chipActive]}
              onPress={() => setIdMatiere(m.id_matiere)}
            >
              <Text style={[styles.chipText, idMatiere === m.id_matiere && styles.chipTextActive]}>{m.nom}</Text>
            </TouchableOpacity>
          ))}
          {matieres.length === 0 && <Text style={styles.muted}>Chargement des matières…</Text>}
          {matieres.length > 0 && matieresNiveau.length === 0 && (
            <Text style={styles.muted}>Aucune matière pour ce niveau.</Text>
          )}
        </View>

        {/* Année (optionnel) */}
        <Text style={styles.label}>Année (optionnel)</Text>
        <TextInput
          style={styles.input}
          placeholder="Ex. 2023"
          placeholderTextColor={colors.textLight}
          value={annee}
          onChangeText={setAnnee}
          keyboardType="number-pad"
          maxLength={4}
        />

        <TouchableOpacity style={[styles.submit, uploading && { opacity: 0.7 }]} onPress={importer} disabled={uploading} activeOpacity={0.85}>
          {uploading
            ? <><ActivityIndicator size="small" color={colors.white} /><Text style={styles.submitText}>{analyser ? 'Analyse du PDF…' : 'Import en cours…'}</Text></>
            : <><Ionicons name={analyser ? 'sparkles' : 'cloud-upload'} size={18} color={colors.white} /><Text style={styles.submitText}>{analyser ? 'Importer et analyser' : 'Importer le PDF'}</Text></>}
        </TouchableOpacity>

        <Text style={styles.hint}>
          Par défaut, le sujet (et le corrigé) sont importés tels quels et consultables par les élèves.
          Active « Analyser avec l'IA » pour transformer un PDF texte en QCM jouables — si l'extraction
          échoue (PDF scanné/image), le PDF reste quand même disponible.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: spacing.md, paddingTop: 56, paddingBottom: 12 },
  backRow: { width: 38, height: 38, borderRadius: 12, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', ...shadow.sm },
  title: { fontSize: 22, fontWeight: '800', color: colors.text, letterSpacing: -0.4 },
  subtitle: { fontSize: 13, color: colors.textMuted, marginTop: 1 },
  scroll: { padding: spacing.md },

  fileBtn: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface, borderRadius: radius.lg, padding: 16, borderWidth: 1.5, borderColor: colors.borderStrong, borderStyle: 'dashed', marginBottom: 18 },
  fileBtnText: { flex: 1, fontSize: 14, fontWeight: '700', color: colors.text },

  label: { fontSize: 13, fontWeight: '800', color: colors.textMuted, marginBottom: 8, marginTop: 6 },
  input: { backgroundColor: colors.surface, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: colors.text, borderWidth: 1, borderColor: colors.border, marginBottom: 12 },

  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.full, backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.border },
  chipActive: { backgroundColor: colors.primaryLight, borderColor: colors.primary },
  chipText: { fontSize: 13, fontWeight: '700', color: colors.textMuted },
  chipTextActive: { color: colors.primary },
  muted: { color: colors.textLight, fontSize: 13 },

  analyseRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface, borderRadius: radius.md, padding: 14, borderWidth: 1.5, borderColor: colors.border, marginTop: 6, marginBottom: 4 },
  analyseRowActive: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  analyseTitle: { fontSize: 14.5, fontWeight: '800', color: colors.text },
  analyseSub: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  switch: { width: 44, height: 26, borderRadius: 13, backgroundColor: colors.border, padding: 3, justifyContent: 'center' },
  switchOn: { backgroundColor: colors.primary },
  knob: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff' },
  knobOn: { alignSelf: 'flex-end' },
  submit: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: 15, marginTop: 12, ...shadow.lg },
  submitText: { color: colors.white, fontWeight: '800', fontSize: 15 },
  hint: { fontSize: 12, color: colors.textLight, lineHeight: 18, marginTop: 16 },
});
