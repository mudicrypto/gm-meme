import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { haptic } from '../lib/motion';
import { colors, radius, tint } from '../lib/theme';
import { PressableScale } from './Motion';
import { Text } from './Text';

/** Primary (accent, 54 tall) or secondary (surface) button. */
export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  small = false,
  confirm = false,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'lime';
  disabled?: boolean;
  small?: boolean;
  /** One firm haptic: for the button that commits (buy, sell, place order). */
  confirm?: boolean;
}) {
  const primary = variant === 'primary';
  return (
    <PressableScale
      onPress={() => {
        if (confirm) haptic.confirm();
        onPress();
      }}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      style={[
        styles.button,
        small && styles.small,
        variant === 'lime' ? styles.lime : primary ? styles.primary : styles.secondary,
        { opacity: disabled ? 0.5 : 1 },
      ]}
    >
      <Text
        style={[
          styles.label,
          {
            color: variant === 'lime' ? colors.onLime : primary ? colors.onAccent : colors.text,
          },
        ]}
      >
        {label}
      </Text>
    </PressableScale>
  );
}

/** A bare 44×44 icon button (header actions): no box, as in the design. */
export function IconButton({
  label,
  onPress,
  children,
  badge = false,
}: {
  label: string;
  onPress: () => void;
  children: ReactNode;
  badge?: boolean;
}) {
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={styles.icon}
      scaleTo={0.92}
    >
      {children}
      {badge ? <View style={styles.badge} /> : null}
    </PressableScale>
  );
}

/** A selectable chip (tabs, quick amounts). */
export function Chip({
  label,
  selected,
  onPress,
  filled = true,
  mono = false,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  /** Filled accent when selected (tabs); otherwise a tinted outline (amount chips). */
  filled?: boolean;
  mono?: boolean;
}) {
  return (
    <PressableScale
      onPress={() => {
        if (!selected) haptic.select();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={[
        styles.chip,
        selected
          ? filled
            ? { backgroundColor: colors.accent, borderColor: colors.accent }
            : { backgroundColor: tint(colors.accent, 0.14), borderColor: colors.accent }
          : null,
      ]}
    >
      <Text
        mono={mono}
        style={[
          styles.chipLabel,
          { color: selected ? (filled ? colors.onAccent : colors.text) : colors.text2 },
        ]}
      >
        {label}
      </Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  button: {
    height: 52,
    borderRadius: radius.input,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  small: { height: 44, borderRadius: radius.input },
  primary: { backgroundColor: colors.accent },
  lime: { backgroundColor: colors.lime },
  secondary: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderStrong },
  label: { fontSize: 16, fontWeight: '600' },
  icon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: 10,
    right: 11,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.accent,
  },
  chip: {
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: radius.chip,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipLabel: { fontSize: 14, fontWeight: '600' },
});
