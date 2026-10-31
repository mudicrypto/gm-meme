import { Search, X } from 'lucide-react-native';
import type { Ref } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { colors, radius } from '../../lib/theme';
import { Text, TextInput, type TextInputHandle } from '../Text';

export function SearchBar({
  value,
  onChange,
  placeholder = 'Token or address…',
  onSubmit,
  hint,
  inputRef,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  onSubmit?: () => void;
  /** A keyboard shortcut shown at the right while the box is empty, like "⌘K". */
  hint?: string;
  inputRef?: Ref<TextInputHandle>;
}) {
  return (
    <View style={styles.box}>
      <Search size={18} color={colors.muted} strokeWidth={2} />
      <TextInput
        ref={inputRef}
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
      ) : hint ? (
        <View style={styles.hint}>
          <Text style={styles.hintText}>{hint}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 40,
    paddingHorizontal: 12,
    borderRadius: radius.input + 2,
    backgroundColor: colors.surface2,
  },
  hint: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  hintText: { fontSize: 12, fontWeight: '600', color: colors.muted },
  input: { flex: 1, fontSize: 15, height: 40, padding: 0, outlineStyle: 'none' } as object,
});
