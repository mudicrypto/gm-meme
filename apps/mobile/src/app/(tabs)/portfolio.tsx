import AsyncStorage from '@react-native-async-storage/async-storage';
import { type Holding, isSolanaAddress } from '@sift/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { Card } from '../../components/Card';
import { DevnetBadge } from '../../components/DevnetBadge';
import { ModeToggle } from '../../components/ModeToggle';
import { PrivateKeyReveal } from '../../components/PrivateKeyReveal';
import { RiskDot } from '../../components/RiskBadge';
import { BrowserConnect } from '../../components/BrowserConnect';
import { LegalLinks } from '../../components/LegalLinks';
import { Screen, SectionTitle } from '../../components/Screen';
import { SiftWalletCard } from '../../components/SiftWalletCard';
import { Text, TextInput } from '../../components/Text';
import { Empty, ErrorState, Loading } from '../../components/States';
import { TokenAvatar } from '../../components/TokenAvatar';
import { api } from '../../lib/api';
import { confirmOwner } from '../../lib/device-auth';
import { formatCompact, shortAddress } from '../../lib/format';
import { useMode } from '../../lib/mode';
import { RISK_COLORS, RISK_LABELS, colors, radius, usePalette } from '../../lib/theme';
import { mwaErrorMessage } from '../../lib/mwa-results';
import { cancelPhantomRequest, isCancelled } from '../../lib/phantom';
import { type WalletKind, useWallet } from '../../lib/wallet';

const WATCH_KEY = 'sift.watchedWallet';

export default function PortfolioScreen() {
  const wallet = useWallet();
  const [watched, setWatched] = useState<string | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(WATCH_KEY)
      .then((saved) => saved && setWatched(saved))
      .catch(() => {});
  }, []);
  const watch = (address: string | null) => {
    setWatched(address);
    (address ? AsyncStorage.setItem(WATCH_KEY, address) : AsyncStorage.removeItem(WATCH_KEY)).catch(
      () => {},
    );
  };

  const config = useQuery({ queryKey: ['config'], queryFn: api.config, staleTime: Infinity });
  return (
    <Screen
      title="Portfolio"
      right={
        <View style={styles.headerRight}>
          {config.data?.cluster === 'devnet' ? <DevnetBadge /> : null}
          <ModeToggle />
        </View>
      }
    >
      <SiftWalletCard />
      {wallet.status === 'loading' ? <Loading /> : null}
      {wallet.status === 'loading' ? null : wallet.address && wallet.kind ? (
        <OwnWallet address={wallet.address} kind={wallet.kind} />
      ) : (
        <>
          {Platform.OS === 'web' ? <BrowserConnect /> : <CreateWallet />}
          {watched ? (
            <Holdings address={watched} title="Watched wallet" onClear={() => watch(null)} />
          ) : (
            <WatchWallet onWatch={watch} />
          )}
        </>
      )}
      <LegalLinks />
    </Screen>
  );
}

function CreateWallet() {
  const palette = usePalette();
  const wallet = useWallet();
  const [busy, setBusy] = useState(false);
  return (
    <Card title="Your wallet">
      <Text style={{ color: palette.muted }}>
        Create a wallet on this phone to trade. Its private key is generated here, kept in the
        phone’s secure storage, and never sent to Sift or anyone else.
      </Text>
      {!wallet.persistent ? (
        <Text style={{ color: RISK_COLORS.amber.fg }}>
          Web preview: the key is kept only until you close this page. Use the mobile app for a real
          wallet.
        </Text>
      ) : null}
      <Pressable
        disabled={busy}
        onPress={async () => {
          setBusy(true);
          await wallet.create().finally(() => setBusy(false));
        }}
        style={[styles.button, { backgroundColor: palette.accent, opacity: busy ? 0.5 : 1 }]}
      >
        <Text style={[styles.buttonText, { color: palette.accentText }]}>Create wallet</Text>
      </Pressable>
      <ConnectExternal />
    </Card>
  );
}

/** Connect an existing wallet: any wallet app via MWA on Android, Phantom on iOS. */
function ConnectExternal() {
  const palette = usePalette();
  const wallet = useWallet();
  if (wallet.walletAppAvailable) return <ConnectWalletApp />;
  if (wallet.phantomAvailable) return <ConnectPhantom />;
  return (
    <Text style={{ color: palette.muted, fontSize: 13 }}>
      Wallet apps like Phantom connect in the Sift mobile app.
    </Text>
  );
}

function ConnectWalletApp() {
  const palette = usePalette();
  const wallet = useWallet();
  const config = useQuery({ queryKey: ['config'], queryFn: api.config, staleTime: Infinity });
  const connect = useMutation({
    mutationFn: () => wallet.connectWalletApp(config.data?.cluster ?? 'devnet'),
  });
  const message = connect.isError ? mwaErrorMessage(connect.error) : null;
  return (
    <>
      <Pressable
        disabled={connect.isPending}
        onPress={() => connect.mutate()}
        style={[
          styles.secondary,
          { borderColor: palette.border, opacity: connect.isPending ? 0.5 : 1 },
        ]}
      >
        <Text style={{ color: palette.text, fontWeight: '600' }}>
          {connect.isPending ? 'Waiting for your wallet app…' : 'Connect a wallet app'}
        </Text>
      </Pressable>
      <Text style={{ color: palette.muted, fontSize: 13 }}>
        Phantom, Solflare, Backpack and other Solana wallets on this phone.
      </Text>
      {message ? <Text style={{ color: palette.down }}>{message}</Text> : null}
    </>
  );
}

function ConnectPhantom({ secondary = true }: { secondary?: boolean }) {
  const palette = usePalette();
  const wallet = useWallet();
  const config = useQuery({ queryKey: ['config'], queryFn: api.config, staleTime: Infinity });
  const connect = useMutation({
    mutationFn: () => wallet.connectPhantom(config.data?.cluster ?? 'devnet'),
  });
  if (!wallet.phantomAvailable) {
    return (
      <Text style={{ color: palette.muted, fontSize: 13 }}>
        Phantom connects in the Sift mobile app.
      </Text>
    );
  }
  return (
    <>
      <Pressable
        disabled={connect.isPending}
        onPress={() => connect.mutate()}
        style={[
          secondary ? styles.secondary : styles.button,
          secondary ? { borderColor: palette.border } : { backgroundColor: palette.accent },
          { opacity: connect.isPending ? 0.5 : 1 },
        ]}
      >
        <Text
          style={
            secondary
              ? { color: palette.text, fontWeight: '600' }
              : [styles.buttonText, { color: palette.accentText }]
          }
        >
          {connect.isPending ? 'Waiting for Phantom…' : 'Connect Phantom'}
        </Text>
      </Pressable>
      {connect.isPending ? (
        <Pressable onPress={cancelPhantomRequest}>
          <Text style={[styles.center, { color: palette.muted }]}>Cancel</Text>
        </Pressable>
      ) : null}
      {connect.isError && !isCancelled(connect.error) ? (
        <Text style={{ color: palette.down }}>{connect.error.message}</Text>
      ) : null}
    </>
  );
}

function WalletSwitch({ kind }: { kind: WalletKind }) {
  const palette = usePalette();
  const wallet = useWallet();
  const options = (
    [
      { kind: 'embedded', label: 'This phone', address: wallet.embeddedAddress },
      { kind: 'phantom', label: 'Phantom', address: wallet.phantomAddress },
      { kind: 'walletApp', label: 'Wallet app', address: wallet.walletAppAddress },
    ] as const
  ).filter((option) => option.address);
  if (options.length < 2) return null;
  return (
    <View style={[styles.switch, { borderColor: palette.border }]}>
      {options.map((option) => (
        <Pressable
          key={option.kind}
          onPress={() => wallet.use(option.kind)}
          style={[
            styles.switchOption,
            option.kind === kind ? { backgroundColor: palette.accent } : null,
          ]}
        >
          <Text
            style={{
              color: option.kind === kind ? palette.accentText : palette.text,
              fontWeight: '600',
            }}
          >
            {option.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

function OwnWallet({ address, kind }: { address: string; kind: WalletKind }) {
  const palette = usePalette();
  const queryClient = useQueryClient();
  const config = useQuery({ queryKey: ['config'], queryFn: api.config, staleTime: Infinity });
  const airdrop = useMutation({
    mutationFn: () => api.airdrop(address),
    onSuccess: () =>
      setTimeout(
        () => void queryClient.invalidateQueries({ queryKey: ['holdings', address] }),
        4000,
      ),
  });

  return (
    <>
      <WalletSwitch kind={kind} />
      <Holdings
        address={address}
        title={
          kind === 'phantom'
            ? 'Phantom wallet'
            : kind === 'walletApp'
              ? 'Wallet app'
              : 'Phone wallet'
        }
      />

      {config.data?.cluster === 'devnet' ? (
        <Card title="Test SOL">
          <Text style={{ color: palette.muted }}>
            Sift runs on Solana devnet for now, so trades use free test SOL with no real value.
          </Text>
          <Pressable
            onPress={() => airdrop.mutate()}
            disabled={airdrop.isPending}
            style={[
              styles.secondary,
              { borderColor: palette.border, opacity: airdrop.isPending ? 0.5 : 1 },
            ]}
          >
            <Text style={{ color: palette.text, fontWeight: '600' }}>
              {airdrop.isPending ? 'Requesting…' : 'Get 1 test SOL'}
            </Text>
          </Pressable>
          {airdrop.isSuccess ? (
            <Text style={{ color: palette.up }}>Sent. It arrives in a few seconds.</Text>
          ) : null}
          {airdrop.isError ? (
            <Text style={{ color: palette.down }}>{airdrop.error.message}</Text>
          ) : null}
        </Card>
      ) : null}

      {kind === 'embedded' ? <EmbeddedWallet /> : <ExternalWallet kind={kind} />}
    </>
  );
}

function ExternalWallet({ kind }: { kind: 'phantom' | 'walletApp' | 'browser' }) {
  const palette = usePalette();
  const wallet = useWallet();
  const name =
    kind === 'phantom'
      ? 'Phantom'
      : kind === 'browser'
        ? (wallet.browserWalletName ?? 'your browser wallet')
        : 'your wallet app';
  const address =
    kind === 'phantom'
      ? wallet.phantomAddress
      : kind === 'browser'
        ? wallet.browserAddress
        : wallet.walletAppAddress;
  const disconnect =
    kind === 'phantom'
      ? wallet.disconnectPhantom
      : kind === 'browser'
        ? wallet.disconnectBrowser
        : wallet.disconnectWalletApp;
  return (
    <>
      <Card
        title={
          kind === 'phantom'
            ? 'Connected with Phantom'
            : kind === 'browser'
              ? `Connected with ${name}`
              : 'Connected wallet app'
        }
      >
        <Text style={{ color: palette.muted }}>
          Your keys stay in {name}. Sift shows you the full cost first, then {name} asks you to
          approve each trade.
        </Text>
        {/* A fake wallet app could answer the connect request: let people check. */}
        <Text style={{ color: palette.muted, fontSize: 13 }}>
          Check this matches the address shown in {name}:
        </Text>
        <Text style={[styles.secret, { color: palette.text, borderColor: palette.border }]}>
          {address}
        </Text>
      </Card>
      {!wallet.embeddedAddress && wallet.persistent ? (
        <Pressable onPress={() => void wallet.create()}>
          <Text style={[styles.center, { color: palette.accent }]}>
            Also create a wallet on this phone
          </Text>
        </Pressable>
      ) : null}
      <Pressable onPress={() => void disconnect()}>
        <Text style={[styles.center, { color: palette.down }]}>
          Disconnect {kind === 'walletApp' ? 'wallet app' : name}
        </Text>
      </Pressable>
      <Text style={{ color: palette.muted, fontSize: 13, textAlign: 'center' }}>
        Your wallet and funds stay in {name}.
      </Text>
    </>
  );
}

function EmbeddedWallet() {
  const palette = usePalette();
  const wallet = useWallet();
  const [confirmRemove, setConfirmRemove] = useState(false);
  return (
    <>
      {!wallet.phantomAddress &&
      !wallet.walletAppAddress &&
      (wallet.phantomAvailable || wallet.walletAppAvailable) ? (
        <Card title="Use your wallet app instead">
          <Text style={{ color: palette.muted }}>
            Already have Phantom or another Solana wallet? Connect it to trade from that wallet.
            Your keys stay in the wallet app.
          </Text>
          <ConnectExternal />
        </Card>
      ) : null}

      <Card title="Back up your key">
        <Text style={{ color: palette.muted }}>
          If you delete the app or lose this phone, this key is the only way to get your funds back.
          Sift can’t recover it. It imports into Phantom or Solflare.
        </Text>
        <PrivateKeyReveal />
      </Card>

      <Pressable onPress={() => setConfirmRemove(true)}>
        <Text style={[styles.center, { color: palette.down }]}>Remove wallet from this phone</Text>
      </Pressable>
      {confirmRemove ? (
        <View style={[styles.warning, { backgroundColor: RISK_COLORS.red.bg }]}>
          <Text style={{ color: RISK_COLORS.red.fg, fontWeight: '700' }}>
            Without a backup of the key, anything in this wallet is lost for good.
          </Text>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <Pressable
              onPress={() => setConfirmRemove(false)}
              style={[styles.secondary, styles.flex, { borderColor: RISK_COLORS.red.fg }]}
            >
              <Text style={{ color: RISK_COLORS.red.fg, fontWeight: '600' }}>Keep it</Text>
            </Pressable>
            <Pressable
              onPress={async () => {
                if (await confirmOwner('Confirm it’s you to remove this wallet')) {
                  await wallet.remove();
                }
              }}
              style={[
                styles.secondary,
                styles.flex,
                { borderColor: RISK_COLORS.red.fg, backgroundColor: RISK_COLORS.red.fg },
              ]}
            >
              <Text style={{ color: colors.onAccent, fontWeight: '700' }}>Remove</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </>
  );
}

function WatchWallet({ onWatch }: { onWatch: (address: string) => void }) {
  const palette = usePalette();
  const [draft, setDraft] = useState('');
  const valid = isSolanaAddress(draft.trim());
  return (
    <Card title="Or watch a wallet">
      <Text style={{ color: palette.muted }}>
        Paste any Solana address to see its tokens and their risk levels. Read-only.
      </Text>
      <TextInput
        value={draft}
        onChangeText={setDraft}
        placeholder="Wallet address"
        placeholderTextColor={palette.muted}
        autoCapitalize="none"
        autoCorrect={false}
        style={[styles.input, { color: palette.text, borderColor: palette.border }]}
      />
      {draft.length > 0 && !valid ? (
        <Text style={{ color: palette.down }}>That doesn’t look like a Solana address.</Text>
      ) : null}
      <Pressable
        onPress={() => valid && onWatch(draft.trim())}
        disabled={!valid}
        style={[styles.secondary, { borderColor: palette.border, opacity: valid ? 1 : 0.4 }]}
      >
        <Text style={{ color: palette.text, fontWeight: '600' }}>Watch wallet</Text>
      </Pressable>
    </Card>
  );
}

function Holdings({
  address,
  title,
  onClear,
}: {
  address: string;
  title: string;
  onClear?: () => void;
}) {
  const { mode } = useMode();
  const holdings = useQuery({
    queryKey: ['holdings', address],
    queryFn: () => api.holdings(address),
    refetchInterval: 20_000,
  });

  return (
    <>
      <View style={styles.hero}>
        <View style={styles.heroTop}>
          <Text style={styles.heroLabel}>{title}</Text>
          {onClear ? (
            <Pressable onPress={onClear} hitSlop={12}>
              <Text style={styles.link}>Change</Text>
            </Pressable>
          ) : null}
        </View>
        <Text mono style={styles.balance}>
          {holdings.data ? formatCompact(holdings.data.solBalance) : '–'}
          <Text mono style={styles.balanceUnit}>
            {' '}
            SOL
          </Text>
        </Text>
        <Text mono selectable style={styles.address}>
          {mode === 'pro' ? address : shortAddress(address, 6)}
        </Text>
      </View>
      <SectionTitle title="Holdings" />
      {holdings.isPending ? (
        <Loading label="Loading holdings…" />
      ) : holdings.isError ? (
        <ErrorState message={holdings.error.message} onRetry={() => holdings.refetch()} />
      ) : holdings.data.holdings.length === 0 ? (
        <Empty message="No tokens yet." />
      ) : (
        holdings.data.holdings.map((item) => <HoldingRow key={item.mint} item={item} />)
      )}
    </>
  );
}

function HoldingRow({ item }: { item: Holding }) {
  const level = item.riskLevel ?? 'unknown';
  return (
    <Link href={`/token/${item.mint}`} asChild>
      <Pressable style={StyleSheet.flatten(styles.row)}>
        <TokenAvatar uri={item.imageUrl} label={item.symbol ?? item.name} seed={item.mint} />
        <View style={styles.flex}>
          <Text style={styles.name} numberOfLines={1}>
            {item.name ?? item.symbol ?? shortAddress(item.mint)}
          </Text>
          <Text mono style={styles.amount} numberOfLines={1}>
            {formatCompact(item.amount)} {item.symbol ?? 'tokens'}
          </Text>
        </View>
        <View style={styles.risk}>
          <RiskDot level={item.riskLevel} />
          <Text style={[styles.riskText, { color: RISK_COLORS[level].fg }]}>
            {RISK_LABELS[level]}
          </Text>
        </View>
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  switch: {
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: radius.input,
    padding: 4,
    backgroundColor: colors.surface,
  },
  switchOption: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: 10 },
  input: {
    borderWidth: 1,
    borderRadius: radius.input,
    backgroundColor: colors.bg,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  button: { height: 54, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  buttonText: { fontSize: 16, fontWeight: '800' },
  secondary: {
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    backgroundColor: colors.surface2,
  },
  hero: {
    padding: 20,
    gap: 6,
    borderRadius: radius.hero,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  heroLabel: { fontSize: 13, color: colors.muted, fontWeight: '600' },
  link: { fontSize: 13, color: colors.link, fontWeight: '700' },
  balance: { fontSize: 40, fontWeight: '600', letterSpacing: -1.5 },
  balanceUnit: { fontSize: 18, fontWeight: '600', color: colors.muted, letterSpacing: 0 },
  address: { fontSize: 12, color: colors.faint },
  secret: {
    borderWidth: 1,
    borderRadius: radius.chip,
    padding: 12,
    fontFamily: 'monospace',
    fontSize: 12,
    backgroundColor: colors.bg,
  },
  warning: { borderRadius: radius.input, padding: 14, gap: 10 },
  center: { textAlign: 'center', fontWeight: '700' },
  flex: { flex: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  name: { fontSize: 15, fontWeight: '700' },
  amount: { fontSize: 12, color: colors.muted, marginTop: 2 },
  risk: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  riskText: { fontSize: 12, fontWeight: '800' },
});
