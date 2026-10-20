import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { Loading } from '../../components/States';
import { deliverPhantomRedirect } from '../../lib/phantom';

/**
 * Where Phantom sends the user back. Hands the answer to the request that's waiting for it,
 * then returns to the screen that asked.
 */
export default function PhantomCallback() {
  const { action, ...params } = useLocalSearchParams<Record<string, string>>();

  useEffect(() => {
    const flat = Object.fromEntries(
      Object.entries(params).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value]),
    );
    const delivered = action ? deliverPhantomRedirect(action, flat) : false;
    // Nothing was waiting (e.g. the phone closed Sift while Phantom was open): start over.
    if (delivered && router.canGoBack()) router.back();
    else router.replace('/portfolio');
    // Runs once per redirect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <Loading label="Back from Phantom…" />;
}
