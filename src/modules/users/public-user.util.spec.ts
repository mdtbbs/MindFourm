import { toPublicUser, toPublicUsers } from './public-user.util';

const fullUser = {
  id: 7,
  username: 'alice',
  role: 'user',
  email: 'alice@example.com',
  mindauth_id: 900123,
  avatar_url: '/uploads/avatars/a.png',
  pending_avatar_url: '/uploads/avatars/pending.png',
  avatar_status: 'approved',
  bio: 'hi',
  total_points: 120,
  available_points: 45,
  reply_email: true,
  mention_email: false,
  message_email: true,
  system_email: true,
  digest_email: false,
  phone_verified: true,
  phone_verified_at: new Date('2026-01-01'),
  created_at: new Date('2025-12-01'),
  updated_at: new Date('2026-02-01'),
};

describe('toPublicUser', () => {
  it('removes contact details and account internals', () => {
    const result = toPublicUser(fullUser) as Record<string, unknown>;

    for (const field of [
      'email',
      'mindauth_id',
      'pending_avatar_url',
      'available_points',
      'reply_email',
      'mention_email',
      'message_email',
      'system_email',
      'digest_email',
      'phone_verified',
      'phone_verified_at',
    ]) {
      expect(result).not.toHaveProperty(field);
    }
  });

  it('keeps the fields a profile page needs', () => {
    const result = toPublicUser(fullUser) as Record<string, unknown>;

    expect(result).toMatchObject({
      id: 7,
      username: 'alice',
      role: 'user',
      avatar_url: '/uploads/avatars/a.png',
      avatar_status: 'approved',
      bio: 'hi',
      total_points: 120,
    });
    expect(result.created_at).toEqual(fullUser.created_at);
  });

  it('passes computed extras through untouched', () => {
    const result = toPublicUser({ ...fullUser, post_count: 12, reply_count: 34 }) as Record<
      string,
      unknown
    >;

    expect(result.post_count).toBe(12);
    expect(result.reply_count).toBe(34);
    expect(result).not.toHaveProperty('email');
  });

  it('does not mutate its input', () => {
    const input = { ...fullUser };
    toPublicUser(input);

    expect(input.email).toBe('alice@example.com');
  });

  it('handles a nullish record without throwing', () => {
    expect(toPublicUser(null as any)).toBeNull();
    expect(toPublicUsers(null as any)).toEqual([]);
  });

  it('maps a list', () => {
    const result = toPublicUsers([fullUser, { ...fullUser, id: 8, username: 'bob' }]);

    expect(result).toHaveLength(2);
    expect(result.every((user) => !('email' in user))).toBe(true);
  });
});
