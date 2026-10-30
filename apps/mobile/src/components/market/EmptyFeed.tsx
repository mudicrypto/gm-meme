import { Pressable, StyleSheet, View } from 'react-native';
import { transition } from '../../lib/motion';
import { colors, radius, space } from '../../lib/theme';
import { Text } from '../Text';
import { type DiscoverState, emptyMessage } from './useDiscover';

/**
 * Why the list is empty, with the one-tap ways out: a quiet hour on Trending offers a
 * longer window and New pairs; filters offer Reset. Never filler tokens.
 */
export function EmptyFeed({ state }: { state: DiscoverState }) {
  const actions: Array<{ label: string; onPress: () => void }> = [];
  const nothingAtAll = !state.query && state.market.tokens.length === 0;
  if (nothingAtAll && state.feed === 'trending' && state.windowMinutes < 1440)
    actions.push({ label: 'Show 24h', onPress: () => state.setWindowMinutes(1440) });
  if (nothingAtAll && state.feed !== 'new')
    actions.push({ label: 'See new pairs', onPress: () => state.setFeed('new') });
  return (
    <View style={styles.box}>
      <Text style={styles.text}>{emptyMessage(state)}</Text>
      {actions.length > 0 ? (
        <View style={styles.actions}>
          {actions.map((action) => (
            <Pressable
              key={action.label}
              onPress={action.onPress}
              accessibilityRole="button"
              style={({ hovered }: { pressed: boolean; hovered?: boolean }) => [
                styles.action,
                hovered && { backgroundColor: colors.surface2 },
                transition,
              ]}
            >
              <Text style={styles.actionText}>{action.label}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.xl,
    paddingHorizontal: space.lg,
  },
  text: { fontSize: 14, color: colors.muted, textAlign: 'center' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: space.sm },
  action: {
    minHeight: 44,
    paddingHorizontal: 16,
    justifyContent: 'center',
    borderRadius: radius.input,
    backgroundColor: colors.surface,
  },
  actionText: { fontSize: 14, fontWeight: '600', color: colors.accent },
});
