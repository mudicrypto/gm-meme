import type { ColorValue } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

/** Small line icons, drawn here to avoid shipping an icon font. */
export function TabIcon({
  name,
  color,
}: {
  name: 'discover' | 'friends' | 'watchlist' | 'portfolio';
  color: ColorValue;
}) {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2}>
      {name === 'friends' ? (
        <>
          <Circle cx={9} cy={8} r={3.5} />
          <Path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5" strokeLinecap="round" />
          <Path
            d="M16 4.8a3.5 3.5 0 0 1 0 6.4M18.5 14.8c1.6.8 2.6 2.5 3 5.2"
            strokeLinecap="round"
          />
        </>
      ) : name === 'watchlist' ? (
        <Path
          d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9Z"
          strokeLinejoin="round"
        />
      ) : name === 'discover' ? (
        <>
          <Circle cx={12} cy={12} r={9} />
          <Path d="M15.5 8.5 13.5 13.5 8.5 15.5 10.5 10.5Z" strokeLinejoin="round" />
        </>
      ) : (
        <>
          <Rect x={3} y={6} width={18} height={14} rx={3} />
          <Path d="M3 10h18M16 15h2" strokeLinecap="round" />
        </>
      )}
    </Svg>
  );
}
