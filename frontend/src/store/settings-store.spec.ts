/**
 * Settings Store - Server hydration spec
 *
 * Verifies that `hydrateFromServer` synchronously seeds the Zustand store so
 * that the first client render carries server-provided values (no flash).
 *
 * This spec runs as a plain Node script (no Jest/RTL setup needed), following
 * the same IIFE + assert pattern as `site-navigation.spec.ts`.
 */

import { useSettingsStore, hydrateFromServer } from './settings-store';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function assertDeepEqual(actual: unknown, expected: unknown, message: string): void {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`${message}\nExpected: ${expectedJson}\nReceived: ${actualJson}`);
  }
}

/** Reset the store between tests. */
function resetStore(): void {
  useSettingsStore.setState({
    settings: {},
    isLoading: false,
    lastUpdated: null,
  });
}

// ────────────────────────────────────────────────────────────────────────────
// Test: hydrateFromServer populates an empty store synchronously
// ────────────────────────────────────────────────────────────────────────────
(function testHydrateFromServerPopulatesEmptyStore() {
  resetStore();

  const serverSettings = {
    site_name: 'Test Forum',
    site_tagline: 'Test Tagline',
    brand_primary: '#ff0000',
  };

  hydrateFromServer(serverSettings);

  const state = useSettingsStore.getState();
  assertDeepEqual(state.settings, serverSettings, 'settings should match server data after hydration');
  assert(state.lastUpdated !== null, 'lastUpdated should be set after hydration');
})();

// ────────────────────────────────────────────────────────────────────────────
// Test: first subscriber sees server data immediately (no flash)
// ────────────────────────────────────────────────────────────────────────────
(function testFirstSubscriberSeesServerData() {
  resetStore();

  const serverSettings = { site_name: 'My Forum' };

  // Hydrate BEFORE any subscription — this simulates the provider rendering
  // before children.
  hydrateFromServer(serverSettings);

  // A child component subscribing for the first time should see the data.
  const settings = useSettingsStore.getState().settings;
  assert(settings.site_name === 'My Forum', 'first subscriber should see server site_name');
})();

// ────────────────────────────────────────────────────────────────────────────
// Test: hydrateFromServer overrides stale localStorage data
// ────────────────────────────────────────────────────────────────────────────
(function testHydrateOverridesStaleData() {
  resetStore();

  // Simulate stale localStorage data already in the store.
  useSettingsStore.setState({
    settings: { site_name: 'Stale Name', site_tagline: 'Old Tagline' },
  });

  const serverSettings = { site_name: 'New Name', site_tagline: 'New Tagline' };
  hydrateFromServer(serverSettings);

  const state = useSettingsStore.getState();
  assert(state.settings.site_name === 'New Name', 'server data should override stale localStorage');
  assert(state.settings.site_tagline === 'New Tagline', 'server tagline should override stale data');
})();

// ────────────────────────────────────────────────────────────────────────────
// Test: hydrateFromServer skips when data is identical (no unnecessary writes)
// ────────────────────────────────────────────────────────────────────────────
(function testHydrateSkipsIdenticalData() {
  resetStore();

  const settings = { site_name: 'Same Name' };
  hydrateFromServer(settings);
  const firstUpdated = useSettingsStore.getState().lastUpdated;

  // Small delay to ensure timestamp would differ if setState were called.
  const start = Date.now();
  while (Date.now() - start < 5) { /* busy wait */ }

  hydrateFromServer(settings);
  const secondUpdated = useSettingsStore.getState().lastUpdated;

  assert(firstUpdated === secondUpdated, 'lastUpdated should not change when data is identical');
})();

// ────────────────────────────────────────────────────────────────────────────
// Test: hydrateFromServer ignores empty input
// ────────────────────────────────────────────────────────────────────────────
(function testHydrateIgnoresEmptyInput() {
  resetStore();

  hydrateFromServer({});
  assertDeepEqual(
    useSettingsStore.getState().settings,
    {},
    'empty settings should not populate the store',
  );

  // Also test null/undefined safety (TypeScript prevents this, but defensive).
  hydrateFromServer(null as any);
  assertDeepEqual(
    useSettingsStore.getState().settings,
    {},
    'null settings should not populate the store',
  );
})();

// ────────────────────────────────────────────────────────────────────────────
// Test: useSettings backward compat hook returns hydrated data
// ────────────────────────────────────────────────────────────────────────────
(function testUseSettingsBackwardCompat() {
  resetStore();

  const serverSettings = { site_name: 'Compat Forum', brand_primary: '#00ff00' };
  hydrateFromServer(serverSettings);

  // We can't call React hooks outside a component, but we can verify that
  // the selector used by useSettings() would return the hydrated data.
  // useSettings() is: useSettingsStore((s) => s.settings)
  const settings = useSettingsStore.getState().settings;
  assert(settings.site_name === 'Compat Forum', 'backward compat selector should return server site_name');
  assert(settings.brand_primary === '#00ff00', 'backward compat selector should return server brand_primary');
})();

assert(true, 'settings store hydration spec executed');
