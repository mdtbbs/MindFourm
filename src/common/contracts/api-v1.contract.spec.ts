import { apiV1Success } from './api-v1.contract';

describe('apiV1Success', () => {
  it('promotes legacy page pagination into the common meta contract without changing data', () => {
    const value = { items: [1], pagination: { page: 2, limit: 10, total: 25, totalPages: 3 } };
    expect(apiV1Success(value, 'req-1')).toEqual({
      data: value,
      meta: { request_id: 'req-1', pagination: { page: 2, limit: 10, total: 25, total_pages: 3, has_more: true } },
    });
  });

  it('adds meta pagination to array results without changing their JSON shape', () => {
    const items: any[] = ['a'];
    Object.defineProperty(items, '__v1Pagination', { value: { page: 1, limit: 20, total: 1, total_pages: 1, has_more: false } });
    expect(apiV1Success(items, 'req-2')).toEqual({
      data: items,
      meta: { request_id: 'req-2', pagination: { page: 1, limit: 20, total: 1, total_pages: 1, has_more: false } },
    });
    expect(JSON.stringify(items)).toBe('["a"]');
  });
});
