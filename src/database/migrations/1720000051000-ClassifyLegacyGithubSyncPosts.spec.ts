import { QueryRunner } from 'typeorm';
import { classifyLegacyGithubSyncPosts } from './1720000051000-ClassifyLegacyGithubSyncPosts';

describe('classifyLegacyGithubSyncPosts', () => {
  it('matches the GitHub title prefix without requiring a trailing bracket', async () => {
    const query = jest.fn().mockResolvedValue([{}]);

    await classifyLegacyGithubSyncPosts({ query } as unknown as QueryRunner);

    const update = query.mock.calls
      .map(([sql]) => sql as string)
      .find((sql) => sql.includes('UPDATE posts post'));

    expect(update).toContain("post.title LIKE '[#%'");
    expect(update).not.toContain("post.title LIKE '[#%]'");
  });
});
