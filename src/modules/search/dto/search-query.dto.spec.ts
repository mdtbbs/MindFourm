import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { SearchQueryDto } from './search-query.dto';

describe('SearchQueryDto', () => {
  it.each([
    [{ q: '' }],
    [{ q: 'mod', page: '0' }],
    [{ q: 'mod', limit: '0' }],
    [{ q: 'mod', limit: '101' }],
  ])('rejects invalid Android M1 query %o', async (input) => {
    const errors = await validate(plainToInstance(SearchQueryDto, input));
    expect(errors.length).toBeGreaterThan(0);
  });

  it('transforms a valid page query to numeric values', async () => {
    const value = plainToInstance(SearchQueryDto, { q: 'mod', page: '1', limit: '20' });
    expect(await validate(value)).toHaveLength(0);
    expect(value.page).toBe(1);
    expect(value.limit).toBe(20);
  });
});
