'use client';

import { createContext, useContext, useEffect, useState, useCallback } from 'react';

export type Theme = 'light' | 'dark';

export interface ThemeContextValue {
  theme: Theme;
  toggle: () => void;
  isTransitioning: boolean;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'light',
  toggle: () => {},
  isTransitioning: false,
});

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}

function getInitialTheme(): Theme {
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem('theme') as Theme | null;
    if (stored === 'dark' || stored === 'light') {
      return stored;
    }
  }
  return 'light';
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>('light');
  const [mounted, setMounted] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);

  useEffect(() => {
    setMounted(true);
    const initial = getInitialTheme();
    setTheme(initial);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.classList.toggle('dark', theme === 'dark');
    localStorage.setItem('theme', theme);
  }, [theme, mounted]);

  const toggle = useCallback(() => {
    setIsTransitioning(true);

    // Only the document surfaces opt in to this brief color transition.
    document.documentElement.classList.add('theme-transitioning');

    // 切换主题
    setTheme((t) => (t === 'light' ? 'dark' : 'light'));

    // Remove the transition class after the shared theme timing.
    setTimeout(() => {
      document.documentElement.classList.remove('theme-transitioning');
      setIsTransitioning(false);
    }, 180);
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, toggle, isTransitioning }}>
      {children}
    </ThemeContext.Provider>
  );
}
