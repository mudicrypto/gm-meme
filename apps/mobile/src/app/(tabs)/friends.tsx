import type { MyProfile } from '@sift/shared';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'expo-router';
import { useState } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { ProfileForm } from '../../components/ProfileForm';
import { SharedTradeRow } from '../../components/SharedTradeRow';
import { SignInCard } from '../../components/SignInCard';
import { Empty, ErrorState, Loading } from '../../components/States';
import { socialApi } from '../../lib/api';
import { useSession } from '../../lib/session';
import { useMe } from '../../lib/social-hooks';
import { usePalette } from '../../lib/theme';

export default function FriendsScreen() {
  const session = useSession();
  const me = useMe();

  if (session.status === 'loading') return <Loading />;
  if (session.status === 'signed-out') {
    return (
      <ScrollView contentContainerStyle={styles.screen}>
        <SignInCard reason="Sign in to follow friends and see the trades they share." />
      </ScrollView>
    );
  }
  if (me.isPending) return <Loading />;
  if (me.isError) return <ErrorState message={me.error.message} onRetry={() => me.refetch()} />;
  if (!me.data.profile) {
    return (
      <ScrollView contentContainerStyle={styles.screen}>
        <ProfileForm profile={null} />
      </ScrollView>
    );
  }
  return <Feed profile={me.data.profile} />;
}

function Feed({ profile }: { profile: MyProfile }) {
  const palette = usePalette();
  const session = useSession();
  const [editing, setEditing] = useState(false);
  const feed = useQuery({
    queryKey: ['social', 'feed', session.token],
    queryFn: () => socialApi.feed(session.token!),
    refetchInterval: 30_000,
  });

  return (
    <ScrollView
      contentContainerStyle={styles.screen}
      refreshControl={
        <RefreshControl refreshing={feed.isRefetching} onRefresh={() => void feed.refetch()} />
      }
    >
      {editing ? (
        <ProfileForm profile={profile} onDone={() => setEditing(false)} />
      ) : (
        <Card
          title={profile.displayName}
          right={
            <Pressable onPress={() => setEditing(true)}>
              <Text style={{ color: palette.accent, fontWeight: '600' }}>Edit</Text>
            </Pressable>
          }
        >
          <Text style={{ color: palette.muted }}>
            @{profile.handle} · {profile.followers} followers · {profile.following} following
          </Text>
          <Text style={{ color: palette.muted, fontSize: 13 }}>
            {profile.shareTrades
              ? 'You share your Sift trades with your followers.'
              : 'Your trades are private. Turn on sharing in Edit to show them to followers.'}
          </Text>
        </Card>
      )}

      <FindPeople />

      <Text style={[styles.heading, { color: palette.text }]}>Friends’ trades</Text>
      <Text style={{ color: palette.muted, fontSize: 13 }}>
        Trades people chose to share. They aren’t advice: check each token’s risk score yourself.
      </Text>
      {feed.isPending ? (
        <Loading />
      ) : feed.isError ? (
        <ErrorState message={feed.error.message} onRetry={() => feed.refetch()} />
      ) : feed.data.trades.length === 0 ? (
        <Empty
          message={
            profile.following === 0
              ? 'Follow people to see the trades they share here.'
              : 'No shared trades yet from the people you follow.'
          }
        />
      ) : (
        feed.data.trades.map((trade) => <SharedTradeRow key={trade.id} trade={trade} />)
      )}
      <View style={styles.signOut}>
        <Button label="Sign out" variant="secondary" onPress={() => void session.signOut()} />
      </View>
    </ScrollView>
  );
}

function FindPeople() {
  const palette = usePalette();
  const { token } = useSession();
  const [query, setQuery] = useState('');
  const q = query.trim().replace(/^@/, '').toLowerCase();
  const valid = /^[a-z0-9_]{1,20}$/.test(q);
  const results = useQuery({
    queryKey: ['social', 'search', q, token],
    queryFn: () => socialApi.search(token, q),
    enabled: valid,
  });
  return (
    <Card title="Find people">
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Search by @name"
        placeholderTextColor={palette.muted}
        autoCapitalize="none"
        autoCorrect={false}
        style={[styles.input, { color: palette.text, borderColor: palette.border }]}
      />
      {valid && results.data ? (
        results.data.profiles.length === 0 ? (
          <Text style={{ color: palette.muted }}>No one by that name yet.</Text>
        ) : (
          results.data.profiles.map((p) => (
            <Link key={p.handle} href={`/u/${p.handle}`} asChild>
              <Pressable
                style={StyleSheet.flatten([styles.person, { borderColor: palette.border }])}
              >
                <View style={styles.flex}>
                  <Text style={{ color: palette.text, fontWeight: '600' }}>{p.displayName}</Text>
                  <Text style={{ color: palette.muted }}>@{p.handle}</Text>
                </View>
                <Text style={{ color: p.followedByMe ? palette.muted : palette.accent }}>
                  {p.followedByMe ? 'Following' : 'View'}
                </Text>
              </Pressable>
            </Link>
          ))
        )
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  screen: { padding: 16, gap: 12, paddingBottom: 40 },
  heading: { fontSize: 17, fontWeight: '700', marginTop: 4 },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  person: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  flex: { flex: 1 },
  signOut: { marginTop: 12 },
});
