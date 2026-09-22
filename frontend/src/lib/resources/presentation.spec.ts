import type { Resource } from '@/types';
import { resourceCardFacts, resourceFileExtension, resourceFileSummary, resourceStatusLabel, resourceVersionLabel } from './presentation';
import { resourceKindLabel } from '@/lib/display-labels';

const resource = {
  resource_kind: 'map', file_name: 'arena_final.msav', file_size: 2500000,
  version: '2.1.1', versions: [{ version: '3', file_name: 'arena_v3.msav' }],
  renderer_metadata: { width: 300, height: 200, game_modes: ['survival'], planet: 'Serpulo', spawns: 2, build: 160 },
} as Resource;

test('file extension and file summary use actual human-readable file facts', () => {
  expect(resourceFileExtension(resource.file_name)).toBe('.msav');
  expect(resourceFileSummary(resource)).toEqual(['Mindustry 地图', '.msav', '2.4 MB']);
});

test('resource version is distinct from Mindustry Build', () => {
  expect(resourceVersionLabel(resource)).toBe('v3');
  expect(resourceVersionLabel({ version: '160', versions: [] })).toBe('v160');
  const modFacts = resourceCardFacts({ ...resource, resource_kind: 'mod', renderer_metadata: { version: '1.4', build: 160 } });
  expect(modFacts.some((fact) => fact.value.startsWith('Build 1.4'))).toBe(false);
});

test('unknown resource enums fall back to a user-facing label', () => {
  expect(resourceKindLabel('internal_new_kind')).toBe('其他');
});

test('resource moderation status is translated instead of asserted as approved', () => {
  expect(resourceStatusLabel('pending')).toBe('审核中');
  expect(resourceStatusLabel('rejected')).toBe('未通过审核');
  expect(resourceStatusLabel('published')).toBe('已公开');
});

test('map cards prioritize parsed map facts', () => {
  expect(resourceCardFacts(resource)).toEqual(expect.arrayContaining([
    { label: '地图尺寸', value: '300 × 200' },
    { label: '模式', value: 'survival' },
  ]));
});
