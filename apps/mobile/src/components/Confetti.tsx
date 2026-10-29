import { useEffect, useState } from 'react';
import { Animated, Easing, StyleSheet, View, useWindowDimensions } from 'react-native';
import { NATIVE, useReduceMotion } from '../lib/motion';
import { colors } from '../lib/theme';

const COLORS = [colors.accent, colors.caution, colors.text, colors.link];
const PIECES = 28;
const DURATION = 1600;

/**
 * A short burst of confetti, once, when a trade confirms on chain. It never plays for a
 * quote or a pending trade, sits above the screen without catching taps, and is skipped
 * entirely when Reduce Motion is on.
 */
export function Confetti() {
  const reduce = useReduceMotion();
  const { width, height } = useWindowDimensions();
  const [progress] = useState(() => new Animated.Value(0));
  const [pieces] = useState(() =>
    Array.from({ length: PIECES }, (_, i) => ({
      x: Math.random(),
      drift: (Math.random() - 0.5) * 120,
      spin: (Math.random() > 0.5 ? 1 : -1) * (180 + Math.random() * 360),
      delay: Math.random() * 0.25,
      size: 6 + Math.random() * 5,
      color: COLORS[i % COLORS.length]!,
      round: i % 3 === 0,
    })),
  );
  const [finished, setFinished] = useState(false);

  useEffect(() => {
    if (reduce) return;
    Animated.timing(progress, {
      toValue: 1,
      duration: DURATION,
      easing: Easing.out(Easing.quad),
      useNativeDriver: NATIVE,
    }).start(() => setFinished(true));
  }, [progress, reduce]);

  if (reduce || finished) return null;
  const fall = height * 0.7;
  return (
    <View
      pointerEvents="none"
      style={styles.layer}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {pieces.map((piece, i) => {
        const t = progress.interpolate({
          inputRange: [0, piece.delay, 1],
          outputRange: [0, 0, 1],
        });
        return (
          <Animated.View
            key={i}
            style={{
              position: 'absolute',
              top: -20,
              left: piece.x * width,
              width: piece.size,
              height: piece.round ? piece.size : piece.size * 0.45,
              borderRadius: piece.round ? piece.size / 2 : 1,
              backgroundColor: piece.color,
              opacity: t.interpolate({ inputRange: [0, 0.75, 1], outputRange: [1, 1, 0] }),
              transform: [
                { translateY: t.interpolate({ inputRange: [0, 1], outputRange: [0, fall] }) },
                {
                  translateX: t.interpolate({ inputRange: [0, 1], outputRange: [0, piece.drift] }),
                },
                {
                  rotate: t.interpolate({
                    inputRange: [0, 1],
                    outputRange: ['0deg', `${piece.spin}deg`],
                  }),
                },
              ],
            }}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  layer: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden' },
});
