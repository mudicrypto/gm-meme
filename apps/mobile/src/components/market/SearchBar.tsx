import { Search, X } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';
import { colors, radius } from '../../lib/theme';
import { TextInput } from '../Text';

export function SearchBar({
  value,
  onChange,
  placeholder = 'Token or address…',
  onSubmit,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  onSubmit?: () => void;
}) {
  return (
    <View style={styles.box}>
      <Search size={18} color={colors.muted} strokeWidth={2} />
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        onSubmitEditing={onSubmit}
        accessibilityLabel="Search tokens by name, symbol or address"
        style={styles.input}
      />
      {value ? (
        <Pressable onPress={() => onChange('')} accessibilityLabel="Clear search" hitSlop={12}>
          <X size={16} color={colors.muted} strokeWidth={2} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 44,
    paddingHorizontal: 12,
    borderRadius: radius.input,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  input: { flex: 1, fontSize: 15, height: 44, padding: 0, outlineStyle: 'none' } as object,
});
