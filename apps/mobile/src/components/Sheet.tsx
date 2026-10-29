import { type ReactNode, useEffect, useState } from 'react';
import { Animated, Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DURATION, EASE_OUT, NATIVE, useReduceMotion } from '../lib/motion';
import { colors, radius } from '../lib/theme';
import { Text } from './Text';

/** Bottom sheet: slides up over a fading dim (tap it to close); rounded top, grab handle. */
export function Sheet({
  visible,
  onClose,
  title,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const reduce = useReduceMotion();
  const progress = useState(() => new Animated.Value(0))[0];
  // Stay mounted while sliding out.
  const [mounted, setMounted] = useState(visible);
  if (visible && !mounted) setMounted(true);

  useEffect(() => {
    Animated.timing(progress, {
      toValue: visible ? 1 : 0,
      duration: reduce ? 0 : visible ? DURATION + 40 : DURATION - 40,
      easing: EASE_OUT,
      useNativeDriver: NATIVE,
    }).start(({ finished }) => {
      if (finished && !visible) setMounted(false);
    });
  }, [visible, progress, reduce]);

  return (
    <Modal visible={mounted} transparent animationType="none" onRequestClose={onClose}>
      <Animated.View style={[styles.dim, { opacity: progress }]}>
        <Pressable style={styles.fill} onPress={onClose} accessibilityLabel="Close" />
      </Animated.View>
      <Animated.View
        style={[
          styles.sheet,
          {
            paddingBottom: 20 + insets.bottom,
            transform: [
              { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [480, 0] }) },
            ],
          },
        ]}
      >
        <View style={styles.handle} />
        {title ? <Text style={styles.title}>{title}</Text> : null}
        {children}
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  dim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(4,5,8,0.7)',
  },
  fill: { flex: 1 },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    borderTopWidth: 1,
    borderColor: colors.borderStrong,
    paddingHorizontal: 20,
    paddingTop: 10,
    gap: 12,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.track,
    marginBottom: 6,
  },
  title: { fontSize: 19, fontWeight: '800', letterSpacing: -0.3 },
});
