import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { Wallet } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { BackHeader } from '../components/BackHeader';
import { Button } from '../components/Button';
import { EmptyState } from '../components/EmptyState';
import { SolanaMark } from '../components/market/Network';
import { QrCode } from '../components/QrCode';
import { Screen } from '../components/Screen';
import { Segmented } from '../components/Segmented';
import { Text } from '../components/Text';
import { api } from '../lib/api';
import { haptic } from '../lib/motion';
import { useNetwork } from '../lib/network';
import { useSiftWallet } from '../lib/social-hooks';
import { colors, radius, space } from '../lib/theme';
import { useWallet } from '../lib/wallet';

/**
 * Deposit: your Solana address as a QR code and text, to receive SOL and tokens from an
 * exchange or another wallet. On devnet, free test SOL is one tap away.
 */
export default function DepositScreen() {
  const wallet = useWallet();
  const sift = useSiftWallet().data?.wallet;
  const { isDevnet } = useNetwork();
  const queryClient = useQueryClient();
  const [which, setWhich] = useState<'sift' | 'own'>(sift ? 'sift' : 'own');
  const [copied, setCopied] = useState(false);
  const address = which === 'sift' && sift ? sift.address : (wallet.address ?? sift?.address);
  const airdrop = useMutation({
    mutationFn: () => api.airdrop(address!),
    onSuccess: () => {
      haptic.confirm();
      setTimeout(() => void queryClient.invalidateQueries({ queryKey: ['holdings'] }), 4000);
    },
  });

  return (
    <Screen header={<BackHeader title="Deposit" />} maxWidth={520}>
      {!address ? (
        <EmptyState
          icon={Wallet}
          title="No wallet yet"
          body="Create your account on Home first: it makes a wallet you can deposit to."
          action={{ label: 'Go to Home', onPress: () => router.navigate('/') }}
        />
      ) : (
        <>
          {sift && wallet.address ? (
            <Segmented
              options={[
                { value: 'sift', label: 'Sift wallet' },
                { value: 'own', label: 'Your wallet' },
              ]}
              value={which}
              onChange={setWhich}
            />
          ) : null}
          <View style={styles.card}>
            <View style={styles.network}>
              <View style={styles.sol}>
                <SolanaMark size={14} />
              </View>
              <Text style={styles.networkText}>
                Solana {isDevnet ? 'devnet' : ''}
                <Text style={styles.muted}> · SOL and Solana tokens</Text>
              </Text>
            </View>
            <View style={styles.qr}>
              <QrCode value={address} size={200} />
            </View>
            <Text style={styles.label}>Your address</Text>
            <Text mono style={styles.address} selectable>
              {address}
            </Text>
            <Button
              label={copied ? 'Copied' : 'Copy address'}
              onPress={() => {
                void Clipboard.setStringAsync(address).then(() => {
                  haptic.confirm();
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                });
              }}
            />
          </View>
          <View style={styles.warn}>
            <Text style={styles.warnText}>
              {isDevnet
                ? 'Devnet: send only test SOL here. Real SOL sent to a devnet address is not usable in Sift.'
                : 'Send only SOL and Solana tokens on the Solana network. Coins from other networks sent here can be lost.'}
            </Text>
          </View>
          {isDevnet ? (
            <View style={styles.faucet}>
              <Button
                variant="secondary"
                label={
                  airdrop.isPending
                    ? 'Requesting…'
                    : airdrop.isSuccess
                      ? '1 test SOL on its way'
                      : 'Get 1 free test SOL'
                }
                onPress={() => airdrop.mutate()}
                disabled={airdrop.isPending || airdrop.isSuccess}
              />
              {airdrop.isError ? (
                <Text style={[styles.muted, { color: colors.down }]}>{airdrop.error.message}</Text>
              ) : null}
            </View>
          ) : null}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: 'center',
    gap: space.md,
    padding: space.lg,
    borderRadius: radius.card + 4,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  network: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'stretch' },
  sol: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  networkText: { fontSize: 14, fontWeight: '600' },
  muted: { fontSize: 13, fontWeight: '400', color: colors.muted },
  qr: { padding: 12, borderRadius: radius.card, backgroundColor: '#FFFFFF' },
  label: { fontSize: 12, color: colors.muted, marginTop: space.xs },
  // Addresses have no spaces: let them break anywhere so they never run off the card.
  address: {
    alignSelf: 'stretch',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginTop: -8,
    wordBreak: 'break-all',
  } as object,
  warn: { padding: space.md, borderRadius: radius.card, backgroundColor: colors.surface2 },
  warnText: { fontSize: 13, lineHeight: 19, color: colors.text2 },
  faucet: { gap: space.sm },
});
