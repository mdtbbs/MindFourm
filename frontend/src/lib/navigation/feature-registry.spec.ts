import { FEATURE_REGISTRY, searchFeatureRegistry } from './feature-registry';

describe('feature registry search', () => {
  test.each(['云存档', 'cloud saves', 'сохранения', 'クラウドセーブ'])('finds cloud saves with %s', (query) => {
    expect(searchFeatureRegistry(query).map(({ href }) => href)).toContain('/tools/cloud-saves');
  });

  test('finds friends, resource kinds, Developer Center and API docs', () => {
    expect(searchFeatureRegistry('好友').map(({ href }) => href)).toContain('/friends');
    expect(searchFeatureRegistry('blueprint').map(({ href }) => href)).toContain('/tools/blueprint-editor');
    expect(searchFeatureRegistry('API').map(({ href }) => href)).toEqual(expect.arrayContaining(['/developers', '/api/v1/reference']));
  });

  test('keeps results bounded and does not retain the retired cloud-save URL', () => {
    expect(searchFeatureRegistry('e', { limit: 3 })).toHaveLength(3);
    expect(FEATURE_REGISTRY.some(({ href }) => href === '/settings/cloud-saves')).toBe(false);
  });
});
