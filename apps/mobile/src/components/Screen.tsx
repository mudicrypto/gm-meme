import type { ReactNode } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { breakpoints, colors, space, type as typeScale } from '../lib/theme';
import { Text } from './Text';

/** A tab screen: safe-area top, 20px sides, optional big title and pull-to-refresh. */
export function Screen({
  title,
  subtitle,
  right,
  header,
  children,
  refreshing,
  onRefresh,
  footer,
  maxWidth = 760,
}: {
  title?: string;
  subtitle?: string;
  /** Actions next to the title (icon buttons, badges). */
  right?: ReactNode;
  /** Replaces the title row entirely (e.g. the Discover logo bar). */
  header?: ReactNode;
  children: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  /** Pinned to the bottom (sticky buttons). */
  footer?: ReactNode;
  /** Content width on wide screens (760 reads well; dashboards go wider). */
  maxWidth?: number;
}) {
  const insets = useSafeAreaInsets();
  // Tablets and desktops: the terminal header sits above, and content keeps a reading width.
  const wide = useWindowDimensions().width >= breakpoints.tablet;
  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: wide ? space.xl : insets.top + 16 },
          wide && [styles.wide, { maxWidth }],
        ]}
        refreshControl={
          onRefresh ? (
            <RefreshControl
              refreshing={refreshing ?? false}
              onRefresh={onRefresh}
              tintColor={colors.muted}
            />
          ) : undefined
        }
      >
        {header ??
          (title ? (
            <View style={styles.titleRow}>
              <View style={styles.flex}>
                <Text style={typeScale.title}>{title}</Text>
                {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
              </View>
              {right}
            </View>
          ) : null)}
        {children}
      </ScrollView>
      {footer}
    </View>
  );
}

export function SectionTitle({ title, right }: { title: string; right?: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={typeScale.section}>{title}</Text>
      {right}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: space.screen, paddingBottom: space.tabBar, gap: space.gap },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 6 },
  wide: { width: '100%', maxWidth: 760, alignSelf: 'center', paddingHorizontal: space.xl },
  flex: { flex: 1 },
  subtitle: { marginTop: 4, fontSize: 14, color: colors.muted },
  section: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginTop: 8,
  },
});
