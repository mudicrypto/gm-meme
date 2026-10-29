import { useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { colors, tint } from '../lib/theme';
import { Text } from './Text';

// Muted tile colours for tokens without an image, picked from the mint so a token keeps
// the same colour everywhere.
const TILE_HUES = ['#3B3F8F', '#1F5E4A', '#6B3A2E', '#4A2E6B', '#2E4F6B', '#5E6B2E', '#7A3E5E'];

export function hueFor(seed: string): string {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return TILE_HUES[h % TILE_HUES.length]!;
}

/** A token's image, or its initials on a coloured tile (rounded square, per the design). */
export function TokenAvatar({
  uri,
  label,
  seed,
  size = 44,
}: {
  uri?: string;
  label?: string;
  /** Usually the mint; picks the tile colour. */
  seed?: string;
  size?: number;
}) {
  const [failed, setFailed] = useState(false);
  const box = { width: size, height: size, borderRadius: Math.round(size * 0.32) };
  if (uri && !failed) {
    return <Image source={{ uri }} style={[box, styles.image]} onError={() => setFailed(true)} />;
  }
  return (
    <View style={[box, styles.tile, { backgroundColor: hueFor(seed ?? label ?? '?') }]}>
      <Text style={[styles.initials, { fontSize: Math.round(size / 3.1) }]}>{initials(label)}</Text>
    </View>
  );
}

export function initials(label?: string): string {
  const words = (label ?? '?').trim().split(/\s+/);
  const text = words.length > 1 ? `${words[0]![0]}${words[1]![0]}` : (words[0] ?? '?').slice(0, 2);
  return text.toUpperCase();
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
    borderWidth: 1,
    borderColor: tint(colors.text, 0.08),
  },
  initials: { fontWeight: '800', color: colors.text },
});
