import { StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Text, useInk } from './Text';

/** The Sift mark: a lightning bolt, drawn as vector so it stays sharp at any size. */
export function LogoMark({ size = 28, color }: { size?: number; color?: string }) {
  const ink = useInk();
  return (
    <Svg
      width={size * 0.72}
      height={size}
      viewBox="0 0 18 25"
      accessibilityElementsHidden
      importantForAccessibility="no"
    >
      <Path d="M12.6 0 1 14.2h6.6L5.3 25 17 10.6h-6.7L12.6 0Z" fill={color ?? ink} />
    </Svg>
  );
}

/** Mark and wordmark ("SIFT", spaced capitals), for headers. */
export function Logo({ size = 28, color }: { size?: number; color?: string }) {
  const ink = useInk();
  return (
    <View style={styles.row} accessibilityRole="header" accessibilityLabel="Sift">
      <LogoMark size={size} color={color} />
      <Text style={[styles.word, { fontSize: Math.round(size * 0.82), color: color ?? ink }]}>
        SIFT
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  word: { fontWeight: '800', letterSpacing: 3.5 },
});
