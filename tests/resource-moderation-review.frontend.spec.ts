import { effectiveResourceMetadata, resourceMetadataDifferences } from '../frontend/src/lib/resources/moderation-review';

describe('resource moderation metadata review', () => {
  it('reports conflicting same-name fields and uses parsed values in the effective result', () => {
    const input = {
      metadata: { tags: ['author-tag'], game: { build: 145 } },
      renderer_metadata: { tags: ['parsed-tag'], game: { build: 146, width: 40 } },
    };

    expect(resourceMetadataDifferences(input)).toEqual([
      { path: 'game.build', authorValue: 145, parsedValue: 146 },
      { path: 'tags', authorValue: ['author-tag'], parsedValue: ['parsed-tag'] },
    ]);
    expect(effectiveResourceMetadata(input)).toEqual({
      tags: ['parsed-tag'],
      game: { build: 146, width: 40 },
    });
  });

  it('does not flag fields that are supplied by only one side or are empty', () => {
    const input = {
      metadata: { tags: [], note: null, supported_versions: ['v8'] },
      renderer_metadata: { width: 20 },
    };

    expect(resourceMetadataDifferences(input)).toEqual([]);
    expect(effectiveResourceMetadata(input)).toEqual({ tags: [], note: null, supported_versions: ['v8'], width: 20 });
  });
});
