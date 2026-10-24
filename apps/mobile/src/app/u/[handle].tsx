import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet } from 'react-native';
import { Text } from '../../components/Text';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { SharedTradeRow } from '../../components/SharedTradeRow';
import { Empty, ErrorState, Loading } from '../../components/States';
import { socialApi } from '../../lib/api';
import { useSession } from '../../lib/session';
import { useMe } from '../../lib/social-hooks';
import { usePalette } from '../../lib/theme';

export default function ProfileScreen() {
  const palette = usePalette();
  const { handle = '' } = useLocalSearchParams<{ handle: string }>();
  const session = useSession();
  const me = useMe();
  const queryClient = useQueryClient();
  const profile = useQuery({
    queryKey: ['social', 'profile', handle, session.token],
    queryFn: () => socialApi.profile(session.token, handle),
  });
  const toggle = useMutation({
    mutationFn: (follow: boolean) =>
      follow
        ? socialApi.follow(session.token!, handle)
        : socialApi.unfollow(session.token!, handle),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['social'] }),
  });

  if (profile.isPending) return <Loading />;
  if (profile.isError)
    return <ErrorState message={profile.error.message} onRetry={() => profile.refetch()} />;
  const { profile: person, trades } = profile.data;
  const isMe = me.data?.profile?.handle === person.handle;

  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <Stack.Screen options={{ title: `@${person.handle}` }} />
      <Card title={person.displayName}>
        <Text style={{ color: palette.muted }}>
          @{person.handle} · {person.followers} followers · {person.following} following
        </Text>
        {isMe ? (
          <Text style={{ color: palette.muted }}>This is you.</Text>
        ) : session.token ? (
          <Button
            label={person.followedByMe ? 'Following ✓' : 'Follow'}
            variant={person.followedByMe ? 'secondary' : 'primary'}
            disabled={toggle.isPending}
            onPress={() => toggle.mutate(!person.followedByMe)}
          />
        ) : (
          <Text style={{ color: palette.muted }}>Sign in on the Friends tab to follow.</Text>
        )}
        {toggle.isError ? (
          <Text style={{ color: palette.down }}>{toggle.error.message}</Text>
        ) : null}
      </Card>
      <Text style={[styles.heading, { color: palette.text }]}>Shared trades</Text>
      {!person.shareTrades ? (
        <Empty message={`${person.displayName} keeps their trades private.`} />
      ) : trades.length === 0 ? (
        <Empty message="No shared trades yet." />
      ) : (
        trades.map((trade) => <SharedTradeRow key={trade.id} trade={trade} showName={false} />)
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { padding: 16, gap: 12, paddingBottom: 40 },
  heading: { fontSize: 17, fontWeight: '700', marginTop: 4 },
});
