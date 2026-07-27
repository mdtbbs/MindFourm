'use client';

import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';

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
  const flashRef = useRef<HTMLDivElement | null>(null);

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

    // 添加过渡类
    document.documentElement.classList.add('theme-transitioning');

    // 创建闪光效果覆盖层
    if (typeof document !== 'undefined') {
      const flash = document.createElement('div');
      flash.className = 'theme-flash-overlay';
      document.body.appendChild(flash);

      // 500ms 后移除闪光效果
      setTimeout(() => {
        flash.remove();
      }, 500);
    }

    // 切换主题
    setTheme((t) => (t === 'light' ? 'dark' : 'light'));

    // 移除过渡类（动画结束后）
    setTimeout(() => {
      document.documentElement.classList.remove('theme-transitioning');
      setIsTransitioning(false);
    }, 500);
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, toggle, isTransitioning }}>
      {children}
    </ThemeContext.Provider>
  );
}