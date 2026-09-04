/**
 * Like Context - Backward compatibility wrapper for Zustand like store
 *
 * This file provides backward compatibility for existing components
 * that use LikeProvider/useLikes pattern, while internally using Zustand.
 *
 * New components should import directly from '@/store/like-store'
 */

'use client';

import React from 'react';
import { useLikes } from '@/store/like-store';

// Re-export useLikes for backward compatibility
export { useLikes };

/**
 * LikeProvider - No longer needed but kept for backward compatibility
 *
 * The Zustand store manages state independently without a Provider.
 * This component is now just a pass-through wrapper.
 */
export function LikeProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}