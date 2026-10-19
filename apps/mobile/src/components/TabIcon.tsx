import type { ColorValue } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

/** Small line icons, drawn here to avoid shipping an icon font. */
export function TabIcon({ name, color }: { name: 'discover' | 'portfolio'; color: ColorValue }) {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2}>
      {name === 'discover' ? (
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
