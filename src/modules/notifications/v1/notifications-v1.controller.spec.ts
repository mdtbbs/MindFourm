import { NotificationsV1Controller } from './notifications-v1.controller';

describe('NotificationsV1Controller', () => {
  it('returns the V1 pagination shape and scopes reads to the authenticated user', async () => {
    const notifications = { getByUserId: jest.fn().mockResolvedValue({ notifications: [{ id: 1 }], total: 1 }) };
    const controller = new NotificationsV1Controller(notifications as any);
    await expect(controller.list({ user: { id: 9 } }, { page: 2, limit: 30 })).resolves.toEqual({
      items: [{ id: 1 }], pagination: { page: 2, limit: 30, total: 1, total_pages: 1 },
    });
    expect(notifications.getByUserId).toHaveBeenCalledWith(9, 2, 30, 'all');
  });
});
