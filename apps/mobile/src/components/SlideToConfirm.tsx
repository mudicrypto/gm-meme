import { ChevronsRight } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { Animated, type GestureResponderEvent, StyleSheet, View } from 'react-native';
import { EASE_OUT, NATIVE, haptic } from '../lib/motion';
import { colors, fonts, tint } from '../lib/theme';

const HEIGHT = 60;
const KNOB = 52;
const PAD = 4;
// Fraction of the track the knob must travel to confirm.
const THRESHOLD = 0.85;

/**
 * Slide the knob across to confirm a trade: a deliberate gesture, so a stray tap never
 * spends money. Screen readers get an "activate" action instead.
 */
export function SlideToConfirm({
  label,
  onConfirm,
  disabled = false,
}: {
  label: string;
  onConfirm: () => void;
  disabled?: boolean;
}) {
  const [width, setWidth] = useState(0);
  const [x] = useState(() => new Animated.Value(0));
  const max = Math.max(0, width - KNOB - PAD * 2);
  const start = useRef(0);
  const travel = useRef(0);

  const reset = () =>
    Animated.timing(x, {
      toValue: 0,
      duration: 220,
      easing: EASE_OUT,
      useNativeDriver: NATIVE,
    }).start();

  // The plain responder system: drag the knob, release past the threshold to confirm.
  const drag = disabled
    ? {}
    : {
        onStartShouldSetResponder: () => true,
        onMoveShouldSetResponder: () => true,
        onResponderTerminationRequest: () => false,
        onResponderGrant: (e: GestureResponderEvent) => {
          start.current = e.nativeEvent.pageX;
          travel.current = 0;
          haptic.select();
        },
        onResponderMove: (e: GestureResponderEvent) => {
          travel.current = Math.max(0, Math.min(max, e.nativeEvent.pageX - start.current));
          x.setValue(travel.current);
        },
        onResponderRelease: () => {
          if (max > 0 && travel.current >= max * THRESHOLD) {
            Animated.timing(x, {
              toValue: max,
              duration: 120,
              easing: EASE_OUT,
              useNativeDriver: NATIVE,
            }).start(() => {
              haptic.confirm();
              onConfirm();
              reset();
            });
          } else {
            reset();
          }
        },
        onResponderTerminate: reset,
      };

  const labelOpacity = x.interpolate({
    inputRange: [0, Math.max(1, max * 0.6)],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });
  const fill = x.interpolate({
    inputRange: [0, Math.max(1, max)],
    outputRange: [KNOB + PAD * 2, Math.max(KNOB + PAD * 2, width)],
    extrapolate: 'clamp',
  });

  return (
    <View
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={[styles.track, disabled && styles.disabled]}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityHint="Slide right, or activate, to confirm"
      accessibilityState={{ disabled }}
      accessibilityActions={[{ name: 'activate' }]}
      onAccessibilityAction={(e) => {
        if (e.nativeEvent.actionName === 'activate' && !disabled) onConfirm();
      }}
    >
      <Animated.View style={[styles.fill, { width: fill }]} />
      <Animated.Text style={[styles.label, { opacity: labelOpacity }]} numberOfLines={1}>
        {label}
      </Animated.Text>
      <Animated.View {...drag} style={[styles.knob, { transform: [{ translateX: x }] }]}>
        <ChevronsRight size={24} color={colors.onAccent} strokeWidth={2.4} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    height: HEIGHT,
    borderRadius: HEIGHT / 2,
    backgroundColor: tint(colors.accent, 0.14),
    borderWidth: 1,
    borderColor: tint(colors.accent, 0.35),
    justifyContent: 'center',
    overflow: 'hidden',
  },
  disabled: { opacity: 0.45 },
  fill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: HEIGHT / 2,
    backgroundColor: tint(colors.accent, 0.3),
  },
  label: {
    position: 'absolute',
    left: KNOB + 16,
    right: 16,
    textAlign: 'center',
    fontSize: 16,
    fontFamily: fonts.ui[800],
    color: colors.text,
  },
  knob: {
    position: 'absolute',
    left: PAD,
    width: KNOB,
    height: KNOB,
    borderRadius: KNOB / 2,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.accent,
    shadowOpacity: 0.5,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
});
