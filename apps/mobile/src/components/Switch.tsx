import { Pressable, StyleSheet, View } from 'react-native';
import { colors } from '../lib/theme';

/** 48×28 switch, accent when on. */
export function Switch({
  value,
  onValueChange,
  label,
}: {
  value: boolean;
  onValueChange: (value: boolean) => void;
  label: string;
}) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: value }}
      onPress={() => onValueChange(!value)}
      hitSlop={8}
      style={[
        styles.track,
        { backgroundColor: value ? colors.accent : colors.track },
        { justifyContent: value ? 'flex-end' : 'flex-start' },
      ]}
    >
      <View style={[styles.knob, { backgroundColor: value ? colors.onAccent : colors.muted }]} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  track: { width: 48, height: 28, borderRadius: 14, padding: 3, flexDirection: 'row' },
  knob: { width: 22, height: 22, borderRadius: 11 },
});
