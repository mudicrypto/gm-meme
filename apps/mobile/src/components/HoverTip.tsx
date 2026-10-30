import { type ReactNode, useState } from 'react';
import {
  type PressableProps,
  Pressable,
  type StyleProp,
  StyleSheet,
  View,
  type ViewStyle,
} from 'react-native';
import { colors } from '../lib/theme';
import { Text } from './Text';

/**
 * A pressable with a small tooltip on hover and keyboard focus (web), for icon buttons
 * and values with more detail. The tip is decoration: the accessible label carries the
 * same information.
 */
export function HoverTip({
  tip,
  side = 'top',
  style,
  children,
  ...props
}: Omit<PressableProps, 'style' | 'children'> & {
  tip: string;
  side?: 'top' | 'right';
  style?: (state: { hovered: boolean; focused: boolean }) => StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const shown = hovered || focused;
  return (
    <Pressable
      {...props}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={style ? style({ hovered, focused }) : undefined}
    >
      {children}
      {shown ? (
        <View pointerEvents="none" style={side === 'right' ? styles.rightWrap : styles.topWrap}>
          <View style={styles.bubble}>
            <Text style={styles.text} numberOfLines={1}>
              {tip}
            </Text>
          </View>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  topWrap: { position: 'absolute', bottom: '100%', right: 0, marginBottom: 6, zIndex: 50 },
  rightWrap: {
    position: 'absolute',
    left: '100%',
    top: 0,
    bottom: 0,
    marginLeft: 8,
    justifyContent: 'center',
    zIndex: 50,
  },
  bubble: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface2,
  },
  text: { fontSize: 12, fontWeight: '500', color: colors.text, whiteSpace: 'nowrap' } as object,
});
