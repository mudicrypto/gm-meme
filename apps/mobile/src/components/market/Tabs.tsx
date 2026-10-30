import { Pressable, StyleSheet, View } from 'react-native';
import { haptic, transition } from '../../lib/motion';
import { colors, radius, tint } from '../../lib/theme';
import { Text } from '../Text';

/**
 * Tabs in two treatments. `underline` (the default) is text tabs with a thin mint
 * indicator, for switching lists and sections. `compact` is the small segmented control
 * for time windows. Neither uses a mint fill: that's for primary actions.
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
      style={compact ? styles.segments : styles.underlineRow}
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
            // The segment is 38 tall inside a 3px track: the slop makes the target 44.
            hitSlop={compact ? 3 : undefined}
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
              compact ? styles.segment : styles.tab,
              compact && selected && styles.segmentSelected,
              compact && !selected && (pressed || hovered) && styles.segmentHover,
              !compact && { borderBottomColor: selected ? colors.accent : 'transparent' },
              focused && styles.focus,
              transition,
            ]}
          >
            {({ hovered }: { pressed: boolean; hovered?: boolean }) => (
              <Text
                numberOfLines={1}
                mono={compact}
                style={[
                  compact ? styles.segmentLabel : styles.tabLabel,
                  { color: selected ? colors.text : hovered ? colors.text2 : colors.muted },
                  transition,
                ]}
              >
                {option.label}
              </Text>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  underlineRow: {
    flexDirection: 'row',
    gap: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  tab: {
    minHeight: 44,
    justifyContent: 'center',
    borderBottomWidth: 2,
    marginBottom: -StyleSheet.hairlineWidth,
  },
  tabLabel: { fontSize: 15, fontWeight: '600' },
  segments: {
    flexDirection: 'row',
    padding: 3,
    gap: 2,
    borderRadius: radius.input,
    backgroundColor: colors.surface,
  },
  segment: {
    flex: 1,
    minHeight: 38,
    paddingHorizontal: 8,
    borderRadius: radius.chip,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentSelected: { backgroundColor: colors.surface2 },
  segmentHover: { backgroundColor: tint(colors.text, 0.04) },
  segmentLabel: { fontSize: 13, fontWeight: '600' },
  focus: { outlineColor: colors.muted, outlineWidth: 1, outlineStyle: 'solid' } as object,
});
