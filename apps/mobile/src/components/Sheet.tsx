import { type ReactNode, useEffect, useState } from 'react';
import { X } from 'lucide-react-native';
import { Animated, Modal, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DURATION, EASE_OUT, NATIVE, useReduceMotion } from '../lib/motion';
import { breakpoints, colors, radius } from '../lib/theme';
import { Text } from './Text';

/**
 * Bottom sheet on phones: slides up over a fading dim (tap it to close), grab handle.
 * On tablets and desktops the same content is a centred dialog with a close button.
 */
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
  const wide = useWindowDimensions().width >= breakpoints.tablet;
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
      {wide ? (
        <View style={styles.center} pointerEvents="box-none">
          <Animated.View
            style={[
              styles.dialog,
              {
                opacity: progress,
                transform: [
                  {
                    scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.97, 1] }),
                  },
                ],
              },
            ]}
            accessibilityViewIsModal
          >
            <View style={styles.dialogHead}>
              <Text style={styles.dialogTitle}>{title ?? ''}</Text>
              <Pressable
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel="Close"
                style={({ hovered }: { pressed: boolean; hovered?: boolean }) => [
                  styles.close,
                  hovered && { backgroundColor: colors.surface2 },
                ]}
              >
                <X size={18} color={colors.muted} strokeWidth={2} />
              </Pressable>
            </View>
            {children}
          </Animated.View>
        </View>
      ) : (
        <Animated.View
          style={[
            styles.sheet,
            {
              paddingBottom: 20 + insets.bottom,
              transform: [
                {
                  translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [480, 0] }),
                },
              ],
            },
          ]}
        >
          <View style={styles.handle} />
          {title ? <Text style={styles.title}>{title}</Text> : null}
          {children}
        </Animated.View>
      )}
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
    backgroundColor: 'rgba(4,5,8,0.6)',
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
  title: { fontSize: 19, fontWeight: '700', letterSpacing: -0.3 },
  center: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  dialog: {
    width: '100%',
    maxWidth: 440,
    maxHeight: '90%',
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingHorizontal: 20,
    paddingBottom: 20,
    gap: 12,
  },
  dialogHead: { flexDirection: 'row', alignItems: 'center', height: 56, marginBottom: -4 },
  dialogTitle: { flex: 1, fontSize: 16, fontWeight: '600' },
  close: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: -8,
  },
});
