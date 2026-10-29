import { useWindowDimensions } from 'react-native';
import { DesktopDiscover } from '../../components/market/DesktopDiscover';
import { MobileDiscover } from '../../components/market/MobileDiscover';
import { useDiscover } from '../../components/market/useDiscover';
import { breakpoints } from '../../lib/theme';

/** Discover: a list on phones, a terminal table with a token panel on wider screens. */
export default function DiscoverScreen() {
  const { width } = useWindowDimensions();
  const state = useDiscover();
  return width >= breakpoints.tablet ? (
    <DesktopDiscover state={state} showPanel={width >= breakpoints.desktop} />
  ) : (
    <MobileDiscover state={state} />
  );
}
