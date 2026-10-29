import { Pressable, StyleSheet, View } from 'react-native';
import { haptic } from '../../lib/motion';
import { colors, radius } from '../../lib/theme';
import { Text } from '../Text';

/**
 * Terminal tabs: a panel with the selected option filled in mint (strong fill is reserved
 * for primary choices). `compact` is the small time-window control.
 */
export function Tabs<T extends string | number>({
  options,
  value,
  onChange,
  compact = false,
  label,
}: {
  options: ReadonlyArray<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
  compact?: boolean;
  label: string;
}) {
  return (
    <View
      style={[styles.row, compact && styles.compactRow]}
      accessibilityRole="tablist"
      accessibilityLabel={label}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={String(option.value)}
            onPress={() => {
              if (!selected) haptic.select();
              onChange(option.value);
            }}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            style={({
              pressed,
              hovered,
              focused,
            }: {
              pressed: boolean;
              hovered?: boolean;
              focused?: boolean;
            }) => [
              styles.option,
              compact && styles.compactOption,
              selected && (compact ? styles.compactSelected : styles.selected),
              !selected && (pressed || hovered) && styles.hover,
              focused && styles.focus,
            ]}
          >
            <Text
              numberOfLines={1}
              mono={compact}
              style={[
                styles.label,
                compact && styles.compactLabel,
                { color: selected ? (compact ? colors.text : colors.onAccent) : colors.text2 },
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
    padding: 4,
    gap: 4,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  compactRow: { borderRadius: radius.input },
  option: {
    flex: 1,
    minHeight: 40,
    paddingHorizontal: 6,
    borderRadius: radius.input - 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  compactOption: { minHeight: 36, paddingHorizontal: 10 },
  selected: { backgroundColor: colors.accent },
  compactSelected: { backgroundColor: colors.surface2 },
  hover: { backgroundColor: colors.surface2 },
  focus: { outlineColor: colors.muted, outlineWidth: 1, outlineStyle: 'solid' } as object,
  label: { fontSize: 14, fontWeight: '600' },
  compactLabel: { fontSize: 13 },
});
