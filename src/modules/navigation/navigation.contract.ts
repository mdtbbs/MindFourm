/**
 * Lightweight injection contract for modules that invalidate navigation.
 * Keeping this separate from the concrete service prevents unit tests for
 * unrelated modules from eagerly loading navigation entities and repositories.
 */
export const NAVIGATION_INVALIDATOR = Symbol('NAVIGATION_INVALIDATOR');

export interface NavigationInvalidator {
  invalidate(): Promise<void>;
}
