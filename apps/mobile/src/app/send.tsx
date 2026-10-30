import { isSolanaAddress, transferProblems } from '@sift/shared';
import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { Wallet } from 'lucide-react-native';
import { useState } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';
import { BackHeader } from '../components/BackHeader';
import { Button } from '../components/Button';
import { EmptyState } from '../components/EmptyState';
import { Screen } from '../components/Screen';
import { Text, TextInput } from '../components/Text';
import { parseSolToLamports } from '../lib/amounts';
import { type SolTransfer, api } from '../lib/api';
import { formatCompact, shortAddress } from '../lib/format';
import { haptic } from '../lib/motion';
import { solscanUrl, useNetwork } from '../lib/network';
import { isCancelled } from '../lib/phantom';
import { usePortfolio } from '../lib/portfolio-hooks';
import { useSiftWallet } from '../lib/social-hooks';
import { colors, radius, space } from '../lib/theme';
import { useWallet } from '../lib/wallet';

const LAMPORTS = 1_000_000_000;
/** Signature plus Sift's fixed priority fee for a transfer (the server reports the same). */
const FEE_ESTIMATE = 6_000;

type Stage =
  | { name: 'edit' }
  | { name: 'building' }
  | { name: 'review'; transfer: SolTransfer; transaction: string; feeLamports: number }
  | { name: 'sending' }
  | { name: 'sent'; signature: string }
  | { name: 'failed'; message: string };

/**
 * Send SOL from your own wallet. Sift builds a plain transfer; this device checks it is
 * exactly the amount to exactly the address you typed, then your wallet signs it. The Sift
 * wallet doesn't send here: it only withdraws to its saved address (Wallet & security).
 */
export default function SendScreen() {
  const wallet = useWallet();
  const sift = useSiftWallet().data?.wallet;
  const { cluster, isDevnet } = useNetwork();
  const from = wallet.address;
  const { sol } = usePortfolio(from);
  const [to, setTo] = useState('');
  const [amount, setAmount] = useState('');
  const [stage, setStage] = useState<Stage>({ name: 'edit' });

  if (!from) {
    return (
      <Screen header={<BackHeader title="Send" />} maxWidth={520}>
        <EmptyState
          icon={Wallet}
          title="No wallet to send from"
          body={
            sift
              ? 'Your Sift wallet withdraws only to its saved address, from Wallet & security.'
              : 'Create your account on Home first.'
          }
          action={
            sift
              ? { label: 'Wallet & security', onPress: () => router.push('/wallet') }
              : { label: 'Go to Home', onPress: () => router.navigate('/') }
          }
        />
      </Screen>
    );
  }

  const lamportsText = parseSolToLamports(amount);
  const lamports = lamportsText ? Number(lamportsText) : 0;
  const toOk = isSolanaAddress(to.trim()) && to.trim() !== from;
  const max = sol !== undefined ? Math.max(0, sol - FEE_ESTIMATE / LAMPORTS) : undefined;
  const tooMuch = sol !== undefined && lamports + FEE_ESTIMATE > sol * LAMPORTS;
  const unit = isDevnet ? 'test SOL' : 'SOL';

  const review = async () => {
    const transfer = { from, to: to.trim(), lamports };
    setStage({ name: 'building' });
    try {
      const built = await api.buildTransfer(transfer);
      // Never sign what Sift's server sent without reading it: one transfer, as typed.
      const problems = transferProblems(built.transaction, transfer, {
        payer: 'your wallet',
        recipient: 'the address you entered',
      });
      if (problems.length > 0)
        throw new Error(`The transfer didn’t match what you asked for (${problems.join(', ')}).`);
      setStage({ name: 'review', transfer, ...built });
    } catch (err) {
      setStage({ name: 'failed', message: (err as Error).message });
    }
  };

  const send = async (s: Extract<Stage, { name: 'review' }>) => {
    setStage({ name: 'sending' });
    try {
      const signed = await wallet.signTransaction(s.transaction);
      const { signature } = await api.sendTransfer(s.transfer, signed);
      haptic.confirm();
      setStage({ name: 'sent', signature });
    } catch (err) {
      if (isCancelled(err)) setStage(s);
      else setStage({ name: 'failed', message: (err as Error).message });
    }
  };

  return (
    <Screen header={<BackHeader title="Send SOL" />} maxWidth={520}>
      {stage.name === 'review' || stage.name === 'sending' ? (
        <ReviewCard
          stage={stage}
          unit={unit}
          onBack={() => setStage({ name: 'edit' })}
          onSend={() => stage.name === 'review' && void send(stage)}
        />
      ) : stage.name === 'sent' ? (
        <View style={styles.card}>
          <Text style={styles.title}>Sent</Text>
          <Text style={styles.body}>
            {amount} {unit} is on its way to {shortAddress(to.trim(), 6)}.
          </Text>
          <Button
            variant="secondary"
            label="View on Solscan"
            onPress={() => void Linking.openURL(solscanUrl('tx', stage.signature, cluster))}
          />
          <Button label="Done" onPress={() => router.back()} />
        </View>
      ) : (
        <>
          <View style={styles.card}>
            <Text style={styles.label}>To</Text>
            <View style={styles.inputRow}>
              <TextInput
                value={to}
                onChangeText={setTo}
                placeholder="Solana address"
                autoCapitalize="none"
                autoCorrect={false}
                accessibilityLabel="Recipient address"
                style={styles.input}
              />
              <Pressable
                onPress={() => void Clipboard.getStringAsync().then((t) => setTo(t.trim()))}
                accessibilityRole="button"
                hitSlop={8}
              >
                <Text style={styles.link}>Paste</Text>
              </Pressable>
            </View>
            {to && !toOk ? (
              <Text style={styles.error}>
                {to.trim() === from ? 'That’s this wallet.' : 'Not a Solana address.'}
              </Text>
            ) : null}

            <Text style={[styles.label, { marginTop: space.sm }]}>Amount</Text>
            <View style={styles.inputRow}>
              <TextInput
                mono
                value={amount}
                onChangeText={(v) => setAmount(v.replace(',', '.').replace(/[^0-9.]/g, ''))}
                placeholder="0.0"
                keyboardType="decimal-pad"
                accessibilityLabel={`Amount in ${unit}`}
                style={[styles.input, styles.amount]}
              />
              <Text style={styles.unit}>SOL</Text>
              <Pressable
                onPress={() => max !== undefined && setAmount(String(Number(max.toFixed(6))))}
                accessibilityRole="button"
                hitSlop={8}
              >
                <Text style={styles.link}>Max</Text>
              </Pressable>
            </View>
            <Text style={tooMuch ? styles.error : styles.muted}>
              Available {sol !== undefined ? `${formatCompact(sol)} ${unit}` : '…'} · network fee
              about 0.000005 SOL
            </Text>
          </View>
          {stage.name === 'failed' ? <Text style={styles.error}>{stage.message}</Text> : null}
          <Button
            label={stage.name === 'building' ? 'Checking…' : 'Review send'}
            onPress={() => void review()}
            disabled={!toOk || lamports <= 0 || tooMuch || stage.name === 'building'}
          />
          <Text style={styles.muted}>
            Transfers on Solana can’t be undone. Check the address: you confirm before anything is
            signed.
          </Text>
        </>
      )}
    </Screen>
  );
}

function ReviewCard({
  stage,
  unit,
  onBack,
  onSend,
}: {
  stage: Extract<Stage, { name: 'review' }> | { name: 'sending' };
  unit: string;
  onBack: () => void;
  onSend: () => void;
}) {
  if (stage.name === 'sending')
    return (
      <View style={styles.card}>
        <Text style={styles.title}>Sending…</Text>
        <Text style={styles.body}>Approve it in your wallet if it asks.</Text>
      </View>
    );
  const { transfer, feeLamports } = stage;
  const rows: Array<[string, string]> = [
    ['Amount', `${transfer.lamports / LAMPORTS} ${unit}`],
    ['Network fee', `${feeLamports / LAMPORTS} SOL`],
    ['Total', `${(transfer.lamports + feeLamports) / LAMPORTS} ${unit}`],
  ];
  return (
    <>
      <View style={styles.card}>
        <Text style={styles.label}>To</Text>
        <Text mono style={styles.address} selectable>
          {transfer.to}
        </Text>
        {rows.map(([label, value]) => (
          <View key={label} style={styles.row}>
            <Text style={styles.muted}>{label}</Text>
            <Text mono style={styles.value}>
              {value}
            </Text>
          </View>
        ))}
        <Text style={styles.muted}>Checked on this device: one transfer, exactly as above.</Text>
      </View>
      <Button label="Confirm and send" onPress={onSend} confirm />
      <Button variant="secondary" label="Edit" onPress={onBack} />
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: space.sm,
    padding: space.lg,
    borderRadius: radius.card + 4,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  title: { fontSize: 20, fontWeight: '700' },
  body: { fontSize: 14, lineHeight: 20, color: colors.text2 },
  label: { fontSize: 13, fontWeight: '600', color: colors.muted },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 50,
    paddingHorizontal: 14,
    borderRadius: radius.input,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.bg,
  },
  input: { flex: 1, minWidth: 0, fontSize: 15, padding: 0, outlineStyle: 'none' } as object,
  amount: { fontSize: 20, fontWeight: '600' },
  unit: { fontSize: 14, fontWeight: '600', color: colors.muted },
  link: { fontSize: 14, fontWeight: '600', color: colors.link },
  muted: { fontSize: 12, lineHeight: 17, color: colors.muted },
  error: { fontSize: 12, lineHeight: 17, color: colors.down },
  address: { fontSize: 14, lineHeight: 20, wordBreak: 'break-all' } as object,
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  value: { fontSize: 14, fontWeight: '600' },
});
