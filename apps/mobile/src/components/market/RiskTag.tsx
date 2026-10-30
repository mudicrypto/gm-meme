import type { RiskLevel } from '@sift/shared';
import { ShieldAlert, ShieldCheck, ShieldQuestionMark, ShieldX } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';
import { RISK_COLORS } from '../../lib/theme';
import { Text } from '../Text';

/**
 * The compact risk label for lists and tables: a shield and a word, never colour alone.
 * Green means every check ran and none flagged anything ("0 flags"); a token that hasn't
 * been checked says so instead of looking clean. Never "safe".
 */
export const RISK_TAGS: Record<RiskLevel | 'unknown', string> = {
  green: '0 flags',
  amber: 'Caution',
  red: 'Risky',
  unknown: 'Not checked',
};

const ICONS = {
  green: ShieldCheck,
  amber: ShieldAlert,
  red: ShieldX,
  unknown: ShieldQuestionMark,
} as const;

export function RiskTag({
  level,
  size = 12,
  iconOnly = false,
}: {
  level: RiskLevel | undefined;
  size?: number;
  /** Just the shield: each level has its own shape, and the label is still read out. */
  iconOnly?: boolean;
}) {
  const key = level ?? 'unknown';
  const Icon = ICONS[key];
  const color = RISK_COLORS[key].fg;
  if (iconOnly)
    return (
      <View accessible accessibilityLabel={`Risk: ${RISK_TAGS[key]}`}>
        <Icon size={size + 2} color={color} strokeWidth={2} />
      </View>
    );
  return (
    <View style={styles.row}>
      <Icon size={size + 1} color={color} strokeWidth={2} />
      <Text style={[styles.text, { fontSize: size, color }]} numberOfLines={1}>
        {RISK_TAGS[key]}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1 },
  text: { fontWeight: '500' },
});
