import type { MyProfile } from '@sift/shared';
import { useQuery } from '@tanstack/react-query';
import { Link, router } from 'expo-router';
import { Trophy } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Button, IconButton } from '../../components/Button';
import { Card } from '../../components/Card';
import { PersonAvatar } from '../../components/PersonAvatar';
import { Screen, SectionTitle } from '../../components/Screen';
import { Text, TextInput } from '../../components/Text';
import { ProfileForm } from '../../components/ProfileForm';
import { SharedTradeRow } from '../../components/SharedTradeRow';
import { SignInCard } from '../../components/SignInCard';
import { Empty, ErrorState, Loading } from '../../components/States';
import { socialApi } from '../../lib/api';
import { useSession } from '../../lib/session';
import { useMe } from '../../lib/social-hooks';
import { colors, radius, usePalette } from '../../lib/theme';

export default function FriendsScreen() {
  const session = useSession();
  const me = useMe();

  if (session.status === 'loading' || (session.status !== 'signed-out' && me.isPending))
    return (
      <Screen title="Friends">
        <Loading />
      </Screen>
    );
  if (session.status === 'signed-out') {
    return (
      <Screen title="Friends" subtitle="Trades your friends chose to share" right={<TopTraders />}>
        <SignInCard reason="Sign in to follow friends and see the trades they share." />
      </Screen>
    );
  }
  if (me.isError)
    return (
      <Screen title="Friends">
        <ErrorState message={me.error.message} onRetry={() => me.refetch()} />
      </Screen>
    );
  if (!me.data?.profile) {
    return (
      <Screen title="Friends">
        <ProfileForm profile={null} />
      </Screen>
    );
  }
  return <Feed profile={me.data.profile} />;
}

/** Opens the leaderboard of shared trades. */
function TopTraders() {
  return (
    <IconButton label="Top traders" onPress={() => router.push('/leaderboard')}>
      <Trophy size={20} color={colors.text} strokeWidth={2} />
    </IconButton>
  );
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

  // The people in the feed, most recent first; a ring marks those who traded today.
  const people = [
    ...new Map(
      (feed.data?.trades ?? []).map((trade) => [trade.handle, trade] as const).reverse(),
    ).values(),
  ].reverse();
  const dayAgo = feed.dataUpdatedAt - 24 * 60 * 60 * 1000;

  return (
    <Screen
      title="Friends"
      subtitle="Trades your friends chose to share"
      right={<TopTraders />}
      refreshing={feed.isRefetching}
      onRefresh={() => void feed.refetch()}
    >
      {people.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.people}
        >
          {people.map((trade) => (
            <Link key={trade.handle} href={`/u/${trade.handle}`} asChild>
              <Pressable style={StyleSheet.flatten(styles.personChip)}>
                <PersonAvatar
                  name={trade.displayName}
                  seed={trade.handle}
                  size={52}
                  active={Date.parse(trade.at) > dayAgo}
                />
                <Text style={styles.personName} numberOfLines={1}>
                  {trade.displayName}
                </Text>
              </Pressable>
            </Link>
          ))}
        </ScrollView>
      ) : null}

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

      <SectionTitle title="Friends’ trades" />
      <Text style={styles.note}>
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
    </Screen>
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
        style={styles.input}
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
  people: { gap: 14, paddingVertical: 4 },
  personChip: { alignItems: 'center', gap: 6, width: 60 },
  personName: { fontSize: 12, color: colors.text2, maxWidth: 60 },
  note: { fontSize: 13, color: colors.faint },
  input: {
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.bg,
    borderRadius: radius.input,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  person: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderTopWidth: 1,
  },
  flex: { flex: 1 },
  signOut: { marginTop: 12 },
});
