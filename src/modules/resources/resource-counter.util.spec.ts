import { incrementResourceCounter } from './resource-counter.util';

describe('incrementResourceCounter', () => {
  it('writes only the counter column and reports affected rows', async () => {
    const manager = { query: jest.fn().mockResolvedValue({ affectedRows: 1 }) } as any;

    await expect(incrementResourceCounter(manager, 42, 'download_count')).resolves.toBe(1);

    const [sql, params] = manager.query.mock.calls[0];
    expect(sql).toContain('`download_count` = `download_count` + ?');
    expect(sql).not.toContain('updated_at');
    expect(params).toEqual([1, 42]);
  });

  it('supports a custom delta and normalises rows-affected shapes', async () => {
    const manager = { query: jest.fn().mockResolvedValue([{ affectedRows: '3' }]) } as any;

    await expect(incrementResourceCounter(manager, 7, 'view_count', 5)).resolves.toBe(3);

    const [sql, params] = manager.query.mock.calls[0];
    expect(sql).toContain('`view_count` = `view_count` + ?');
    expect(params).toEqual([5, 7]);
  });

  it('reports zero when the resource row no longer exists', async () => {
    const manager = { query: jest.fn().mockResolvedValue({ affectedRows: 0 }) } as any;

    await expect(incrementResourceCounter(manager, 9, 'view_count')).resolves.toBe(0);
  });
});
