/**
 * Registry of "forget the current user" callbacks.
 *
 * Logging out used to reset only the user store, leaving the previous account's
 * unread count (persisted to localStorage), site settings and like states behind
 * for the next person to sign in on the same browser.
 *
 * A registry rather than direct imports because the dependency runs the other way:
 * `like-store` imports `user-store`, so `user-store` importing it back would be a
 * cycle.
 */

type ResetFn = () => void;

const resetCallbacks = new Set<ResetFn>();

/** Register a store's reset function. Returns an unregister function. */
export function registerUserScopedReset(reset: ResetFn): () => void {
  resetCallbacks.add(reset);
  return () => resetCallbacks.delete(reset);
}

/** Reset every registered store. Safe to call more than once. */
export function clearUserScopedState(): void {
  for (const reset of resetCallbacks) {
    try {
      reset();
    } catch {
      // One store failing to reset must not prevent the others.
    }
  }
}
