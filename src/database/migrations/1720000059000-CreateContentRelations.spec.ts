import { CreateContentRelations1720000059000 } from './1720000059000-CreateContentRelations';

describe('CreateContentRelations1720000059000', () => {
  it('creates a generic relation table and copies legacy post server links', async () => {
    const query = jest.fn().mockResolvedValue(undefined);
    const runner = { query, getTable: jest.fn().mockResolvedValue({
      findColumnByName: jest.fn().mockReturnValue({ name: 'server_id' }),
      indices: [{ name: 'idx_posts_server_id' }],
    }), dropIndex: jest.fn(), dropColumn: jest.fn() };
    await new CreateContentRelations1720000059000().up(runner as any);
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[0][0]).toContain('CREATE TABLE IF NOT EXISTS content_relations');
    expect(query.mock.calls[0][0]).toContain('uq_content_relation');
    expect(query.mock.calls[1][0]).toContain("SELECT 'post', id, 'game_server', CAST(server_id AS CHAR)");
    expect(runner.dropIndex).toHaveBeenCalledWith('posts', 'idx_posts_server_id');
    expect(runner.dropColumn).toHaveBeenCalledWith('posts', 'server_id');
  });

  it('restores the legacy column from generic server relations when reverting', async () => {
    const query = jest.fn().mockResolvedValue(undefined);
    const runner = { query, getTable: jest.fn().mockResolvedValue({ findColumnByName: jest.fn().mockReturnValue(undefined) }),
      addColumn: jest.fn(), createIndex: jest.fn(), hasTable: jest.fn().mockResolvedValue(true) };
    await new CreateContentRelations1720000059000().down(runner as any);
    expect(runner.addColumn).toHaveBeenCalledWith('posts', expect.objectContaining({ name: 'server_id' }));
    expect(runner.createIndex).toHaveBeenCalledWith('posts', expect.objectContaining({ name: 'idx_posts_server_id' }));
    expect(query).toHaveBeenCalledWith(expect.stringContaining('UPDATE posts p'));
  });
});
