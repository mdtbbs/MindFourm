'use client';

// Shared UI components, hooks, and types (merged from @mindproject/shared)
// 'use client' is required here because several components use framer-motion
// and browser APIs — without it at the barrel level, ThemeProvider etc. resolve
// to `undefined` during SSR/prerender.

// Type exports
export * from './types';

// Component exports
export * from './components';

// Hook exports
export * from './hooks';