import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  ROOM_MOD_DIALOG_TITLE_ID,
  RoomCard,
  RoomModBadges,
  RoomModFilters,
  RoomModsDialog,
  collectModOptions,
  filterRooms,
  isModdedRoom,
  modCountOf,
  syncableCountOf,
} from './RoomList';
import type { PublicRoom, RoomModSummary } from '@/lib/api/lanlinkClient';

// LanLink's client reads `process.env` and localStorage at call time; the
// presentational pieces under test never call it, but mocking keeps the module
// side-effect free in the node test environment.
jest.mock('@/lib/api/lanlinkClient', () => ({
  lanlinkClient: { getPublicRooms: jest.fn() },
}));

jest.mock('@/i18n/provider', () => ({
  useI18n: () => ({
    locale: 'en',
    t: (key: string, values?: Record<string, string | number>) =>
      values ? `${key}(${Object.values(values).join(',')})` : key,
  }),
}));

const t = (key: string, values?: Record<string, string | number>) =>
  values ? `${key}(${Object.values(values).join(',')})` : key;

function makeRoom(overrides: Partial<PublicRoom> = {}): PublicRoom {
  return {
    code: 'ROOM01',
    name: 'Test room',
    display_name: 'Test room',
    public: true,
    owner: { username: 'host' },
    node: { id: 'node-1', name: 'Node 1', addr: '127.0.0.1', room_port: 7000 },
    ...overrides,
  };
}

function makeSummary(
  mods: Array<{ mod_id: string; display_name: string; version?: string; syncable?: boolean }>,
  extra: Partial<RoomModSummary> = {},
): RoomModSummary {
  return {
    modded: true,
    mod_count: mods.length,
    syncable_count: mods.filter((mod) => mod.syncable === true).length,
    pack: null,
    mods: mods.map((mod) => ({
      syncable: false,
      version: '1.0.0',
      ...mod,
    })),
    ...extra,
  };
}

const moddedRoom = makeRoom({
  code: 'MODA',
  name: 'Modded room',
  mod_summary: makeSummary(
    [
      { mod_id: 'alpha-mod', display_name: 'Alpha Mod', version: '1.2.3', syncable: true },
      { mod_id: 'beta-mod', display_name: 'Beta Mod', version: '0.9.0', syncable: true },
      { mod_id: 'gamma-mod', display_name: 'Gamma Mod', version: '2.0.0', syncable: false },
    ],
    {
      mod_count: 3,
      syncable_count: 2,
      pack: { public_id: 'pack-1', version_public_id: 'pack-v1', title: 'Community Pack' },
    },
  ),
});

const duplicateModRoom = makeRoom({
  code: 'MODB',
  name: 'Duplicate mod room',
  mod_summary: makeSummary([
    // Same mod id with different casing must collapse into one filter option.
    { mod_id: 'ALPHA-MOD', display_name: 'Alpha Mod Duplicate', syncable: true },
    { mod_id: 'delta-mod', display_name: '', syncable: false },
  ]),
});

const vanillaRoom = makeRoom({ code: 'VAN', name: 'Vanilla room' });

const allRooms = [moddedRoom, duplicateModRoom, vanillaRoom];

describe('RoomList mod badges', () => {
  test('a modded room shows the mod count and syncable count', () => {
    const html = renderToStaticMarkup(createElement(RoomModBadges, { room: moddedRoom, t }));
    expect(html).toContain('lanlink.modCountBadge(3)');
    expect(html).toContain('lanlink.syncableBadge(2)');
  });

  test('a modded room with nothing syncable shows only the mod count', () => {
    const room = makeRoom({
      mod_summary: makeSummary([{ mod_id: 'gamma-mod', display_name: 'Gamma' }]),
    });
    const html = renderToStaticMarkup(createElement(RoomModBadges, { room, t }));
    expect(html).toContain('lanlink.modCountBadge(1)');
    expect(html).not.toContain('lanlink.syncableBadge');
  });

  test('vanilla and legacy rooms (no mod_summary) render no badges', () => {
    const legacySummaryRoom = makeRoom({ mod_summary: null });
    for (const room of [vanillaRoom, legacySummaryRoom]) {
      expect(isModdedRoom(room)).toBe(false);
      expect(modCountOf(room)).toBe(0);
      expect(syncableCountOf(room)).toBe(0);
      expect(renderToStaticMarkup(createElement(RoomModBadges, { room, t }))).toBe('');
    }
  });
});

describe('RoomCard mod UI', () => {
  const renderCard = (room: PublicRoom, modSyncEnabled = true) =>
    renderToStaticMarkup(createElement(RoomCard, {
      room,
      locale: 'en',
      copiedCode: null,
      onCopy: () => undefined,
      onShowMods: () => undefined,
      modSyncEnabled,
      t,
    }));

  test('a modded card exposes a dialog trigger with the right aria attributes', () => {
    const html = renderCard(moddedRoom);
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).toContain('lanlink.viewMods');
    expect(html).toContain('lanlink.modCountBadge(3)');
    expect(html).toContain('lanlink.syncableBadge(2)');
  });

  test('a vanilla card shows no mod badges or trigger', () => {
    const html = renderCard(vanillaRoom);
    expect(html).not.toContain('lanlink.viewMods');
    expect(html).not.toContain('lanlink.modCountBadge');
    expect(html).not.toContain('aria-haspopup="dialog"');
    // The rest of the card is unchanged.
    expect(html).toContain('lanlink.copyCode');
    expect(html).toContain('VAN');
  });

  test('disabling multiplayerModSync hides all mod UI even for a modded room', () => {
    const html = renderCard(moddedRoom, false);
    expect(html).not.toContain('lanlink.viewMods');
    expect(html).not.toContain('lanlink.modCountBadge');
    expect(html).not.toContain('lanlink.syncableBadge');
    expect(html).not.toContain('aria-haspopup="dialog"');
  });
});

describe('RoomList mod filters', () => {
  test('collects options from room data, de-duplicating mod ids case-insensitively', () => {
    expect(collectModOptions(allRooms)).toEqual([
      { id: 'alpha-mod', label: 'Alpha Mod' },
      { id: 'beta-mod', label: 'Beta Mod' },
      { id: 'delta-mod', label: 'delta-mod' },
      { id: 'gamma-mod', label: 'Gamma Mod' },
    ]);
  });

  test('renders the kind buttons with aria-pressed and a select fed by the data', () => {
    const html = renderToStaticMarkup(createElement(RoomModFilters, {
      rooms: allRooms,
      kind: 'modded',
      modId: '',
      onKindChange: () => undefined,
      onModChange: () => undefined,
      t,
    }));
    expect(html).toContain('lanlink.filterAll');
    expect(html).toContain('lanlink.filterVanilla');
    expect(html).toContain('lanlink.filterModded');
    expect(html).toContain('lanlink.modFilterPlaceholder');
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(html).toMatch(/<button[^>]*aria-pressed="true"[^>]*>lanlink\.filterModded<\/button>/);
    expect(html).toContain('<option value="alpha-mod">Alpha Mod</option>');
    expect(html).toContain('<option value="delta-mod">delta-mod</option>');
    expect(html).not.toContain('Alpha Mod Duplicate');
  });

  test('keeps a selected mod visible when polling drops it from the room list', () => {
    const html = renderToStaticMarkup(createElement(RoomModFilters, {
      rooms: [vanillaRoom],
      kind: 'all',
      modId: 'removed-mod',
      onKindChange: () => undefined,
      onModChange: () => undefined,
      t,
    }));
    expect(html).toMatch(/<option value="removed-mod"[^>]*>removed-mod<\/option>/);
    expect(html).toContain('value="removed-mod"');
  });

  test('filters rooms by kind and by mod id, treating legacy rooms as vanilla', () => {
    expect(filterRooms(allRooms, 'all', '').map((room) => room.code)).toEqual(['MODA', 'MODB', 'VAN']);
    expect(filterRooms(allRooms, 'vanilla', '').map((room) => room.code)).toEqual(['VAN']);
    expect(filterRooms(allRooms, 'modded', '').map((room) => room.code)).toEqual(['MODA', 'MODB']);
    expect(filterRooms(allRooms, 'all', 'ALPHA-MOD').map((room) => room.code)).toEqual(['MODA', 'MODB']);
    expect(filterRooms(allRooms, 'modded', 'gamma-mod').map((room) => room.code)).toEqual(['MODA']);
    expect(filterRooms(allRooms, 'vanilla', 'alpha-mod')).toEqual([]);
    expect(filterRooms(allRooms, 'all', 'missing-mod')).toEqual([]);
  });

  test('a legacy room without mod_summary is vanilla', () => {
    expect(filterRooms([makeRoom({ code: 'LEGACY' })], 'vanilla', '').map((room) => room.code)).toEqual(['LEGACY']);
    expect(filterRooms([makeRoom({ code: 'LEGACY' })], 'modded', '')).toEqual([]);
  });
});

describe('RoomModsDialog', () => {
  test('exposes modal semantics and lists every mod, the pack and the session id', () => {
    const room = makeRoom({
      ...moddedRoom,
      code: 'MODA',
      multiplayer_session_id: 'session-42',
    });
    const html = renderToStaticMarkup(createElement(RoomModsDialog, {
      room,
      onClose: () => undefined,
      t,
    }));
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain(`aria-labelledby="${ROOM_MOD_DIALOG_TITLE_ID}"`);
    expect(html).toContain('lanlink.modDialogTitle');
    expect(html).toContain('lanlink.modDialogClose');
    // Each mod's display name, id, version and sync state.
    expect(html).toContain('Alpha Mod');
    expect(html).toContain('alpha-mod');
    expect(html).toContain('1.2.3');
    expect(html).toContain('lanlink.modSyncable');
    expect(html).toContain('lanlink.modManual');
    expect(html).toContain('lanlink.modPackTitle(Community Pack)');
    expect(html).toContain('lanlink.sessionId');
    expect(html).toContain('session-42');
  });

  test('falls back to the mod id when no display name is reported', () => {
    const room = makeRoom({
      mod_summary: makeSummary([{ mod_id: 'delta-mod', display_name: '' }]),
    });
    const html = renderToStaticMarkup(createElement(RoomModsDialog, {
      room,
      onClose: () => undefined,
      t,
    }));
    expect(html).toContain('delta-mod');
    expect(html).toContain('lanlink.modManual');
  });

  test('shows the empty message when a modded room reports no mod list', () => {
    const room = makeRoom({
      mod_summary: { modded: true, mod_count: 0, syncable_count: 0, pack: null, mods: [] },
    });
    const html = renderToStaticMarkup(createElement(RoomModsDialog, {
      room,
      onClose: () => undefined,
      t,
    }));
    expect(html).toContain('lanlink.noMods');
    expect(html).not.toContain('<ul');
  });
});

/**
 * Focus and keyboard behaviour need a DOM. Globals are installed before
 * `react-dom/client` is required so it captures the jsdom document.
 */
describe('RoomModsDialog interaction', () => {
  let dom: { window: any };
  let act: (run: () => void | Promise<void>) => Promise<void>;
  let globalObject: any;
  let container: HTMLElement | null = null;

  beforeAll(() => {
    globalObject = globalThis as any;
    const { JSDOM } = require('jsdom');
    const jsdom = new JSDOM('<!doctype html><html><body></body></html>', {
      pretendToBeVisual: true,
      url: 'http://localhost/',
    });
    dom = jsdom;
    for (const key of Object.getOwnPropertyNames(jsdom.window)) {
      if (key in globalObject) continue;
      try { globalObject[key] = jsdom.window[key]; } catch { /* non-configurable */ }
    }
    Object.defineProperties(globalThis, {
      window: { configurable: true, value: jsdom.window },
      document: { configurable: true, value: jsdom.window.document },
      navigator: { configurable: true, value: jsdom.window.navigator },
    });
    globalObject.IS_REACT_ACT_ENVIRONMENT = true;
    act = require('react').act;
  });

  afterAll(() => {
    dom.window.close();
  });

  test('focuses Close on open, closes on Escape and returns focus to the trigger', async () => {
    const trigger = dom.window.document.createElement('button');
    trigger.textContent = 'open mods';
    dom.window.document.body.appendChild(trigger);
    trigger.focus();

    const host: HTMLElement = dom.window.document.createElement('div');
    dom.window.document.body.appendChild(host);
    container = host;
    const root = require('react-dom/client').createRoot(host);
    const onClose = jest.fn();

    await act(async () => {
      root.render(createElement(RoomModsDialog, {
        room: moddedRoom,
        onClose,
        returnFocusRef: { current: trigger },
        t,
      }));
    });

    const closeButton = host.querySelector<HTMLButtonElement>(
      'button[aria-label="lanlink.modDialogClose"]',
    );
    expect(closeButton).not.toBeNull();
    expect(dom.window.document.activeElement).toBe(closeButton);

    await act(async () => {
      dom.window.document.dispatchEvent(
        new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
      );
    });
    expect(onClose).toHaveBeenCalledTimes(1);

    // The parent unmounts the dialog after closing; focus returns to the trigger.
    await act(async () => { root.unmount(); });
    expect(dom.window.document.activeElement).toBe(trigger);

    trigger.remove();
    host.remove();
    container = null;
  });

  test('closes when the overlay itself is clicked, but not when the panel is', async () => {
    const room = makeRoom({
      code: 'MODA',
      mod_summary: moddedRoom.mod_summary,
    });
    const onClose = jest.fn();
    const host: HTMLElement = dom.window.document.createElement('div');
    dom.window.document.body.appendChild(host);
    container = host;
    const root = require('react-dom/client').createRoot(host);
    await act(async () => {
      root.render(createElement(RoomModsDialog, { room, onClose, t }));
    });

    const overlay = host.firstElementChild as HTMLElement;
    const panel = host.querySelector<HTMLElement>('[role="dialog"]')!;
    await act(async () => { panel.click(); });
    expect(onClose).not.toHaveBeenCalled();

    await act(async () => { overlay.click(); });
    expect(onClose).toHaveBeenCalledTimes(1);

    await act(async () => { root.unmount(); });
    host.remove();
    container = null;
  });
});
