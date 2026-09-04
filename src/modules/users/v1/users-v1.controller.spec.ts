import { UsersV1Controller } from './users-v1.controller';

describe('UsersV1Controller', () => {
  it('returns only the stable V1 me DTO', async () => {
    const users = {
      getById: jest.fn().mockResolvedValue({
        id: 7,
        username: 'mobile-user',
        avatar_url: null,
        avatar_status: 'approved',
        bio: null,
        role: 'user',
        phone_verified: true,
        created_at: new Date('2026-08-29T00:00:00.000Z'),
        email: 'not-exposed@example.test',
      }),
    };
    const controller = new UsersV1Controller(users as any);

    await expect(controller.getMe({ user: { id: 7 } })).resolves.toEqual({
      id: 7,
      username: 'mobile-user',
      avatar_url: null,
      avatar_status: 'approved',
      bio: null,
      role: 'user',
      phone_verified: true,
      created_at: '2026-08-29T00:00:00.000Z',
    });
  });

  it('updates only the authenticated user profile and returns the V1 projection', async () => {
    const saved = {
      id: 7, username: 'renamed', avatar_url: null, avatar_status: 'approved', bio: '简介', role: 'user', phone_verified: false,
      created_at: new Date('2026-08-29T00:00:00.000Z'),
    };
    const users = { updateProfile: jest.fn().mockResolvedValue(saved) };
    const controller = new UsersV1Controller(users as any);

    await expect(controller.updateMe({ user: { id: 7 } }, { username: 'renamed', bio: '简介' })).resolves.toMatchObject({
      id: 7, username: 'renamed', bio: '简介', phone_verified: false,
    });
    expect(users.updateProfile).toHaveBeenCalledWith(7, { username: 'renamed', bio: '简介' });
  });

  it('returns a public profile without private account fields', async () => {
    const users = { getById: jest.fn().mockResolvedValue({
      id: 9, username: 'public-user', avatar_url: '/avatar.png', avatar_status: 'approved', bio: '公开简介', role: 'user',
      post_count: 3, reply_count: 5, created_at: new Date('2026-08-29T00:00:00.000Z'), email: 'hidden@example.test',
    }) };
    const controller = new UsersV1Controller(users as any);

    await expect(controller.getPublic(9)).resolves.toEqual({
      id: 9, username: 'public-user', avatar_url: '/avatar.png', avatar_status: 'approved', bio: '公开简介', role: 'user',
      post_count: 3, reply_count: 5, created_at: '2026-08-29T00:00:00.000Z',
    });
  });
});
