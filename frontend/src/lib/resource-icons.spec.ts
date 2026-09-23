import { getIconComponent, ICON_WHITELIST, NAVIGATION_ICON_REGISTRY } from './resource-icons';

test('navigation icon registry resolves configured names and has a safe fallback', () => {
  expect(ICON_WHITELIST).toContain('Package');
  expect(getIconComponent('Package')).toBe(NAVIGATION_ICON_REGISTRY.Package);
  expect(getIconComponent('MissingIcon')).toBe(NAVIGATION_ICON_REGISTRY.Folder);
  expect(getIconComponent(undefined)).toBe(NAVIGATION_ICON_REGISTRY.Folder);
});
