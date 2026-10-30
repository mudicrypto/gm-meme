import {
  LAMPORTS_PER_SOL,
  type SiftWalletInfo,
  base58Encode,
  base64ToBytes,
  bytesToBase64,
  hpkeKeyPair,
  hpkeOpen,
  isSolanaAddress,
} from '@sift/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import { router, useFocusEffect } from 'expo-router';
import { usePreventScreenCapture } from 'expo-screen-capture';
import {
  Copy,
  KeyRound,
  ShieldAlert,
  ShieldCheck,
  Snowflake,
  Wallet as WalletIcon,
} from 'lucide-react-native';
import { type ReactNode, useCallback, useEffect, useState } from 'react';
import { AppState, Linking, Platform, Pressable, StyleSheet, View } from 'react-native';
import { BackHeader } from '../components/BackHeader';
import { Button, Chip, IconButton } from '../components/Button';
import { Card } from '../components/Card';
import { CodeInput } from '../components/CodeInput';
import { DevnetBadge } from '../components/DevnetBadge';
import { Screen } from '../components/Screen';
import { SectionLabel, SettingsGroup, SettingsRow, StatusPill } from '../components/Settings';
import { Sheet } from '../components/Sheet';
import { SignInCard } from '../components/SignInCard';
import { Loading } from '../components/States';
import { Switch } from '../components/Switch';
import { Text, TextInput } from '../components/Text';
import { siftApi } from '../lib/api';
import { confirmOwner } from '../lib/device-auth';
import { formatCompact, shortAddress } from '../lib/format';
import { useSession } from '../lib/session';
import { useSiftBalance, useSiftWallet } from '../lib/social-hooks';
import { colors, radius, tint } from '../lib/theme';
import { solWord, useNetwork } from '../lib/network';

type SheetName = '2fa' | 'address' | 'withdraw' | 'export' | 'limits' | null;

const sol = (lamports: number) => formatCompact(lamports / LAMPORTS_PER_SOL);

export default function WalletScreen() {
  const session = useSession();
  const query = useSiftWallet();
  const [sheet, setSheet] = useState<SheetName>(null);
  const wallet = query.data?.wallet ?? null;

  return (
    <Screen
      header={<BackHeader title="Wallet & security" right={<DevnetBadge />} />}
      refreshing={query.isRefetching}
      onRefresh={() => void query.refetch()}
    >
      {session.status !== 'signed-in' ? (
        <SignInCard reason="Sign in to create your Sift wallet and run orders while your phone is off." />
      ) : query.isPending ? (
        <Loading />
      ) : wallet ? (
        <WalletDetails wallet={wallet} open={setSheet} />
      ) : (
        <CreateSiftWallet signing={query.data?.signing ?? 'not_configured'} />
      )}

      {wallet ? (
        <>
          <TwoFactorSheet visible={sheet === '2fa'} onClose={() => setSheet(null)} />
          <AddressSheet visible={sheet === 'address'} onClose={() => setSheet(null)} />
          <WithdrawSheet
            wallet={wallet}
            visible={sheet === 'withdraw'}
            onClose={() => setSheet(null)}
          />
          <ExportSheet visible={sheet === 'export'} onClose={() => setSheet(null)} />
          <LimitsSheet
            wallet={wallet}
            visible={sheet === 'limits'}
            onClose={() => setSheet(null)}
          />
        </>
      ) : null}
    </Screen>
  );
}

function useRefreshWallet() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ['social', 'sift-wallet'] });
}

function CreateSiftWallet({ signing }: { signing: SiftWalletInfo['signing'] }) {
  const { token } = useSession();
  const refresh = useRefreshWallet();
  const create = useMutation({ mutationFn: () => siftApi.create(token!), onSuccess: refresh });
  const points: Array<[ReactNode, string, string]> = [
    [
      <ShieldCheck key="1" size={18} color={colors.up} strokeWidth={2} />,
      'Orders while your phone is off',
      'Stop losses, take profits and limit buys run on their own.',
    ],
    [
      <KeyRound key="2" size={18} color={colors.link} strokeWidth={2} />,
      'Your key, any time',
      'Export it to Phantom or any Solana wallet, behind a 2FA code.',
    ],
    [
      <ShieldAlert key="3" size={18} color={colors.caution} strokeWidth={2} />,
      'Withdrawals locked down',
      '2FA code, one saved address, and a 24-hour wait after changes.',
    ],
  ];
  return (
    <>
      <View style={styles.hero}>
        <View style={styles.heroIcon}>
          <WalletIcon size={26} color={colors.onAccent} strokeWidth={2} />
        </View>
        <Text style={styles.heroTitle}>Your Sift wallet</Text>
        <Text style={styles.heroBody}>
          A wallet Sift runs for you, so your orders and protection work even when your phone is
          off.
        </Text>
        <View style={styles.points}>
          {points.map(([icon, title, body]) => (
            <View key={title} style={styles.point}>
              <View style={styles.pointIcon}>{icon}</View>
              <View style={styles.flex}>
                <Text style={styles.pointTitle}>{title}</Text>
                <Text style={styles.pointBody}>{body}</Text>
              </View>
            </View>
          ))}
        </View>
      </View>
      {signing === 'not_configured' ? (
        <Card>
          <Text style={styles.body}>
            The Sift wallet isn’t switched on for this server yet. Your phone wallet keeps working
            as before.
          </Text>
        </Card>
      ) : (
        <Button
          label={create.isPending ? 'Creating…' : 'Create Sift wallet'}
          disabled={create.isPending}
          onPress={() => create.mutate()}
        />
      )}
      {create.isError ? <Text style={styles.error}>{create.error.message}</Text> : null}
      <CustodyNote />
    </>
  );
}

function CustodyNote() {
  return (
    <Text style={styles.note}>
      Sift holds the key to your Sift wallet in a secure signing vault (Privy) so it can run your
      orders. Sift’s servers never see the key. Keep only what you trade here. Test network only.
    </Text>
  );
}

function WalletDetails({
  wallet,
  open,
}: {
  wallet: SiftWalletInfo;
  open: (sheet: SheetName) => void;
}) {
  const { token } = useSession();
  const refresh = useRefreshWallet();
  const balance = useSiftBalance(wallet.address);
  const { isDevnet } = useNetwork();
  const [copied, setCopied] = useState(false);
  const [unfreezing, setUnfreezing] = useState(false);
  const freeze = useMutation({ mutationFn: () => siftApi.freeze(token!), onSuccess: refresh });

  const [now] = useState(Date.now);
  const hold =
    wallet.withdrawal.readyAt && Date.parse(wallet.withdrawal.readyAt) > now
      ? new Date(wallet.withdrawal.readyAt)
      : null;
  const { perOrderLamports, dailyLamports, usedTodayLamports } = wallet.limits;
  const used = Math.min(1, usedTodayLamports / dailyLamports);

  return (
    <>
      <Card>
        <View style={styles.walletRow}>
          <View style={styles.walletIcon}>
            <WalletIcon size={22} color={colors.onAccent} strokeWidth={2} />
          </View>
          <View style={styles.flex}>
            <Text style={styles.walletTitle}>Sift wallet</Text>
            <Text mono style={styles.walletMeta}>
              {shortAddress(wallet.address)}
              {balance.data ? ` · ${formatCompact(balance.data.solBalance)} SOL` : ''}
            </Text>
          </View>
          <IconButton
            label="Copy address"
            onPress={async () => {
              await Clipboard.setStringAsync(wallet.address);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
          >
            <Copy size={18} color={copied ? colors.up : colors.text2} strokeWidth={2} />
          </IconButton>
        </View>
        <Text style={styles.body}>
          {copied
            ? `Address copied. Send ${solWord(isDevnet)} to it to add funds.`
            : 'Created for you. Sift runs your orders from it, even when your phone is off.'}
        </Text>
        {wallet.frozen ? (
          <Banner tone="danger" text="Frozen: nothing is signed from this wallet." />
        ) : wallet.signing === 'paused' ? (
          <Banner
            tone="warn"
            text="Sift has paused all signing for now. Your funds are untouched."
          />
        ) : null}
      </Card>

      <SectionLabel>Withdrawal protection</SectionLabel>
      <SettingsGroup>
        <SettingsRow
          title="Two-factor code"
          subtitle={
            wallet.twoFactor.enabled
              ? 'Needed for every withdrawal and key export'
              : 'Set up an authenticator app to withdraw or export'
          }
          right={
            <StatusPill
              label={wallet.twoFactor.enabled ? 'On' : 'Set up'}
              tone={wallet.twoFactor.enabled ? 'ok' : 'warn'}
            />
          }
          onPress={wallet.twoFactor.enabled ? undefined : () => open('2fa')}
        />
        <SettingsRow
          title="Saved withdrawal address"
          subtitle={
            wallet.withdrawal.address
              ? shortAddress(wallet.withdrawal.address, 6)
              : 'The only address withdrawals can go to'
          }
          right={
            <StatusPill
              label={wallet.withdrawal.address ? 'Set' : 'Add'}
              tone={wallet.withdrawal.address ? 'ok' : 'warn'}
            />
          }
          onPress={() => open('address')}
        />
        <SettingsRow
          title="24-hour wait on changes"
          subtitle={
            hold
              ? `Withdrawals open ${hold.toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' })}`
              : 'New address or 2FA change'
          }
          right={<StatusPill label={hold ? 'Waiting' : 'On'} tone={hold ? 'warn' : 'ok'} />}
        />
        <SettingsRow
          title="Withdraw"
          subtitle="Send SOL to your saved address"
          onPress={() => open('withdraw')}
          last
        />
      </SettingsGroup>

      <SectionLabel>Limits</SectionLabel>
      <SettingsGroup>
        <SettingsRow
          title="Per order"
          subtitle="Largest single buy Sift will sign"
          right={
            <Text mono style={styles.value}>
              {sol(perOrderLamports)} SOL
            </Text>
          }
          onPress={() => open('limits')}
        />
        <Pressable
          onPress={() => open('limits')}
          accessibilityRole="button"
          style={styles.dailyRow}
        >
          <View style={styles.dailyTop}>
            <View style={styles.flex}>
              <Text style={styles.rowTitle}>Daily</Text>
              <Text style={styles.rowSub}>Buys in the last 24 hours</Text>
            </View>
            <Text mono style={styles.value}>
              {sol(usedTodayLamports)} / {sol(dailyLamports)} SOL
            </Text>
          </View>
          <View style={styles.track}>
            <View
              style={[
                styles.fill,
                {
                  width: `${used * 100}%`,
                  backgroundColor: used > 0.8 ? colors.caution : colors.accent,
                },
              ]}
            />
          </View>
        </Pressable>
      </SettingsGroup>

      <SectionLabel>Your keys</SectionLabel>
      <SettingsGroup>
        <SettingsRow
          icon={<KeyRound size={20} color={colors.text} strokeWidth={2} />}
          title="Export private key"
          subtitle="Move your wallet to Phantom or any Solana app. Your money, your choice."
          onPress={() => open('export')}
        />
        <SettingsRow
          icon={<View style={styles.phantom} />}
          title="Connect Phantom"
          subtitle="Optional. Trade from your own wallet; you sign each trade. Auto orders stay in the Sift wallet."
          right={<Text style={styles.link}>Connect</Text>}
          onPress={() => router.push('/portfolio')}
          last
        />
      </SettingsGroup>

      <SectionLabel>Emergency</SectionLabel>
      <SettingsGroup>
        <SettingsRow
          icon={<Snowflake size={20} color={colors.down} strokeWidth={2} />}
          title="Freeze my Sift wallet"
          subtitle="Stops every order, trade and withdrawal at once"
          right={
            <Switch
              value={wallet.frozen}
              label="Freeze my Sift wallet"
              onValueChange={(next) => {
                if (next) freeze.mutate();
                else setUnfreezing(true);
              }}
            />
          }
          last
        />
      </SettingsGroup>
      <Text style={styles.note}>
        Sift holds the key to your Sift wallet in a secure signing vault (Privy) so it can run your
        orders. Sift’s servers never see it, and every signature is checked against your limits.
        Keep only what you trade here.
      </Text>
      <UnfreezeSheet
        visible={unfreezing}
        needsCode={wallet.twoFactor.enabled}
        onClose={() => setUnfreezing(false)}
      />
    </>
  );
}

function Banner({ tone, text }: { tone: 'warn' | 'danger'; text: string }) {
  const fg = tone === 'danger' ? colors.down : colors.caution;
  return (
    <View style={[styles.banner, { backgroundColor: tint(fg, 0.1), borderColor: tint(fg, 0.3) }]}>
      <Text style={[styles.bannerText, { color: fg }]}>{text}</Text>
    </View>
  );
}

function SheetError({ error }: { error: Error | null }) {
  return error ? <Text style={styles.error}>{error.message}</Text> : null;
}

function UnfreezeSheet({
  visible,
  needsCode,
  onClose,
}: {
  visible: boolean;
  needsCode: boolean;
  onClose: () => void;
}) {
  const { token } = useSession();
  const refresh = useRefreshWallet();
  const [code, setCode] = useState('');
  const unfreeze = useMutation({
    mutationFn: () => siftApi.unfreeze(token!, needsCode ? code : undefined),
    onSuccess: async () => {
      setCode('');
      onClose();
      await refresh();
    },
  });
  return (
    <Sheet visible={visible} onClose={onClose} title="Unfreeze your Sift wallet">
      <Text style={styles.body}>
        Orders, trades and withdrawals will be signed again, within your limits.
      </Text>
      {needsCode ? <CodeInput value={code} onChange={setCode} autoFocus /> : null}
      <Button
        label={unfreeze.isPending ? 'Unfreezing…' : 'Unfreeze'}
        disabled={unfreeze.isPending || (needsCode && code.length !== 6)}
        onPress={() => unfreeze.mutate()}
      />
      <SheetError error={unfreeze.error} />
    </Sheet>
  );
}

function TwoFactorSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { token } = useSession();
  const refresh = useRefreshWallet();
  const [code, setCode] = useState('');
  const [copied, setCopied] = useState(false);
  const start = useMutation({ mutationFn: () => siftApi.startTwoFactor(token!) });
  const confirm = useMutation({
    mutationFn: () => siftApi.confirmTwoFactor(token!, code),
    onSuccess: async () => {
      setCode('');
      onClose();
      await refresh();
    },
  });
  useEffect(() => {
    if (visible && !start.data && !start.isPending) start.mutate();
  }, [visible, start]);
  const secret = start.data?.secret;

  return (
    <Sheet visible={visible} onClose={onClose} title="Set up two-factor codes">
      <Text style={styles.body}>
        Add Sift to an authenticator app (Google Authenticator, 1Password, Authy). It shows a new
        6-digit code every 30 seconds.
      </Text>
      {secret ? (
        <>
          <View style={styles.secretBox}>
            <Text style={styles.secretLabel}>Setup key</Text>
            <Text mono style={styles.secretText}>
              {secret.match(/.{1,4}/g)?.join(' ')}
            </Text>
          </View>
          <View style={styles.sheetRow}>
            <View style={styles.flex}>
              <Button
                small
                variant="secondary"
                label="Open authenticator"
                onPress={() => void Linking.openURL(start.data!.uri).catch(() => {})}
              />
            </View>
            <View style={styles.flex}>
              <Button
                small
                variant="secondary"
                label={copied ? 'Copied' : 'Copy key'}
                onPress={async () => {
                  await Clipboard.setStringAsync(secret);
                  setCopied(true);
                }}
              />
            </View>
          </View>
          <Text style={styles.fieldLabel}>Then enter the code it shows</Text>
          <CodeInput value={code} onChange={setCode} />
          <Button
            label={confirm.isPending ? 'Checking…' : 'Turn on'}
            disabled={code.length !== 6 || confirm.isPending}
            onPress={() => confirm.mutate()}
          />
        </>
      ) : (
        <Loading />
      )}
      <SheetError error={start.error ?? confirm.error} />
    </Sheet>
  );
}

function AddressSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { token } = useSession();
  const refresh = useRefreshWallet();
  const [address, setAddress] = useState('');
  const [code, setCode] = useState('');
  const valid = isSolanaAddress(address.trim());
  const save = useMutation({
    mutationFn: () => siftApi.setWithdrawalAddress(token!, address.trim(), code),
    onSuccess: async () => {
      setAddress('');
      setCode('');
      onClose();
      await refresh();
    },
  });
  return (
    <Sheet visible={visible} onClose={onClose} title="Saved withdrawal address">
      <Text style={styles.body}>
        Withdrawals can only go here. After you change it, withdrawals wait 24 hours, and you get a
        notification in case it wasn’t you.
      </Text>
      <TextInput
        mono
        value={address}
        onChangeText={setAddress}
        placeholder="Your Phantom or other Solana address"
        autoCapitalize="none"
        autoCorrect={false}
        style={styles.input}
      />
      {address.length > 0 && !valid ? (
        <Text style={styles.error}>That doesn’t look like a Solana address.</Text>
      ) : null}
      <Text style={styles.fieldLabel}>2FA code</Text>
      <CodeInput value={code} onChange={setCode} />
      <Button
        label={save.isPending ? 'Saving…' : 'Save address'}
        disabled={!valid || code.length !== 6 || save.isPending}
        onPress={() => save.mutate()}
      />
      <SheetError error={save.error} />
    </Sheet>
  );
}

function WithdrawSheet({
  wallet,
  visible,
  onClose,
}: {
  wallet: SiftWalletInfo;
  visible: boolean;
  onClose: () => void;
}) {
  const { token } = useSession();
  const balance = useSiftBalance(wallet.address);
  const [amount, setAmount] = useState('');
  const [code, setCode] = useState('');
  const available = Math.max(0, (balance.data?.solBalance ?? 0) - 0.00001);
  const lamports = Math.round(Number(amount) * LAMPORTS_PER_SOL);
  const withdraw = useMutation({
    mutationFn: () => siftApi.withdraw(token!, lamports, code),
    onSuccess: () => {
      setAmount('');
      setCode('');
      void balance.refetch();
    },
  });
  const blocked = !wallet.withdrawal.address
    ? 'Save a withdrawal address first.'
    : !wallet.twoFactor.enabled
      ? 'Turn on two-factor codes first.'
      : null;
  return (
    <Sheet visible={visible} onClose={onClose} title="Withdraw SOL">
      {blocked ? (
        <Text style={styles.body}>{blocked}</Text>
      ) : withdraw.data ? (
        <>
          <Text style={styles.body}>Sent. It reaches your saved address in a few seconds.</Text>
          <Button label="Done" onPress={onClose} />
        </>
      ) : (
        <>
          <Text style={styles.body}>
            To {shortAddress(wallet.withdrawal.address!, 6)} · network fee under 0.00001 SOL
          </Text>
          <View style={styles.amountRow}>
            <TextInput
              mono
              value={amount}
              onChangeText={setAmount}
              placeholder="0.0"
              keyboardType="decimal-pad"
              style={styles.amountInput}
            />
            <Text mono style={styles.amountUnit}>
              SOL
            </Text>
          </View>
          <View style={styles.chips}>
            {[0.25, 0.5, 1].map((share) => (
              <Chip
                key={share}
                mono
                filled={false}
                label={share === 1 ? 'Max' : `${share * 100}%`}
                selected={false}
                onPress={() => setAmount(String(Number((available * share).toFixed(6))))}
              />
            ))}
          </View>
          <Text style={styles.fieldLabel}>2FA code</Text>
          <CodeInput value={code} onChange={setCode} />
          <Button
            label={withdraw.isPending ? 'Sending…' : 'Withdraw'}
            disabled={!(lamports > 0) || code.length !== 6 || withdraw.isPending}
            onPress={() => withdraw.mutate()}
          />
        </>
      )}
      <SheetError error={withdraw.error} />
    </Sheet>
  );
}

function LimitsSheet({
  wallet,
  visible,
  onClose,
}: {
  wallet: SiftWalletInfo;
  visible: boolean;
  onClose: () => void;
}) {
  const { token } = useSession();
  const refresh = useRefreshWallet();
  const [perOrder, setPerOrder] = useState(
    String(wallet.limits.perOrderLamports / LAMPORTS_PER_SOL),
  );
  const [daily, setDaily] = useState(String(wallet.limits.dailyLamports / LAMPORTS_PER_SOL));
  const [code, setCode] = useState('');
  const next = {
    perOrderLamports: Math.round(Number(perOrder) * LAMPORTS_PER_SOL),
    dailyLamports: Math.round(Number(daily) * LAMPORTS_PER_SOL),
  };
  const raising =
    next.perOrderLamports > wallet.limits.perOrderLamports ||
    next.dailyLamports > wallet.limits.dailyLamports;
  const save = useMutation({
    mutationFn: () => siftApi.setLimits(token!, { ...next, ...(raising ? { code } : {}) }),
    onSuccess: async () => {
      setCode('');
      onClose();
      await refresh();
    },
  });
  return (
    <Sheet visible={visible} onClose={onClose} title="Limits">
      <Text style={styles.body}>
        Sift won’t sign a buy above these, even if your orders ask it to. Lowering takes effect now;
        raising needs a 2FA code.
      </Text>
      <View style={styles.sheetRow}>
        <View style={styles.flex}>
          <Text style={styles.fieldLabel}>Per order (SOL)</Text>
          <TextInput
            mono
            value={perOrder}
            onChangeText={setPerOrder}
            keyboardType="decimal-pad"
            style={styles.input}
          />
        </View>
        <View style={styles.flex}>
          <Text style={styles.fieldLabel}>Daily (SOL)</Text>
          <TextInput
            mono
            value={daily}
            onChangeText={setDaily}
            keyboardType="decimal-pad"
            style={styles.input}
          />
        </View>
      </View>
      {raising ? <CodeInput value={code} onChange={setCode} /> : null}
      <Button
        label={save.isPending ? 'Saving…' : 'Save limits'}
        disabled={
          !(next.perOrderLamports > 0 && next.dailyLamports > 0) ||
          (raising && code.length !== 6) ||
          save.isPending
        }
        onPress={() => save.mutate()}
      />
      <SheetError error={save.error} />
    </Sheet>
  );
}

/** Show decrypted key bytes the way wallets import them. */
function keyText(bytes: Uint8Array): string {
  const printable = bytes.every((b) => b >= 0x21 && b <= 0x7e);
  return printable ? String.fromCharCode(...bytes) : base58Encode(bytes);
}

function ExportSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { token } = useSession();
  const [code, setCode] = useState('');
  const [understood, setUnderstood] = useState(false);
  const [secret, setSecret] = useState<string | null>(null);
  const close = useCallback(() => {
    setSecret(null);
    setCode('');
    setUnderstood(false);
    onClose();
  }, [onClose]);

  useFocusEffect(useCallback(() => () => setSecret(null), []));
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') setSecret(null);
    });
    return () => subscription.remove();
  }, []);

  const reveal = useMutation({
    mutationFn: async () => {
      if (!(await confirmOwner('Confirm it’s you to export your Sift wallet key')))
        throw new Error('Not confirmed, so the key stays hidden.');
      // A one-time key pair: the key is encrypted to it, so only this phone can read it.
      const keys = hpkeKeyPair();
      const encrypted = await siftApi.exportKey(token!, code, bytesToBase64(keys.publicKey));
      const plain = hpkeOpen({
        secretKey: keys.secretKey,
        encapsulatedKey: base64ToBytes(encrypted.encapsulatedKey),
        ciphertext: base64ToBytes(encrypted.ciphertext),
      });
      return keyText(plain);
    },
    onSuccess: setSecret,
  });

  return (
    <Sheet visible={visible} onClose={close} title="Export private key">
      {secret ? (
        <>
          {Platform.OS !== 'web' ? <NoScreenCapture /> : null}
          {/* Not selectable: copied keys end up in clipboard history and keyboard apps. */}
          <Text mono style={styles.keyBox}>
            {secret}
          </Text>
          <Text style={styles.danger}>
            Anyone with this key can take everything in this wallet. Write it down on paper. Sift
            staff will never ask for it.
          </Text>
          <Button label="Hide key" variant="secondary" onPress={close} />
        </>
      ) : (
        <>
          <View style={styles.warning}>
            {[
              'Anyone with this key controls your Sift wallet.',
              'Sift staff will never ask for it. Never paste it into a website.',
              'You can import it into Phantom, Solflare or Backpack.',
            ].map((line) => (
              <View key={line} style={styles.warningLine}>
                <ShieldAlert size={16} color={colors.down} strokeWidth={2} />
                <Text style={styles.warningText}>{line}</Text>
              </View>
            ))}
          </View>
          <View style={styles.sheetRow}>
            <Text style={[styles.body, styles.flex]}>I understand the risk</Text>
            <Switch
              value={understood}
              onValueChange={setUnderstood}
              label="I understand the risk"
            />
          </View>
          <Text style={styles.fieldLabel}>2FA code</Text>
          <CodeInput value={code} onChange={setCode} />
          <Button
            label={reveal.isPending ? 'Decrypting…' : 'Show key'}
            disabled={!understood || code.length !== 6 || reveal.isPending}
            onPress={() => reveal.mutate()}
          />
        </>
      )}
      <SheetError error={reveal.error} />
    </Sheet>
  );
}

/** Blocks screenshots and screen recording while mounted. */
function NoScreenCapture() {
  usePreventScreenCapture('sift-wallet-key');
  return null;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  hero: {
    padding: 20,
    borderRadius: radius.hero,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 10,
  },
  heroIcon: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTitle: { fontSize: 22, fontWeight: '800', letterSpacing: -0.5, marginTop: 4 },
  heroBody: { fontSize: 14, lineHeight: 21, color: colors.text2 },
  points: { gap: 14, marginTop: 6 },
  point: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  pointIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pointTitle: { fontSize: 14, fontWeight: '700' },
  pointBody: { fontSize: 13, color: colors.muted, marginTop: 2, lineHeight: 18 },
  body: { fontSize: 13, lineHeight: 19, color: colors.text2 },
  note: { fontSize: 12, lineHeight: 18, color: colors.faint, marginTop: 6 },
  error: { fontSize: 13, color: colors.down },
  danger: { fontSize: 13, lineHeight: 19, color: colors.down },
  walletRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  walletIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  walletTitle: { fontSize: 16, fontWeight: '800' },
  walletMeta: { fontSize: 12, color: colors.muted, marginTop: 2 },
  banner: { borderRadius: radius.chip, borderWidth: 1, padding: 10 },
  bannerText: { fontSize: 13, fontWeight: '700' },
  value: { fontSize: 14, fontWeight: '600', color: colors.body },
  rowTitle: { fontSize: 14, fontWeight: '700' },
  rowSub: { fontSize: 12, color: colors.muted, marginTop: 2 },
  dailyRow: { paddingVertical: 13, gap: 10 },
  dailyTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  track: { height: 6, borderRadius: 3, backgroundColor: colors.borderStrong, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 3 },
  phantom: { width: 20, height: 20, borderRadius: 6, backgroundColor: '#2A2350' },
  link: { fontSize: 13, fontWeight: '700', color: colors.link },
  secretBox: {
    padding: 14,
    borderRadius: radius.input,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    gap: 4,
  },
  secretLabel: { fontSize: 12, color: colors.muted },
  secretText: { fontSize: 15, fontWeight: '600', letterSpacing: 1 },
  sheetRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  fieldLabel: { fontSize: 13, color: colors.muted, marginBottom: -4 },
  input: {
    height: 52,
    borderRadius: radius.input,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.bg,
    paddingHorizontal: 14,
    fontSize: 14,
    marginTop: 6,
  },
  amountRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', gap: 8 },
  amountInput: { fontSize: 40, fontWeight: '600', minWidth: 120, textAlign: 'center', padding: 0 },
  amountUnit: { fontSize: 18, fontWeight: '600', color: colors.muted },
  chips: { flexDirection: 'row', gap: 8, justifyContent: 'center' },
  keyBox: {
    padding: 14,
    borderRadius: radius.input,
    borderWidth: 1,
    borderColor: tint(colors.down, 0.35),
    backgroundColor: colors.bg,
    fontSize: 13,
    lineHeight: 20,
  },
  warning: {
    padding: 14,
    borderRadius: radius.input,
    backgroundColor: tint(colors.down, 0.08),
    borderWidth: 1,
    borderColor: tint(colors.down, 0.25),
    gap: 10,
  },
  warningLine: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  warningText: { flex: 1, fontSize: 13, lineHeight: 19, color: colors.body },
});
