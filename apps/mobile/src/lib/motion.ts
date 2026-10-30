import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';
import { AccessibilityInfo, Easing, Platform } from 'react-native';

// Motion rules from the design: 220 ms ease-out, no bounce, and nothing moves when the
// phone's Reduce Motion setting is on.

export const DURATION = 220;
export const EASE_OUT = Easing.bezier(0.2, 0.8, 0.2, 1);
// The native driver isn't available on web.
export const NATIVE = Platform.OS !== 'web';

let reduceMotion = false;
void AccessibilityInfo.isReduceMotionEnabled()
  .then((on) => {
    reduceMotion = on;
  })
  .catch(() => {});
AccessibilityInfo.addEventListener?.('reduceMotionChanged', (on) => {
  reduceMotion = on;
});

/** Whether the phone asks for reduced motion (kept up to date). */
export function useReduceMotion(): boolean {
  const [on, setOn] = useState(reduceMotion);
  useEffect(() => {
    const sub = AccessibilityInfo.addEventListener?.('reduceMotionChanged', setOn);
    return () => sub?.remove();
  }, []);
  return on;
}

/** Light taps for selections, one firm tap to confirm, a warning buzz for red flags. */
export const haptic = {
  select: () => {
    if (Platform.OS !== 'web') void Haptics.selectionAsync().catch(() => {});
  },
  confirm: () => {
    if (Platform.OS !== 'web')
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  },
  success: () => {
    if (Platform.OS !== 'web')
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  },
  warning: () => {
    if (Platform.OS !== 'web')
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
  },
};

/**
 * Web only: a 150 ms ease on colour and border changes (hover, selection, tabs, buttons).
 * Never on layout, so rows don't shift and price updates don't animate. Off when the
 * browser asks for reduced motion.
 */
export const transition: object =
  Platform.OS === 'web' &&
  !(
    typeof globalThis.matchMedia === 'function' &&
    globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
    ? {
        transitionProperty: 'background-color, border-color, color, opacity',
        transitionDuration: '150ms',
        transitionTimingFunction: 'ease-out',
      }
    : {};
