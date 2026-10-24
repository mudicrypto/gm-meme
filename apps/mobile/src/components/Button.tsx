import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { colors, tint } from '../lib/theme';
import { Text } from './Text';

/** Primary (accent, 54 tall) or secondary (surface) button. */
export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  small = false,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
  small?: boolean;
}) {
  const primary = variant === 'primary';
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      style={[
        styles.button,
        small && styles.small,
        primary ? styles.primary : styles.secondary,
        { opacity: disabled ? 0.5 : 1 },
      ]}
    >
      <Text style={[styles.label, { color: primary ? colors.onAccent : colors.text }]}>
        {label}
      </Text>
    </Pressable>
  );
}

/** A 44×44 square icon button (header actions). */
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
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={styles.icon}
    >
      {children}
      {badge ? <View style={styles.badge} /> : null}
    </Pressable>
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
    <Pressable
      onPress={onPress}
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
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    height: 54,
    borderRadius: 16,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  small: { height: 44, borderRadius: 14 },
  primary: { backgroundColor: colors.accent },
  secondary: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderStrong },
  label: { fontSize: 16, fontWeight: '800' },
  icon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
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
    height: 40,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipLabel: { fontSize: 14, fontWeight: '700' },
});
