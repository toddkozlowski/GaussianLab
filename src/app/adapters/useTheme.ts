import { useSyncExternalStore } from 'react';
import { getTheme, setTheme, subscribeTheme, toggleTheme, type Theme } from '../theme';

export function useTheme(): { theme: Theme; setTheme: (theme: Theme) => void; toggleTheme: () => void } {
  const theme = useSyncExternalStore(subscribeTheme, getTheme, getTheme);
  return { theme, setTheme, toggleTheme };
}
