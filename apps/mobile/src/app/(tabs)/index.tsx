import { router } from 'expo-router';
import { Search } from 'lucide-react-native';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { IconButton } from '../../components/Button';
import { BalanceCard } from '../../components/home/BalanceCard';
import { AssetsCard, QuickActions, TopMovers } from '../../components/home/HomeSections';
import { Logo } from '../../components/Logo';
import { DevnetPill } from '../../components/market/Network';
import { Screen } from '../../components/Screen';
import { Text } from '../../components/Text';
import { useNetwork } from '../../lib/network';
import { breakpoints, colors, space } from '../../lib/theme';

/**
 * Home, exchange style: your balance and quick actions first, then your assets and the
 * day's top movers. Two columns on wide screens.
 */
export default function HomeScreen() {
  const wide = useWindowDimensions().width >= breakpoints.desktop;
  const { isDevnet } = useNetwork();
  const header = (
    <View style={styles.header}>
      <Logo size={24} />
      <View style={styles.headerRight}>
        {isDevnet ? <DevnetPill soft /> : null}
        <IconButton label="Search markets" onPress={() => router.push('/markets')}>
          <Search size={22} color={colors.text} strokeWidth={2} />
        </IconButton>
      </View>
    </View>
  );
  const account = (
    <>
      <BalanceCard />
      <QuickActions />
      <AssetsCard />
    </>
  );
  return (
    <Screen header={wide ? <View /> : header} maxWidth={1120}>
      {wide ? (
        <View style={styles.columns}>
          <View style={styles.left}>{account}</View>
          <View style={styles.right}>
            <TopMovers limit={8} />
          </View>
        </View>
      ) : (
        <>
          {account}
          <TopMovers />
        </>
      )}
      <Text style={styles.foot}>
        {isDevnet ? 'Devnet: test SOL with no real value. ' : ''}Values use last traded prices. Not
        financial advice.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 48,
  },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  columns: { flexDirection: 'row', gap: space.xl, alignItems: 'flex-start' },
  left: { width: 400, gap: space.lg },
  right: { flex: 1, minWidth: 0 },
  foot: { fontSize: 12, color: colors.faint, textAlign: 'center', marginTop: space.sm },
});
