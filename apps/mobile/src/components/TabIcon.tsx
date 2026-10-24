import { Compass, Star, Users, Wallet } from 'lucide-react-native';
import type { ColorValue } from 'react-native';

const ICONS = { discover: Compass, friends: Users, watchlist: Star, portfolio: Wallet } as const;

/** Tab bar icons: lucide line icons at a 2px stroke, as in the design. */
export function TabIcon({ name, color }: { name: keyof typeof ICONS; color: ColorValue }) {
  const Icon = ICONS[name];
  return <Icon size={22} color={color as string} strokeWidth={2} />;
}
