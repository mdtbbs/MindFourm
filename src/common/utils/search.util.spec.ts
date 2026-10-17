import { escapeLike } from './search.util';

describe('escapeLike', () => {
  it('escapes the wildcards that would otherwise widen a LIKE match', () => {
    expect(escapeLike('100%')).toBe('100\\%');
    expect(escapeLike('a_b')).toBe('a\\_b');
  });

  it('escapes the escape character itself', () => {
    expect(escapeLike('back\\slash')).toBe('back\\\\slash');
  });

  it('leaves ordinary search terms untouched', () => {
    expect(escapeLike('Mindustry 服务器')).toBe('Mindustry 服务器');
    expect(escapeLike('')).toBe('');
  });

  it('escapes every occurrence, not just the first', () => {
    expect(escapeLike('%%__')).toBe('\\%\\%\\_\\_');
  });
});
