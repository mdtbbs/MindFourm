import { MAX_LINKIFY_RUN, findPlausibleLinks } from './link-autolink';

/**
 * These pin the bound that keeps a paste from freezing the tab.
 *
 * `linkifyjs.find` is super-linear in the length of a whitespace-free run, so
 * the cost of a scan is decided by the *longest run*, not the total length. A
 * regression here is invisible in normal editing and only shows up as an
 * unresponsive editor after pasting minified markup — hence the explicit
 * assertions on both sides of the threshold.
 */
describe('findPlausibleLinks', () => {
  it('finds ordinary links and keeps their index in the whole input', () => {
    expect(findPlausibleLinks('看看 https://example.com/a 这个')).toEqual([
      { text: 'https://example.com/a', href: 'https://example.com/a', index: 3 },
    ]);
    expect(findPlausibleLinks('example.com/x')).toEqual([
      { text: 'example.com/x', href: 'http://example.com/x', index: 0 },
    ]);
    const two = findPlausibleLinks('a https://x.com/1 b https://y.com/2');
    expect(two.map((l) => l.text)).toEqual(['https://x.com/1', 'https://y.com/2']);
    // The second index is measured from the start of the whole string, not the run.
    expect(two[1].index).toBe('a https://x.com/1 b '.length);
  });

  it('returns nothing for text without links', () => {
    expect(findPlausibleLinks('')).toEqual([]);
    expect(findPlausibleLinks('普通中文没有链接')).toEqual([]);
    expect(findPlausibleLinks('item_1 = value_1 * factor_1;')).toEqual([]);
  });

  it('skips runs longer than the bound instead of scanning them', () => {
    const longRun = 'a_b_'.repeat(MAX_LINKIFY_RUN); // 4x the ceiling
    expect(longRun.length).toBeGreaterThan(MAX_LINKIFY_RUN);
    expect(findPlausibleLinks(longRun)).toEqual([]);
  });

  it('still scans a run right at the bound', () => {
    const atBound = 'https://example.com/' + 'a'.repeat(MAX_LINKIFY_RUN - 'https://example.com/'.length);
    expect(atBound.length).toBe(MAX_LINKIFY_RUN);
    expect(findPlausibleLinks(atBound).map((l) => l.text)).toEqual([atBound]);
  });

  it('keeps a link that follows an over-long run', () => {
    const text = 'a_b_'.repeat(MAX_LINKIFY_RUN) + ' https://example.com/ok';
    expect(findPlausibleLinks(text).map((l) => l.text)).toEqual(['https://example.com/ok']);
  });

  it('is bounded in time on the payload that used to freeze the editor', () => {
    // 54KB of CJK with underscores: ~10s through an unbounded `find`.
    const payload = '中文_a说明_b。'.repeat(6000);
    const started = Date.now();
    expect(findPlausibleLinks(payload)).toEqual([]);
    expect(Date.now() - started).toBeLessThan(500);
  });
});
