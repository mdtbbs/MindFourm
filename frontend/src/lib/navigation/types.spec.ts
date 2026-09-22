import type { ResourceCategory } from '@/types';
import { normalizeNavigationSnapshot } from './types';

const categories = [{ id: 1, name: '客户端', is_active: true }] as ResourceCategory[];
test('legacy public navigation field maps to the internal resourceCategories name', () => {
  expect(normalizeNavigationSnapshot({ resourceTypes: categories }).resourceCategories).toBe(categories);
});

test('normalized navigation field takes precedence when both fields are returned', () => {
  const preferred = [{ ...categories[0], id: 2 }];
  expect(normalizeNavigationSnapshot({ resourceCategories: preferred, resourceTypes: categories }).resourceCategories).toBe(preferred);
});
