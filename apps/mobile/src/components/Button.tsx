import { Pressable, StyleSheet, Text } from 'react-native';
import { usePalette } from '../lib/theme';

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
}) {
  const palette = usePalette();
  const primary = variant === 'primary';
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={[
        styles.button,
        primary
          ? { backgroundColor: palette.accent }
          : { borderColor: palette.border, borderWidth: 1 },
        { opacity: disabled ? 0.5 : 1 },
      ]}
    >
      <Text style={[styles.label, { color: primary ? palette.accentText : palette.text }]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { borderRadius: 12, paddingVertical: 11, paddingHorizontal: 16, alignItems: 'center' },
  label: { fontSize: 15, fontWeight: '700' },
});
