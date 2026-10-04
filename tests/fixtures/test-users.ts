export type TestUserType = 'admin' | 'moderator' | 'user';

export const TEST_USERS: Record<TestUserType, { id: number; username: string; role: string }> = {
  admin: { id: 0, username: 'e2e_admin', role: 'admin' },
  moderator: { id: 0, username: 'e2e_moderator', role: 'moderator' },
  user: { id: 0, username: 'e2e_user', role: 'user' },
};

export function recordTestUser(userType: TestUserType, userId: unknown): void {
  const id = Number(userId);
  if (Number.isSafeInteger(id) && id > 0) TEST_USERS[userType].id = id;
}
