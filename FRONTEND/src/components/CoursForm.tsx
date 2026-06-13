import { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '@/src/lib/api';
import { colors, radius, spacing, shadow } from '@/src/theme';

export interface CoursData {
  titre: string;
  contenu: string;
  niveau: string;
  serie: string | null;
  id_matiere: string;
}

interface Matiere { id_matiere: string; nom: string; code: string; niveaux: string[]; }

const NIVEAUX = ['6e', '5e', '4e', '3e', '2nde', '1ere', 'Tle'];
const SERIES = ['A1', 'A4', 'C', 'D', 'E', 'TI', 'G'];

export function CoursForm({
  initial, submitting, submitLabel, onSubmit,
}: {
  initial?: Partial<CoursData>;
  submitting: boolean;
  submitLabel: string;
  onSubmit: (data: CoursData) => void;
}) {
  const [matieres, setMatieres] = useState<Matiere[]>([]);
  const [niveau, setNiveau] = useState(initial?.niveau ?? 'Tle');
  const [serie, setSerie] = useState<string | null>(initial?.serie ?? null);
  const [idMatiere, setIdMatiere] = useState<string>(initial?.id_matiere ?? '');
  const [titre, setTitre] = useState(initial?.titre ?? '');
  const [contenu, setContenu] = useState(initial?.contenu ?? '');

  useEffect(() => {
    api.get('/matieres/').then((r) => setMatieres(r.data.results ?? r.data)).catch(() => {});
  }, []);

  const matieresNiveau = matieres.filter((m) => !m.niveaux?.length || m.niveaux.includes(niveau));

  const valide = titre.trim().length >= 3 && contenu.trim().length >= 10 && idMatiere;

  const submit = () => {
    if (!valide) return;
    onSubmit({ titre: titre.trim(), contenu: contenu.trim(), niveau, serie, id_matiere: idMatiere });
  };

  return (
    <View>
      <Label>Niveau</Label>
      <Chips items={NIVEAUX} value={niveau} onPick={(v) => setNiveau(v)} />

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

      <Label>Contenu</Label>
      <TextInput
        style={[styles.input, styles.textarea]}
        placeholder="Rédige le cours : définitions, propriétés, exemples…"
        placeholderTextColor={colors.textLight}
        value={contenu}
        onChangeText={setContenu}
        multiline
        textAlignVertical="top"
      />

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
function Chips({ items, value, onPick }: { items: string[]; value: string; onPick: (v: string) => void }) {
  return (
    <View style={styles.chipsWrap}>
      {items.map((it) => <Chip key={it} label={it} active={value === it} onPress={() => onPick(it)} />)}
    </View>
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
  submit: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: 15, marginTop: 22, ...shadow.lg },
  submitText: { color: colors.white, fontWeight: '800', fontSize: 15 },
});
