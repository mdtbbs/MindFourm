jest.mock('@nestjs/common', () => ({ Injectable: () => () => undefined }));
jest.mock('@nestjs/typeorm', () => ({ InjectRepository: () => () => undefined }));
jest.mock('@entities/developer-feed-entry.entity', () => ({ DeveloperFeedEntry: class DeveloperFeedEntry {} }));
jest.mock('@entities/service-account.entity', () => ({ ServiceAccount: class ServiceAccount {} }));
import { DeveloperFeedService } from './developer-feed.service';

describe('DeveloperFeedService', () => {
  it('updates the same GitHub entry when a pull request is merged', async () => {
    const existing = { id: 3, provider: 'github', repository: 'x/y', item_type: 'pull_request', external_id: '42' };
    const entries = { findOne: jest.fn().mockResolvedValue(existing), create: jest.fn(), save: jest.fn().mockImplementation(async x => x), find: jest.fn() };
    const accounts = { findOne: jest.fn(), create: jest.fn(), save: jest.fn() };
    const service = new DeveloperFeedService(entries as any, accounts as any);
    const result = await service.upsertGithub({ repository: 'x/y', itemType: 'pull_request', externalId: '42', state: 'merged', title: 'PR', url: 'https://github.com/x/y/pull/42', author: { login: 'author' } });
    expect(result).toMatchObject({ id: 3, state: 'merged', author_login: 'author' });
    expect(entries.findOne).toHaveBeenCalledWith({ where: expect.objectContaining({ external_id: '42' }) });
  });
});
