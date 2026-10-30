import { Pressable, StyleSheet, View } from 'react-native';
import { haptic, transition } from '../../lib/motion';
import { colors, dark, radius, tint } from '../../lib/theme';
import { Text, useInk } from '../Text';

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
  // On the dark trade surfaces: lime indicator, light text.
  const onDark = useInk() === dark.text;
  const accent = onDark ? dark.lime : colors.accent;
  const text = onDark ? dark.text : colors.text;
  const muted = onDark ? dark.muted : colors.muted;
  return (
    <View
      style={[
        compact ? styles.segments : styles.underlineRow,
        onDark &&
          (compact ? { backgroundColor: dark.surface } : { borderBottomColor: dark.border }),
      ]}
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
              !compact && { borderBottomColor: selected ? accent : 'transparent' },
              compact && selected && onDark && { backgroundColor: dark.surface2 },
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
                  {
                    color: selected ? (compact || onDark ? text : accent) : hovered ? text : muted,
                  },
                  !compact && selected && { fontWeight: '700' },
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
  tabLabel: { fontSize: 16, fontWeight: '500' },
  segments: {
    flexDirection: 'row',
    padding: 3,
    gap: 2,
    borderRadius: radius.card,
    backgroundColor: colors.surface2,
  },
  segment: {
    flex: 1,
    minHeight: 38,
    paddingHorizontal: 8,
    borderRadius: radius.chip,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentSelected: {
    backgroundColor: colors.surface,
    shadowColor: colors.shadow,
    shadowOpacity: 0.08,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },
  segmentHover: { backgroundColor: tint(colors.text, 0.04) },
  segmentLabel: { fontSize: 14, fontWeight: '600' },
  focus: { outlineColor: colors.muted, outlineWidth: 1, outlineStyle: 'solid' } as object,
});
