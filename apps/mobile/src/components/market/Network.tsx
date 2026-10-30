import { ChevronDown } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';
import { transition } from '../../lib/motion';
import { colors, radius, tint } from '../../lib/theme';
import { Text } from '../Text';

/** The network selector. Sift runs on Solana devnet only until its security audit. */
export function NetworkChip({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Network: Solana devnet"
      // 36 tall to keep the header compact; the slop makes the target 44.
      hitSlop={4}
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
        styles.chip,
        (pressed || hovered) && { backgroundColor: colors.surface2 },
        transition,
      ]}
    >
      <SolanaMark size={12} />
      <Text style={styles.text}>Solana</Text>
      <View style={styles.devnet}>
        <Text style={styles.devnetText}>DEVNET</Text>
      </View>
      <ChevronDown size={13} color={colors.muted} strokeWidth={2} />
    </Pressable>
  );
}

/** Three slanted bars, Solana's mark, drawn plainly (no logo artwork). */
export function SolanaMark({ size = 14 }: { size?: number }) {
  return (
    <View
      style={{ width: size, height: size, justifyContent: 'space-between', paddingVertical: 1 }}
    >
      {[0, 1, 2].map((i) => (
        <View
          key={i}
          style={{
            height: Math.max(2, size / 6),
            borderRadius: 1,
            backgroundColor: colors.accent,
            transform: [{ skewX: '-20deg' }],
          }}
        />
      ))}
    </View>
  );
}

export function NetworkNote() {
  return (
    <View style={styles.note}>
      <View style={styles.option}>
        <SolanaMark size={18} />
        <View style={{ flex: 1 }}>
          <Text style={styles.optionTitle}>Solana devnet</Text>
          <Text style={styles.optionSub}>Test network with free test SOL. No real value.</Text>
        </View>
        <Text style={styles.selected}>Selected</Text>
      </View>
      <Text style={styles.optionSub}>
        Mainnet comes after an external security audit. Other networks aren’t supported.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 36,
    paddingHorizontal: 10,
    borderRadius: radius.chip,
    backgroundColor: colors.surface,
  },
  text: { fontSize: 13, fontWeight: '600' },
  devnet: {
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: tint(colors.caution, 0.12),
  },
  devnetText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.6, color: colors.caution },
  note: { gap: 12 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: radius.input,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  optionTitle: { fontSize: 15, fontWeight: '600' },
  optionSub: { fontSize: 13, color: colors.muted, marginTop: 2 },
  selected: { fontSize: 12, fontWeight: '600', color: colors.accent },
});
