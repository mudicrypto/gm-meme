import type { RiskLevel } from '@sift/shared';
import { StyleSheet, View } from 'react-native';
import { DEFAULT_FILTERS, type MarketFilters } from '../../lib/market';
import { RISK_LABELS, colors } from '../../lib/theme';
import { Button, Chip } from '../Button';
import { Sheet } from '../Sheet';
import { Switch } from '../Switch';
import { Text } from '../Text';

const LEVELS: Array<RiskLevel | 'unknown'> = ['green', 'amber', 'red', 'unknown'];
const VOLUMES = [0, 0.1, 1, 10];
const AGES = [
  { minutes: 0, label: 'Any' },
  { minutes: 60, label: '< 1h' },
  { minutes: 360, label: '< 6h' },
  { minutes: 1440, label: '< 24h' },
];

/** Advanced filters: safety filter, risk levels, minimum volume, maximum age. */
export function FiltersSheet({
  visible,
  onClose,
  filters,
  onChange,
}: {
  visible: boolean;
  onClose: () => void;
  filters: MarketFilters;
  onChange: (filters: MarketFilters) => void;
}) {
  const toggleLevel = (level: RiskLevel | 'unknown') =>
    onChange({
      ...filters,
      levels: filters.levels.includes(level)
        ? filters.levels.filter((l) => l !== level)
        : [...filters.levels, level],
    });
  return (
    <Sheet visible={visible} onClose={onClose} title="Filters">
      <FiltersBody filters={filters} onChange={onChange} toggleLevel={toggleLevel} />
      <View style={styles.actions}>
        <View style={styles.flex}>
          <Button
            small
            variant="secondary"
            label="Reset"
            onPress={() => onChange(DEFAULT_FILTERS)}
          />
        </View>
        <View style={styles.flex}>
          <Button small label="Done" onPress={onClose} />
        </View>
      </View>
    </Sheet>
  );
}

/** The filter controls, shared by the phone sheet and the desktop panel. */
export function FiltersBody({
  filters,
  onChange,
  toggleLevel,
}: {
  filters: MarketFilters;
  onChange: (filters: MarketFilters) => void;
  toggleLevel: (level: RiskLevel | 'unknown') => void;
}) {
  return (
    <View style={styles.body}>
      <View style={styles.row}>
        <View style={styles.flex}>
          <Text style={styles.title}>Safety filter</Text>
          <Text style={styles.sub}>Hide tokens rated red</Text>
        </View>
        <Switch
          value={filters.hideRed}
          onValueChange={(hideRed) => onChange({ ...filters, hideRed })}
          label="Safety filter"
        />
      </View>
      <Text style={styles.label}>Risk level</Text>
      <View style={styles.chips}>
        {LEVELS.map((level) => (
          <Chip
            key={level}
            label={RISK_LABELS[level]}
            filled={false}
            selected={filters.levels.includes(level)}
            onPress={() => toggleLevel(level)}
          />
        ))}
      </View>
      <Text style={styles.label}>Minimum volume in the window</Text>
      <View style={styles.chips}>
        {VOLUMES.map((sol) => (
          <Chip
            key={sol}
            mono
            label={sol === 0 ? 'Any' : `${sol} SOL`}
            filled={false}
            selected={filters.minVolumeSol === sol}
            onPress={() => onChange({ ...filters, minVolumeSol: sol })}
          />
        ))}
      </View>
      <Text style={styles.label}>Token age</Text>
      <View style={styles.chips}>
        {AGES.map((age) => (
          <Chip
            key={age.minutes}
            label={age.label}
            filled={false}
            selected={filters.maxAgeMinutes === age.minutes}
            onPress={() => onChange({ ...filters, maxAgeMinutes: age.minutes })}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { gap: 10 },
  flex: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { fontSize: 15, fontWeight: '600' },
  sub: { fontSize: 12, color: colors.muted, marginTop: 2 },
  label: { fontSize: 13, color: colors.muted, marginTop: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 6 },
});
