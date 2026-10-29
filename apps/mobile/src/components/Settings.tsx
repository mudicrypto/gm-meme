import { ChevronRight } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { haptic } from '../lib/motion';
import { colors, radius, tint } from '../lib/theme';
import { Text } from './Text';

/** An uppercase label above a group of settings rows. */
export function SectionLabel({ children }: { children: string }) {
  return <Text style={styles.label}>{children}</Text>;
}

/** A card of rows separated by hairlines. */
export function SettingsGroup({ children }: { children: ReactNode }) {
  return <View style={styles.group}>{children}</View>;
}

type Tone = 'ok' | 'warn' | 'off' | 'danger';

const TONES: Record<Tone, string> = {
  ok: colors.up,
  warn: colors.caution,
  off: colors.muted,
  danger: colors.down,
};

/** A small status pill: "On", "Set", "Off". Text and colour, never colour alone. */
export function StatusPill({ label, tone }: { label: string; tone: Tone }) {
  const fg = TONES[tone];
  return (
    <View
      style={[styles.pill, { backgroundColor: tone === 'off' ? colors.surface2 : tint(fg, 0.12) }]}
    >
      <Text style={[styles.pillText, { color: fg }]}>{label}</Text>
    </View>
  );
}

export function SettingsRow({
  title,
  subtitle,
  icon,
  right,
  onPress,
  last = false,
  titleColor,
}: {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  /** Status pill, link text or switch. A chevron shows when the row opens something. */
  right?: ReactNode;
  onPress?: () => void;
  last?: boolean;
  titleColor?: string;
}) {
  const body = (
    <>
      {icon}
      <View style={styles.flex}>
        <Text style={[styles.title, titleColor ? { color: titleColor } : null]}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      {right ?? (onPress ? <ChevronRight size={18} color={colors.muted} strokeWidth={2} /> : null)}
    </>
  );
  const style = [styles.row, !last && styles.divider];
  return onPress ? (
    <Pressable
      onPress={() => {
        haptic.select();
        onPress();
      }}
      accessibilityRole="button"
      style={({ pressed }) => [style, pressed && styles.pressed]}
    >
      {body}
    </Pressable>
  ) : (
    <View style={style}>{body}</View>
  );
}

const styles = StyleSheet.create({
  label: {
    marginTop: 12,
    marginBottom: -2,
    fontSize: 13,
    fontWeight: '800',
    color: colors.muted,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  group: {
    paddingHorizontal: 16,
    paddingVertical: 2,
    borderRadius: radius.cardLarge,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, minHeight: 56 },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.border },
  pressed: { opacity: 0.6 },
  flex: { flex: 1 },
  title: { fontSize: 14, fontWeight: '700' },
  subtitle: { fontSize: 12, color: colors.muted, marginTop: 2, lineHeight: 17 },
  pill: { height: 26, paddingHorizontal: 10, borderRadius: 999, justifyContent: 'center' },
  pillText: { fontSize: 12, fontWeight: '800' },
});
