import AsyncStorage from '@react-native-async-storage/async-storage';
import { type ReactNode, createContext, useContext, useEffect, useState } from 'react';

/** Simple shows the essentials in plain words; Pro adds the raw numbers. */
export type ViewMode = 'simple' | 'pro';

const STORAGE_KEY = 'sift.viewMode';
const ModeContext = createContext<{ mode: ViewMode; setMode: (mode: ViewMode) => void }>({
  mode: 'simple',
  setMode: () => {},
});

export function ModeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ViewMode>('simple');

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((saved) => {
        if (saved === 'simple' || saved === 'pro') setModeState(saved);
      })
      .catch(() => {});
  }, []);

  const setMode = (next: ViewMode) => {
    setModeState(next);
    AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {});
  };

  return <ModeContext.Provider value={{ mode, setMode }}>{children}</ModeContext.Provider>;
}

export function useMode() {
  return useContext(ModeContext);
}
