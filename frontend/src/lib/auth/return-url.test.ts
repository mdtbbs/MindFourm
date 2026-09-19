import { safeReturnPath } from './return-url';

describe('safeReturnPath', () => {
  it.each([['/posts/new', '/posts/new'], ['https://evil.example', '/'], ['//evil.example', '/'], [undefined, '/']])(
    'keeps only a same-site return path', (input, expected) => expect(safeReturnPath(input)).toBe(expected),
  );
});
