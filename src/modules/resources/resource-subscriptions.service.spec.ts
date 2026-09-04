jest.mock('@nestjs/typeorm', () => ({ InjectRepository: () => () => undefined }));
jest.mock('@entities/resource-subscription.entity', () => ({ ResourceSubscription: class ResourceSubscription {} }));
jest.mock('@modules/notifications/notifications.service', () => ({ NotificationsService: class NotificationsService {} }));

import { ResourceSubscriptionsService } from './resource-subscriptions.service';

describe('ResourceSubscriptionsService', () => {
  it('creates an idempotent subscription and notifies only other subscribers', async () => {
    const repository = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((value) => value),
      save: jest.fn().mockResolvedValue(undefined),
      find: jest.fn().mockResolvedValue([{ user_id: 2 }, { user_id: 7 }]),
    };
    const notifications = { create: jest.fn().mockResolvedValue(undefined) };
    const service = new ResourceSubscriptionsService(repository as any, notifications as any);

    await expect(service.subscribe(15, 2)).resolves.toEqual({ is_subscribed: true });
    await service.notifyResourceUpdate({ id: 15, user_id: 7, title: '新版本' } as any);

    expect(repository.save).toHaveBeenCalledWith({ resource_id: 15, user_id: 2, notification_level: 'all' });
    expect(notifications.create).toHaveBeenCalledWith(expect.objectContaining({ user_id: 2, actor_id: 7, type: 'system', emailEvent: false }));
    expect(notifications.create).toHaveBeenCalledTimes(1);
  });
});
