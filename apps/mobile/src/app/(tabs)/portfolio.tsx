import AsyncStorage from '@react-native-async-storage/async-storage';
import { type Holding, isSolanaAddress } from '@sift/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Card } from '../../components/Card';
import { PrivateKeyReveal } from '../../components/PrivateKeyReveal';
import { RiskBadge } from '../../components/RiskBadge';
import { Empty, ErrorState, Loading } from '../../components/States';
import { TokenAvatar } from '../../components/TokenAvatar';
import { api } from '../../lib/api';
import { confirmOwner } from '../../lib/device-auth';
import { formatCompact, shortAddress } from '../../lib/format';
import { useMode } from '../../lib/mode';
import { RISK_COLORS, usePalette } from '../../lib/theme';
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

  if (wallet.status === 'loading') return <Loading />;
  return (
    <ScrollView contentContainerStyle={styles.screen}>
      {wallet.address && wallet.kind ? (
        <OwnWallet address={wallet.address} kind={wallet.kind} />
      ) : (
        <>
          <CreateWallet />
          {watched ? (
            <Holdings address={watched} title="Watched wallet" onClear={() => watch(null)} />
          ) : (
            <WatchWallet onWatch={watch} />
          )}
        </>
      )}
    </ScrollView>
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
      <ConnectPhantom />
    </Card>
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
  if (!wallet.embeddedAddress || !wallet.phantomAddress) return null;
  const options: { kind: WalletKind; label: string }[] = [
    { kind: 'embedded', label: 'This phone' },
    { kind: 'phantom', label: 'Phantom' },
  ];
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
      <Holdings address={address} title={kind === 'phantom' ? 'Phantom wallet' : 'Your wallet'} />

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

      {kind === 'phantom' ? <PhantomWallet /> : <EmbeddedWallet />}
    </>
  );
}

function PhantomWallet() {
  const palette = usePalette();
  const wallet = useWallet();
  return (
    <>
      <Card title="Connected with Phantom">
        <Text style={{ color: palette.muted }}>
          Your keys stay in Phantom. Sift shows you the full cost first, then Phantom asks you to
          approve each trade.
        </Text>
        {/* A fake "Phantom" app could answer the connect request: let people check. */}
        <Text style={{ color: palette.muted, fontSize: 13 }}>
          Check this matches the address shown in your Phantom app:
        </Text>
        <Text style={[styles.secret, { color: palette.text, borderColor: palette.border }]}>
          {wallet.phantomAddress}
        </Text>
      </Card>
      {!wallet.embeddedAddress ? (
        <Pressable onPress={() => void wallet.create()}>
          <Text style={[styles.center, { color: palette.accent }]}>
            Also create a wallet on this phone
          </Text>
        </Pressable>
      ) : null}
      <Pressable onPress={() => void wallet.disconnectPhantom()}>
        <Text style={[styles.center, { color: palette.down }]}>Disconnect Phantom</Text>
      </Pressable>
      <Text style={{ color: palette.muted, fontSize: 13, textAlign: 'center' }}>
        Your wallet and funds stay in Phantom.
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
      {!wallet.phantomAddress && wallet.phantomAvailable ? (
        <Card title="Use Phantom instead">
          <Text style={{ color: palette.muted }}>
            Already have Phantom? Connect it to trade from that wallet. Your keys stay in Phantom.
          </Text>
          <ConnectPhantom />
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
              <Text style={{ color: '#FFFFFF', fontWeight: '600' }}>Remove</Text>
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
  const palette = usePalette();
  const { mode } = useMode();
  const holdings = useQuery({
    queryKey: ['holdings', address],
    queryFn: () => api.holdings(address),
    refetchInterval: 20_000,
  });

  return (
    <>
      <Card
        title={title}
        right={
          onClear ? (
            <Pressable onPress={onClear}>
              <Text style={{ color: palette.accent, fontWeight: '600' }}>Change</Text>
            </Pressable>
          ) : null
        }
      >
        <Text selectable style={{ color: palette.muted }}>
          {mode === 'pro' ? address : shortAddress(address, 6)}
        </Text>
        {holdings.data ? (
          <Text style={[styles.balance, { color: palette.text }]}>
            {formatCompact(holdings.data.solBalance)} SOL
          </Text>
        ) : null}
      </Card>
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
  const palette = usePalette();
  return (
    <Link href={`/token/${item.mint}`} asChild>
      <Pressable
        style={StyleSheet.flatten([
          styles.row,
          { backgroundColor: palette.card, borderColor: palette.border },
        ])}
      >
        <TokenAvatar uri={item.imageUrl} label={item.symbol ?? item.name} size={36} />
        <View style={styles.flex}>
          <Text style={[styles.name, { color: palette.text }]} numberOfLines={1}>
            {item.name ?? item.symbol ?? shortAddress(item.mint)}
          </Text>
          <Text style={{ color: palette.muted }}>
            {formatCompact(item.amount)} {item.symbol ?? 'tokens'}
          </Text>
        </View>
        <RiskBadge level={item.riskLevel} />
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  switch: { flexDirection: 'row', borderWidth: 1, borderRadius: 12, padding: 3 },
  switchOption: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 9 },
  screen: { padding: 16, gap: 12, paddingBottom: 40 },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  button: { borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  buttonText: { fontSize: 16, fontWeight: '700' },
  secondary: { borderRadius: 12, paddingVertical: 10, alignItems: 'center', borderWidth: 1 },
  balance: { fontSize: 24, fontWeight: '700' },
  secret: { borderWidth: 1, borderRadius: 10, padding: 10, fontFamily: 'monospace', fontSize: 12 },
  warning: { borderRadius: 12, padding: 12, gap: 10 },
  center: { textAlign: 'center', fontWeight: '600' },
  flex: { flex: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  name: { fontSize: 15, fontWeight: '600' },
});
