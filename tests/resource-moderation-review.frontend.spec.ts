import { effectiveResourceMetadata, resourceMetadataDifferences } from '../frontend/src/lib/resources/moderation-review';

describe('resource moderation metadata review', () => {
  it('reports conflicts while keeping the author value in the effective result', () => {
    const input = {
      metadata: { tags: ['author-tag'], game: { build: 145 } },
      renderer_metadata: { tags: ['parsed-tag'], game: { build: 146, width: 40 } },
    };

    expect(resourceMetadataDifferences(input)).toEqual([
      { path: 'game.build', authorValue: 145, parsedValue: 146 },
      { path: 'tags', authorValue: ['author-tag'], parsedValue: ['parsed-tag'] },
    ]);
    expect(effectiveResourceMetadata(input)).toEqual({
      tags: ['author-tag'],
      game: { build: 145, width: 40 },
    });
  });

  it('uses parsed values when author fields are missing', () => {
    expect(effectiveResourceMetadata({ renderer_metadata: { width: 20, game: { build: 146 } } })).toEqual({
      width: 20,
      game: { build: 146 },
    });
  });

  it('recursively merges nested objects while preserving authored leaves', () => {
    expect(effectiveResourceMetadata({
      metadata: { game: { build: 145, client: { name: 'author' } } },
      renderer_metadata: { game: { build: 146, width: 40, client: { name: 'parsed', version: 8 } } },
    })).toEqual({ game: { build: 145, width: 40, client: { name: 'author', version: 8 } } });
  });

  it('preserves false and zero authored values', () => {
    expect(effectiveResourceMetadata({
      metadata: { enabled: false, count: 0 },
      renderer_metadata: { enabled: true, count: 42 },
    })).toEqual({ enabled: false, count: 0 });
  });

  it('falls back from empty strings, arrays, and objects to parsed values', () => {
    expect(effectiveResourceMetadata({
      metadata: { name: '  ', tags: [], config: {} },
      renderer_metadata: { name: 'parsed', tags: ['parsed'], config: { width: 20 } },
    })).toEqual({ name: 'parsed', tags: ['parsed'], config: { width: 20 } });
  });

  it('does not flag fields that are supplied by only one side or are empty', () => {
    const input = {
      metadata: { tags: [], note: null, supported_versions: ['v8'] },
      renderer_metadata: { width: 20 },
    };

    expect(resourceMetadataDifferences(input)).toEqual([]);
    expect(effectiveResourceMetadata(input)).toEqual({ supported_versions: ['v8'], width: 20 });
  });
});
