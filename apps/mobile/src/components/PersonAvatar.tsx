import { StyleSheet, View } from 'react-native';
import { colors } from '../lib/theme';
import { Text } from './Text';
import { hueFor, initials } from './TokenAvatar';

/** A person's initials on a round tile; `active` adds an accent ring (traded today). */
export function PersonAvatar({
  name,
  seed,
  size = 40,
  active = false,
}: {
  name: string;
  seed: string;
  size?: number;
  active?: boolean;
}) {
  const ring = active ? 2 : 0;
  const inner = size - (active ? 6 : 0);
  return (
    <View
      style={[
        styles.ring,
        { width: size, height: size, borderRadius: size / 2, borderWidth: ring },
        active && { borderColor: colors.accent },
      ]}
    >
      <View
        style={[
          styles.tile,
          { width: inner, height: inner, borderRadius: inner / 2, backgroundColor: hueFor(seed) },
        ]}
      >
        <Text style={[styles.initials, { fontSize: Math.round(inner / 2.8) }]}>
          {initials(name)}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  ring: { alignItems: 'center', justifyContent: 'center', borderColor: 'transparent' },
  tile: { alignItems: 'center', justifyContent: 'center' },
  initials: { fontWeight: '800', color: colors.text },
});
