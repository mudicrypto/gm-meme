import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';
import { DEFAULT_CLUSTER } from '@sift/shared';

// Placeholder until the real screens land in Step 5 (Expo Router).
export default function App() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Sift</Text>
      <Text style={styles.subtitle}>Safer meme trading, checked before you buy.</Text>
      <Text style={styles.badge}>Solana {DEFAULT_CLUSTER}</Text>
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 8,
  },
  title: { fontSize: 32, fontWeight: '700' },
  subtitle: { fontSize: 16, color: '#555', textAlign: 'center' },
  badge: { marginTop: 8, fontSize: 12, color: '#B45309' },
});
