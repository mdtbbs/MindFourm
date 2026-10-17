import { hydratePostCardExcerpts, selectPostCards } from './post-card-query.util';

function fakeQueryBuilder() {
  const calls: { selected?: string[]; raw?: string; rawAlias?: string } = {};
  const qb = {
    select: jest.fn((value: unknown) => {
      calls.selected = value as string[];
      return qb;
    }),
    addSelect: jest.fn((expression: string, alias?: string) => {
      calls.raw = expression;
      calls.rawAlias = alias;
      return qb;
    }),
  };
  return { qb, calls };
}

describe('selectPostCards', () => {
  it('projects only the card fields plus a bounded excerpt', () => {
    const { qb, calls } = fakeQueryBuilder();
    selectPostCards(qb as never);

    expect(calls.selected).toEqual(expect.arrayContaining([
      'post.id',
      'post.title',
      'post.created_at',
      'user.id',
      'user.username',
      'user.avatar_url',
      'category.name',
      'category.slug',
    ]));
    // Heavy body columns are never part of the card projection.
    expect(calls.selected).not.toEqual(expect.arrayContaining(['post.content']));
    expect(calls.selected).not.toEqual(expect.arrayContaining(['post.content_json']));
  });

  it('bounds the excerpt at 512 characters and falls back to the legacy column', () => {
    const { qb, calls } = fakeQueryBuilder();
    selectPostCards(qb as never, 'p', 'u', 'c');

    expect(calls.raw).toContain('LEFT(COALESCE(NULLIF(p.content_text, \'\'), p.content), 512)');
    // The alias is what hydratePostCardExcerpts reads the excerpt back from.
    expect(calls.rawAlias).toBe('post_card_excerpt');
  });
});

describe('hydratePostCardExcerpts', () => {
  it('writes each raw excerpt back onto its entity', () => {
    const result = {
      entities: [{ id: 1, content_text: 'legacy' }, { id: 2, content_text: 'legacy' }] as never[],
      raw: [{ post_id: 1, post_card_excerpt: 'first' }, { post_id: 2, post_card_excerpt: 'second' }],
    };

    const hydrated = hydratePostCardExcerpts(result as never);

    expect(hydrated.map((post) => post.content_text)).toEqual(['first', 'second']);
  });

  it('falls back to an empty string when a row has no excerpt', () => {
    const result = {
      entities: [{ id: 1, content_text: 'legacy' }] as never[],
      raw: [{ post_id: 1, post_card_excerpt: null }],
    };

    const hydrated = hydratePostCardExcerpts(result as never);

    expect(hydrated[0].content_text).toBe('');
  });

  it('honours a custom alias', () => {
    const post = { id: 5, content_text: '' };
    const result = {
      entities: [post],
      raw: [{ p_id: 5, post_card_excerpt: 'aliased' }],
    };

    hydratePostCardExcerpts(result as never, 'p');

    expect(post.content_text).toBe('aliased');
  });

  it('does not corrupt entities missing from the raw rows', () => {
    const result = {
      entities: [{ id: 7, content_text: 'keep me' }] as never[],
      raw: [],
    };

    const hydrated = hydratePostCardExcerpts(result as never);

    expect(hydrated[0].content_text).toBe('');
  });
});
