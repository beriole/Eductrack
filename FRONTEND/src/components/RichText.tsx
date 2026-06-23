import { Text, View, StyleSheet } from 'react-native';
import { colors } from '@/src/theme';

/**
 * Rendu Markdown léger + maths, SANS WebView (performant sur entrée de gamme).
 * Gère : #/##/### titres, listes -/•/1., **gras**, `code`, et nettoie les
 * délimiteurs LaTeX ($...$) pour rester lisible.
 */
function inline(text: string, keyBase: string) {
  // Retire les délimiteurs maths $...$ / $$...$$ (on garde le contenu).
  const clean = text.replace(/\$\$([^$]+)\$\$/g, '$1').replace(/\$([^$]+)\$/g, '$1');
  // Découpe sur **gras** et `code`.
  return clean.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean).map((p, i) => {
    if (p.startsWith('**') && p.endsWith('**')) {
      return <Text key={`${keyBase}-${i}`} style={styles.bold}>{p.slice(2, -2)}</Text>;
    }
    if (p.startsWith('`') && p.endsWith('`')) {
      return <Text key={`${keyBase}-${i}`} style={styles.code}>{p.slice(1, -1)}</Text>;
    }
    return <Text key={`${keyBase}-${i}`}>{p}</Text>;
  });
}

export function RichText({ text, color = colors.text, size = 15 }: { text: string; color?: string; size?: number }) {
  const lines = (text || '').replace(/\r/g, '').split('\n');
  return (
    <View>
      {lines.map((raw, idx) => {
        const line = raw.trim();
        const key = `l-${idx}`;
        if (!line) return <View key={key} style={{ height: 6 }} />;
        if (line.startsWith('### ')) return <Text key={key} style={[styles.h3, { color }]}>{inline(line.slice(4), key)}</Text>;
        if (line.startsWith('## ')) return <Text key={key} style={[styles.h2, { color }]}>{inline(line.slice(3), key)}</Text>;
        if (line.startsWith('# ')) return <Text key={key} style={[styles.h1, { color }]}>{inline(line.slice(2), key)}</Text>;
        const bullet = line.match(/^[-•*]\s+(.*)/);
        if (bullet) return (
          <View key={key} style={styles.bulletRow}>
            <Text style={[styles.bulletDot, { color }]}>•</Text>
            <Text style={[styles.body, { color, fontSize: size }]}>{inline(bullet[1], key)}</Text>
          </View>
        );
        const num = line.match(/^(\d+)[.)]\s+(.*)/);
        if (num) return (
          <View key={key} style={styles.bulletRow}>
            <Text style={[styles.bulletDot, { color, fontWeight: '800' }]}>{num[1]}.</Text>
            <Text style={[styles.body, { color, fontSize: size }]}>{inline(num[2], key)}</Text>
          </View>
        );
        return <Text key={key} style={[styles.body, { color, fontSize: size }]}>{inline(line, key)}</Text>;
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  body: { lineHeight: 22 },
  bold: { fontWeight: '800' },
  code: { backgroundColor: colors.surfaceAlt, color: colors.primary },
  h1: { fontSize: 19, fontWeight: '900', marginVertical: 4 },
  h2: { fontSize: 17, fontWeight: '800', marginTop: 8, marginBottom: 4 },
  h3: { fontSize: 15, fontWeight: '800', marginTop: 6, marginBottom: 2 },
  bulletRow: { flexDirection: 'row', gap: 8, marginBottom: 4 },
  bulletDot: { fontSize: 15, lineHeight: 22 },
});
