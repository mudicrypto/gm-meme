import { Pressable, StyleSheet, View } from 'react-native';
import { colors, radius } from '../lib/theme';
import { Text } from './Text';

/** A segmented control: a surface track with the selected option raised. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  compact = false,
}: {
  options: ReadonlyArray<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
  compact?: boolean;
}) {
  return (
    <View style={[styles.row, compact && styles.compactRow]} accessibilityRole="tablist">
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            style={[
              styles.option,
              compact ? styles.compact : styles.fill,
              selected && styles.selected,
            ]}
          >
            <Text
              style={[
                styles.label,
                compact && styles.compactLabel,
                { color: selected ? colors.text : colors.muted },
              ]}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    borderRadius: radius.input,
    padding: 4,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  compactRow: { borderRadius: 12, padding: 3 },
  option: { paddingVertical: 9, borderRadius: 10, alignItems: 'center' },
  selected: { backgroundColor: colors.surface2 },
  fill: { flex: 1 },
  // Sized by its label: `flex: 0` collapses to zero width on web.
  compact: {
    flexGrow: 0,
    flexShrink: 0,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 9,
  },
  label: { fontSize: 14, fontWeight: '700' },
  compactLabel: { fontSize: 12 },
});
