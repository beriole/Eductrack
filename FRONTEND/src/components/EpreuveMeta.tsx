import { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { api } from '@/src/lib/api';
import { colors, radius } from '@/src/theme';

export interface Meta { titre: string; niveau: string; serie: string | null; id_matiere: string; }
interface Matiere { id_matiere: string; nom: string; niveaux: string[]; }

const NIVEAUX = ['6e', '5e', '4e', '3e', '2nde', '1ere', 'Tle'];
const SERIES = ['A1', 'A4', 'C', 'D', 'E', 'TI', 'G'];

export function EpreuveMeta({ value, onChange }: { value: Meta; onChange: (m: Meta) => void }) {
  const [matieres, setMatieres] = useState<Matiere[]>([]);
  useEffect(() => {
    api.get('/matieres/').then((r) => setMatieres(r.data.results ?? r.data)).catch(() => {});
  }, []);
  const set = (patch: Partial<Meta>) => onChange({ ...value, ...patch });
  const matieresNiveau = matieres
    .filter((m) => !m.nom?.includes('déprécié'))
    .filter((m) => !m.niveaux?.length || m.niveaux.includes(value.niveau));

  return (
    <View>
      <Label>Niveau</Label>
      <Chips items={NIVEAUX} active={value.niveau} onPick={(v) => set({ niveau: v })} />

      <Label>Matière</Label>
      <View style={styles.wrap}>
        {matieresNiveau.map((m) => (
          <Chip key={m.id_matiere} label={m.nom} active={value.id_matiere === m.id_matiere} onPress={() => set({ id_matiere: m.id_matiere })} />
        ))}
        {matieresNiveau.length === 0 && <Text style={styles.muted}>Aucune matière pour ce niveau.</Text>}
      </View>

      <Label>Série (optionnel)</Label>
      <View style={styles.wrap}>
        <Chip label="Tronc commun" active={!value.serie} onPress={() => set({ serie: null })} />
        {SERIES.map((s) => <Chip key={s} label={s} active={value.serie === s} onPress={() => set({ serie: s })} />)}
      </View>

      <Label>Titre</Label>
      <TextInput
        style={styles.input}
        placeholder="Ex. Exercices sur les dérivées"
        placeholderTextColor={colors.textLight}
        value={value.titre}
        onChangeText={(t) => set({ titre: t })}
      />
    </View>
  );
}

const Label = ({ children }: { children: string }) => <Text style={styles.label}>{children}</Text>;
const Chip = ({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) => (
  <TouchableOpacity style={[styles.chip, active && styles.chipActive]} onPress={onPress} activeOpacity={0.8}>
    <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
  </TouchableOpacity>
);
const Chips = ({ items, active, onPick }: { items: string[]; active: string; onPick: (v: string) => void }) => (
  <View style={styles.wrap}>{items.map((it) => <Chip key={it} label={it} active={active === it} onPress={() => onPick(it)} />)}</View>
);

const styles = StyleSheet.create({
  label: { fontSize: 13, fontWeight: '800', color: colors.textMuted, marginBottom: 8, marginTop: 14 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.full, backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.border },
  chipActive: { backgroundColor: colors.primaryLight, borderColor: colors.primary },
  chipText: { fontSize: 13, fontWeight: '700', color: colors.textMuted },
  chipTextActive: { color: colors.primary },
  muted: { color: colors.textLight, fontSize: 13 },
  input: { backgroundColor: colors.surface, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: colors.text, borderWidth: 1, borderColor: colors.border },
});
