'use client';

import { createContext, useContext } from 'react';
import { EMPTY_NAVIGATION, type NavigationSnapshot } from './types';

const NavigationContext = createContext<NavigationSnapshot>(EMPTY_NAVIGATION);

export function NavigationProvider({
  initialNavigation,
  children,
}: {
  initialNavigation: NavigationSnapshot;
  children: React.ReactNode;
}) {
  return (
    <NavigationContext.Provider value={initialNavigation}>
      {children}
    </NavigationContext.Provider>
  );
}

export function useNavigation(): NavigationSnapshot {
  return useContext(NavigationContext);
}
