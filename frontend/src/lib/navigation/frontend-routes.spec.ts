import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { requiresAuthentication } from '@/middleware';

// `process.cwd()` is the repo root whenever the suite is run through either
// jest config; use the config location instead so it cannot drift.
const app = join(__dirname, '..', '..', 'app');

describe('IA route files', () => {
  test.each([
    ['(public)/community/page.tsx', '/community'],
    ['(public)/multiplayer/page.tsx', '/multiplayer'],
    ['(public)/tools/page.tsx', '/tools'],
    ['(public)/tools/blueprint-editor/page.tsx', '/tools/blueprint-editor'],
    ['(public)/tools/map-editor/page.tsx', '/tools/map-editor'],
    ['(public)/tools/wave-editor/page.tsx', '/tools/wave-editor'],
    ['(auth)/me/page.tsx', '/me'],
    ['(auth)/resources/my/page.tsx', '/resources/my'],
    ['(auth)/tools/cloud-saves/page.tsx', '/tools/cloud-saves'],
    ['(public)/resources/[id]/workbench/page.tsx', '/resources/[id]/workbench'],
  ])('%s resolves the %s route', (file, route) => {
    expect(existsSync(join(app, file))).toBe(true);
  });

  test('does not keep a user-facing cloud-save page under settings', () => {
    expect(existsSync(join(app, '(auth)', 'settings', 'cloud-saves', 'page.tsx'))).toBe(false);
    expect(requiresAuthentication('/settings/cloud-saves')).toBe(false);
    expect(requiresAuthentication('/tools/cloud-saves')).toBe(true);
  });
});
