import { Pressable, StyleSheet, Text, View } from 'react-native';
import { usePalette } from '../lib/theme';

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
  const palette = usePalette();
  return (
    <View style={[styles.row, { backgroundColor: palette.border }]} accessibilityRole="tablist">
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
              selected && { backgroundColor: palette.card },
            ]}
          >
            <Text
              style={[
                styles.label,
                compact && styles.compactLabel,
                { color: selected ? palette.text : palette.muted },
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
  row: { flexDirection: 'row', borderRadius: 10, padding: 3 },
  option: { paddingVertical: 8, borderRadius: 8, alignItems: 'center' },
  fill: { flex: 1 },
  // Sized by its label: `flex: 0` collapses to zero width on web.
  compact: { flexGrow: 0, flexShrink: 0, paddingVertical: 4, paddingHorizontal: 10 },
  label: { fontSize: 14, fontWeight: '600' },
  compactLabel: { fontSize: 12 },
});
