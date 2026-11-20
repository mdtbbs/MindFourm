import type { Resource } from '@/types';
import { resourceCardFacts, resourceFileExtension, resourceFileSummary, resourceStatusLabel, resourceVersionLabel, resolveResourceCardPresentation } from './presentation';
import { resourceKindLabelKey } from '@/lib/display-labels';
import en from '@/i18n/locales/en/common.json';

const resource = {
  resource_kind: 'map', file_name: 'arena_final.msav', file_size: 2500000,
  version: '2.1.1', versions: [{ version: '3', file_name: 'arena_v3.msav' }],
  renderer_metadata: { width: 300, height: 200, game_modes: ['survival'], planet: 'Serpulo', spawns: 2, build: 160 },
} as Resource;

/** Minimal catalog lookup so assertions stay readable without a provider. */
function readKey(key: string, values: Record<string, string | number> = {}): string {
  const leaf = key.split('.').reduce<unknown>((value, part) => (value && typeof value === 'object' ? (value as Record<string, unknown>)[part] : undefined), en);
  if (typeof leaf !== 'string') throw new Error(`missing catalog key ${key}`);
  return Object.entries(values).reduce((text, [name, value]) => text.replaceAll(`{${name}}`, String(value)), leaf);
}

/** Facts and summaries now return locale keys; resolve them for assertions. */
function resolve(parts: string[]): string[] {
  // Keys are dotted; extensions and formatted sizes are literals that need no lookup.
  return parts.map((part) => (/^[a-zA-Z]+\.[a-zA-Z]/.test(part) ? readKey(part) : part));
}

test('file extension and file summary use actual human-readable file facts', () => {
  expect(resourceFileExtension(resource.file_name)).toBe('.msav');
  expect(resolve(resourceFileSummary(resource))).toEqual(['Maps', '.msav', '2.4 MB']);
});

test('resource version is distinct from Mindustry build number', () => {
  expect(resourceVersionLabel(resource)).toBe('v3');
  expect(resourceVersionLabel({ version: '160', versions: [] })).toBe('v160');
  const modFacts = resourceCardFacts({ ...resource, resource_kind: 'mod', renderer_metadata: { version: '1.4', build: 160 } });
  expect(modFacts.some((fact) => fact.value.startsWith(readKey('editor.buildNumber', { build: 1.4 })))).toBe(false);
});

test('unknown resource enums fall back to a catalog key, never raw prose', () => {
  expect(resourceKindLabelKey('internal_new_kind')).toBe('resourceLabels.kindOther');
  expect(readKey(resourceKindLabelKey('internal_new_kind'))).toBe('Other');
});

test('resource moderation status maps to a catalog key instead of asserted copy', () => {
  expect(resourceStatusLabel('pending')).toBe('editor.statusPending');
  expect(resourceStatusLabel('rejected')).toBe('resourceLabels.statusRejected');
  expect(resourceStatusLabel('published')).toBe('editor.visibilityPublic');
});

test('map cards prioritize parsed map facts', () => {
  // Labels are keys so no language leaks into the fact data itself.
  expect(resourceCardFacts(resource)).toEqual(expect.arrayContaining([
    { label: 'editor.mapSizeLabel', value: '300 × 200' },
    { label: 'editor.modeLabel', value: 'survival' },
  ]));
});

test('every fact label resolves in the English catalog', () => {
  for (const fact of resourceCardFacts(resource)) expect(typeof readKey(fact.label)).toBe('string');
});

test('resource cards use gallery layouts only for maps and schematics', () => {
  expect(resolveResourceCardPresentation('map')).toBe('gallery');
  expect(resolveResourceCardPresentation('schematic')).toBe('gallery');
  expect(resolveResourceCardPresentation('mod')).toBe('information');
  expect(resolveResourceCardPresentation('development_tool')).toBe('information');
  expect(resolveResourceCardPresentation('other')).toBe('generic');
  expect(resolveResourceCardPresentation('unexpected_kind')).toBe('generic');
});
