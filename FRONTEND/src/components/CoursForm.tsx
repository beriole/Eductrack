import { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { api } from '@/src/lib/api';
import { colors, radius, spacing, shadow } from '@/src/theme';
import { SYSTEMES, niveauxFor, Systeme } from '@/src/lib/niveaux';

export interface CoursData {
  titre: string;
  contenu: string;
  niveau: string;
  serie: string | null;
  id_matiere: string;
  fichier?: { uri: string; name: string } | null;
}

interface Matiere { id_matiere: string; nom: string; code: string; niveaux: string[]; }

const SERIES = ['A1', 'A4', 'C', 'D', 'E', 'TI', 'G', 'Science', 'Arts', 'Commercial'];

const inferSysteme = (niv?: string): Systeme =>
  niv && /^(Form|LowerSixth|UpperSixth)/.test(niv) ? 'anglophone' : 'francophone';

export function CoursForm({
  initial, submitting, submitLabel, onSubmit,
}: {
  initial?: Partial<CoursData>;
  submitting: boolean;
  submitLabel: string;
  onSubmit: (data: CoursData) => void;
}) {
  const [matieres, setMatieres] = useState<Matiere[]>([]);
  const [systeme, setSysteme] = useState<Systeme>(inferSysteme(initial?.niveau));
  const [niveau, setNiveau] = useState(initial?.niveau ?? 'Tle');
  const niveaux = niveauxFor(systeme);
  const [serie, setSerie] = useState<string | null>(initial?.serie ?? null);
  const [idMatiere, setIdMatiere] = useState<string>(initial?.id_matiere ?? '');
  const [titre, setTitre] = useState(initial?.titre ?? '');
  const [contenu, setContenu] = useState(initial?.contenu ?? '');
  const [fichier, setFichier] = useState<{ uri: string; name: string } | null>(null);

  useEffect(() => {
    api.get('/matieres/').then((r) => setMatieres(r.data.results ?? r.data)).catch(() => {});
  }, []);

  const matieresNiveau = matieres.filter((m) => !m.niveaux?.length || m.niveaux.includes(niveau));

  const choisirPdf = async () => {
    const res = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true });
    if (!res.canceled && res.assets?.length) {
      const a = res.assets[0];
      setFichier({ uri: a.uri, name: a.name });
      if (!titre.trim()) setTitre(a.name.replace(/\.pdf$/i, ''));
    }
  };

  // Un cours est valide s'il a un titre, une matière, et SOIT du texte SOIT un PDF.
  const valide = titre.trim().length >= 3 && !!idMatiere && (contenu.trim().length >= 10 || !!fichier);

  const submit = () => {
    if (!valide) return;
    onSubmit({ titre: titre.trim(), contenu: contenu.trim(), niveau, serie, id_matiere: idMatiere, fichier });
  };

  return (
    <View>
      <Label>Sous-système</Label>
      <View style={styles.chipsWrap}>
        {SYSTEMES.map((s) => (
          <Chip
            key={s.key}
            label={s.label}
            active={systeme === s.key}
            onPress={() => { setSysteme(s.key); setNiveau(niveauxFor(s.key)[0].v); setIdMatiere(''); }}
          />
        ))}
      </View>

      <Label>Niveau</Label>
      <View style={styles.chipsWrap}>
        {niveaux.map((n) => (
          <Chip key={n.v} label={n.l} active={niveau === n.v} onPress={() => setNiveau(n.v)} />
        ))}
      </View>

      <Label>Matière</Label>
      <View style={styles.chipsWrap}>
        {matieresNiveau.map((m) => (
          <Chip key={m.id_matiere} label={m.nom} active={idMatiere === m.id_matiere} onPress={() => setIdMatiere(m.id_matiere)} />
        ))}
        {matieresNiveau.length === 0 && <Text style={styles.muted}>Aucune matière pour ce niveau.</Text>}
      </View>

      <Label>Série (optionnel)</Label>
      <View style={styles.chipsWrap}>
        <Chip label="Tronc commun" active={!serie} onPress={() => setSerie(null)} />
        {SERIES.map((s) => <Chip key={s} label={s} active={serie === s} onPress={() => setSerie(s)} />)}
      </View>

      <Label>Titre du cours</Label>
      <TextInput
        style={styles.input}
        placeholder="Ex. Les limites de fonctions"
        placeholderTextColor={colors.textLight}
        value={titre}
        onChangeText={setTitre}
      />

      <Label>{fichier ? 'Contenu (optionnel — PDF fourni)' : 'Contenu'}</Label>
      <TextInput
        style={[styles.input, styles.textarea]}
        placeholder="Rédige le cours : définitions, propriétés, exemples…"
        placeholderTextColor={colors.textLight}
        value={contenu}
        onChangeText={setContenu}
        multiline
        textAlignVertical="top"
      />

      <Label>Document PDF (optionnel)</Label>
      <TouchableOpacity style={styles.fileBtn} onPress={choisirPdf} activeOpacity={0.85}>
        <Ionicons name={fichier ? 'document-text' : 'cloud-upload-outline'} size={20} color={colors.primary} />
        <Text style={styles.fileBtnText} numberOfLines={1}>
          {fichier ? fichier.name : 'Joindre un cours en PDF'}
        </Text>
        {fichier ? (
          <TouchableOpacity onPress={() => setFichier(null)} hitSlop={10}>
            <Ionicons name="close-circle" size={20} color={colors.textLight} />
          </TouchableOpacity>
        ) : null}
      </TouchableOpacity>
      <Text style={styles.helper}>
        Tu peux publier un cours rédigé, un cours en PDF, ou les deux. L'élève pourra consulter le PDF dans l'application.
      </Text>

      <TouchableOpacity
        style={[styles.submit, (!valide || submitting) && { opacity: 0.5 }]}
        onPress={submit}
        disabled={!valide || submitting}
        activeOpacity={0.85}
      >
        {submitting
          ? <ActivityIndicator color={colors.white} size="small" />
          : <><Ionicons name="save-outline" size={18} color={colors.white} /><Text style={styles.submitText}>{submitLabel}</Text></>}
      </TouchableOpacity>
    </View>
  );
}

function Label({ children }: { children: string }) {
  return <Text style={styles.label}>{children}</Text>;
}
function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity style={[styles.chip, active && styles.chipActive]} onPress={onPress} activeOpacity={0.8}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}
const styles = StyleSheet.create({
  label: { fontSize: 13, fontWeight: '800', color: colors.textMuted, marginBottom: 8, marginTop: 14 },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.full, backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.border },
  chipActive: { backgroundColor: colors.primaryLight, borderColor: colors.primary },
  chipText: { fontSize: 13, fontWeight: '700', color: colors.textMuted },
  chipTextActive: { color: colors.primary },
  muted: { color: colors.textLight, fontSize: 13 },
  input: { backgroundColor: colors.surface, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: colors.text, borderWidth: 1, borderColor: colors.border },
  textarea: { minHeight: 160 },
  fileBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.surface, borderRadius: radius.md, padding: 14, borderWidth: 1.5, borderColor: colors.borderStrong, borderStyle: 'dashed' },
  fileBtnText: { flex: 1, fontSize: 14, fontWeight: '700', color: colors.text },
  helper: { fontSize: 12, color: colors.textLight, lineHeight: 17, marginTop: 8 },
  submit: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: 15, marginTop: 22, ...shadow.lg },
  submitText: { color: colors.white, fontWeight: '800', fontSize: 15 },
});
