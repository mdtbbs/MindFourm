import { mergeResourceQuery } from './query';

test('resource filter updates preserve existing URL query compatibility', () => {
  const result = new URLSearchParams(mergeResourceQuery(
    'category_id=4&sort=download_count&tag=campaign&supported_version=V8&compatibility=Linux&resource_kind=map&planet=Serpulo',
    { resource_kind: 'schematic', tag: null },
  ));
  for (const key of ['category_id', 'sort', 'supported_version', 'compatibility', 'planet']) expect(result.has(key)).toBe(true);
  expect(result.get('resource_kind')).toBe('schematic');
  expect(result.has('tag')).toBe(false);
});
