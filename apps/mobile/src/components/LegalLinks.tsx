import { Linking, Pressable, StyleSheet, View } from 'react-native';
import { apiUrl } from '../lib/api';
import { colors } from '../lib/theme';
import { Text } from './Text';

const LINKS = [
  ['Privacy', '/privacy'],
  ['Terms', '/terms'],
  ['Support', '/support'],
] as const;

/** Privacy policy, terms and support (pages on Sift's server), opened in the browser. */
export function LegalLinks() {
  return (
    <View style={styles.row}>
      {LINKS.map(([label, path], i) => (
        <View key={path} style={styles.item}>
          {i > 0 ? <Text style={styles.dot}>·</Text> : null}
          <Pressable
            onPress={() => void Linking.openURL(apiUrl(path)).catch(() => {})}
            accessibilityRole="link"
            hitSlop={12}
            style={styles.link}
          >
            <Text style={styles.text}>{label}</Text>
          </Pressable>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 8 },
  item: { flexDirection: 'row', alignItems: 'center' },
  link: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 },
  text: { fontSize: 13, color: colors.muted },
  dot: { fontSize: 13, color: colors.faint },
});
