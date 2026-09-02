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
});
