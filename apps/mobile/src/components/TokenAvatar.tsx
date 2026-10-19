import { useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { usePalette } from '../lib/theme';

export function TokenAvatar({
  uri,
  label,
  size = 40,
}: {
  uri?: string;
  label?: string;
  size?: number;
}) {
  const palette = usePalette();
  const [failed, setFailed] = useState(false);
  const box = { width: size, height: size, borderRadius: size / 2 };
  if (uri && !failed) {
    return <Image source={{ uri }} style={[box, styles.image]} onError={() => setFailed(true)} />;
  }
  return (
    <View style={[box, styles.fallback, { backgroundColor: palette.border }]}>
      <Text style={[styles.initials, { color: palette.muted, fontSize: size * 0.38 }]}>
        {(label ?? '?').slice(0, 2).toUpperCase()}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  image: { backgroundColor: '#E5E7EB' },
  fallback: { alignItems: 'center', justifyContent: 'center' },
  initials: { fontWeight: '700' },
});
