import { View } from 'react-native';
import { useMode } from '../lib/mode';
import { Segmented } from './Segmented';

export function ModeToggle() {
  const { mode, setMode } = useMode();
  return (
    <View style={{ marginRight: 12, flexDirection: 'row' }}>
      <Segmented
        compact
        value={mode}
        onChange={setMode}
        options={[
          { value: 'simple', label: 'Simple' },
          { value: 'pro', label: 'Pro' },
        ]}
      />
    </View>
  );
}
