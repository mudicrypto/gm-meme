import { StyleSheet, View } from 'react-native';
import { colors, tint } from '../lib/theme';
import { Text } from './Text';
import { useNetwork } from '../lib/network';

/** Shown on trade and portfolio screens while Sift runs on devnet; hidden on mainnet. */
export function DevnetBadge() {
  const { isDevnet } = useNetwork();
  if (!isDevnet) return null;
  return (
    <View style={styles.badge} accessibilityLabel="Devnet: test network, test SOL only">
      <Text style={styles.text}>DEVNET</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    height: 28,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: tint(colors.caution, 0.14),
    justifyContent: 'center',
  },
  text: { color: colors.caution, fontSize: 11, fontWeight: '800', letterSpacing: 0.4 },
});
