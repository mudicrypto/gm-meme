import { type ReactNode, useId } from 'react';
import { type StyleProp, StyleSheet, View, type ViewStyle } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { colors, isDark, radius } from '../lib/theme';

const LIME = '#C8F04B';
const GREEN = '#2EBD85';

/**
 * A panel lit like the landing page: soft lime light from the top left and green from the
 * bottom right, behind a hairline border. For the few places that lead a screen (the
 * balance, a sign-in), not for every card.
 */
export function GlowPanel({
  children,
  style,
}: {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  // Light mode gets a fainter wash so text stays crisp on white.
  const strength = isDark ? 1 : 0.55;
  return (
    <View style={[styles.panel, style]}>
      <Svg
        width="100%"
        height="100%"
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
        preserveAspectRatio="none"
      >
        <Defs>
          <RadialGradient id={`a${id}`} cx="12%" cy="0%" rx="70%" ry="90%">
            <Stop offset="0" stopColor={LIME} stopOpacity={0.16 * strength} />
            <Stop offset="1" stopColor={LIME} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id={`b${id}`} cx="92%" cy="100%" rx="70%" ry="90%">
            <Stop offset="0" stopColor={GREEN} stopOpacity={0.14 * strength} />
            <Stop offset="1" stopColor={GREEN} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect width="100%" height="100%" fill={`url(#a${id})`} />
        <Rect width="100%" height="100%" fill={`url(#b${id})`} />
      </Svg>
      {children}
    </View>
  );
}

/** The icon tile from the landing page: a lit square with a lime glyph. */
export function GlowIcon({ children, size = 56 }: { children: ReactNode; size?: number }) {
  return (
    <View
      style={[styles.icon, { width: size, height: size, borderRadius: Math.round(size * 0.28) }]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    overflow: 'hidden',
    borderRadius: radius.card + 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  icon: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface2,
  },
});
