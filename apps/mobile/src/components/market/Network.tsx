import { ChevronDown } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';
import { transition } from '../../lib/motion';
import { colors, radius, tint } from '../../lib/theme';
import { Text } from '../Text';
import { useNetwork } from '../../lib/network';

/** The network selector: the Solana mark, "Solana" and a chevron. DEVNET is its own pill. */
export function NetworkChip({ onPress }: { onPress: () => void }) {
  const { isDevnet } = useNetwork();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={isDevnet ? 'Network: Solana devnet' : 'Network: Solana'}
      // 40 tall to keep the header compact; the slop makes the target 44.
      hitSlop={2}
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
        styles.chip,
        (pressed || hovered) && { backgroundColor: colors.surface2 },
        transition,
      ]}
    >
      <SolanaMark size={16} />
      <Text style={styles.text}>Solana</Text>
      <ChevronDown size={16} color={colors.text} strokeWidth={2} />
    </Pressable>
  );
}

/**
 * The network badge: DEVNET while Sift runs on test SOL. `soft` is the green phone pill,
 * otherwise amber, as on the desktop header.
 */
export function DevnetPill({ soft = false }: { soft?: boolean }) {
  const { isDevnet } = useNetwork();
  if (!isDevnet) return null;
  return (
    <View
      style={[styles.pill, soft ? styles.pillSoft : styles.pillAmber]}
      accessibilityLabel="Devnet: test network, test SOL only"
    >
      <Text style={[styles.pillText, { color: soft ? colors.accent : '#5B3A00' }]}>
        {soft ? 'Devnet' : 'DEVNET'}
      </Text>
    </View>
  );
}

/** Solana's mark: three slanted bars in its purple-to-green gradient. */
export function SolanaMark({ size = 14 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20" accessibilityElementsHidden>
      <Defs>
        <LinearGradient id="sol" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#9945FF" />
          <Stop offset="1" stopColor="#14F195" />
        </LinearGradient>
      </Defs>
      {[2, 8.5, 15].map((y, i) => (
        <Path
          key={y}
          d={i === 1 ? `M4 ${y} H19 L16 ${y + 3.4} H1 Z` : `M1 ${y} H16 L19 ${y + 3.4} H4 Z`}
          fill="url(#sol)"
        />
      ))}
    </Svg>
  );
}

export function NetworkNote() {
  const { isMainnet } = useNetwork();
  if (isMainnet)
    return (
      <View style={styles.note}>
        <View style={styles.option}>
          <SolanaMark size={18} />
          <View style={{ flex: 1 }}>
            <Text style={styles.optionTitle}>Solana</Text>
            <Text style={styles.optionSub}>Real SOL. Blockchain transactions are final.</Text>
          </View>
          <Text style={styles.selected}>Selected</Text>
        </View>
        <Text style={styles.optionSub}>Other networks aren’t supported.</Text>
      </View>
    );
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
    gap: 8,
    height: 40,
    paddingHorizontal: 12,
    borderRadius: radius.input + 2,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  text: { fontSize: 14, fontWeight: '600' },
  pill: { height: 32, paddingHorizontal: 12, borderRadius: 8, justifyContent: 'center' },
  pillSoft: { backgroundColor: tint(colors.accent, 0.1) },
  pillAmber: { backgroundColor: '#F7D58A' },
  pillText: { fontSize: 13, fontWeight: '700', letterSpacing: 0.4 },
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
