import { useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { colors, tint } from '../lib/theme';
import { Text } from './Text';

// Muted colours for people without a photo (PersonAvatar), picked from a stable seed.
const TILE_HUES = ['#3B3F8F', '#1F5E4A', '#6B3A2E', '#4A2E6B', '#2E4F6B', '#5E6B2E', '#7A3E5E'];

export function hueFor(seed: string): string {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return TILE_HUES[h % TILE_HUES.length]!;
}

/** A token's image, or its first letter on a quiet neutral circle. Same everywhere. */
export function TokenAvatar({
  uri,
  label,
  seed,
  size = 44,
}: {
  uri?: string;
  label?: string;
  /** Usually the mint (kept for callers; the fallback is neutral). */
  seed?: string;
  size?: number;
}) {
  const [failed, setFailed] = useState(false);
  const box = { width: size, height: size, borderRadius: size / 2 };
  if (uri && !failed) {
    return <Image source={{ uri }} style={[box, styles.image]} onError={() => setFailed(true)} />;
  }
  return (
    <View style={[box, styles.tile]} accessibilityLabel={label}>
      <Text style={[styles.initials, { fontSize: Math.round(size / 2.4) }]}>
        {initials(label ?? seed)}
      </Text>
    </View>
  );
}

/** The first letter or digit of a token's name, for its fallback avatar. */
export function initials(label?: string): string {
  const match = (label ?? '').match(/[\p{L}\p{N}]/u);
  return (match?.[0] ?? '?').toUpperCase();
}

const styles = StyleSheet.create({
  // A hairline ring keeps dark images and tiles from melting into dark cards.
  image: {
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: tint(colors.text, 0.06),
  },
  tile: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: tint(colors.text, 0.06),
  },
  initials: { fontWeight: '600', color: colors.muted },
});
