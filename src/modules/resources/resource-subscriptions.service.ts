import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ResourceSubscription } from '@entities/resource-subscription.entity';
import { Resource } from '@entities/resource.entity';
import { NotificationsService } from '@modules/notifications/notifications.service';

@Injectable()
export class ResourceSubscriptionsService {
  constructor(
    @InjectRepository(ResourceSubscription)
    private readonly subscriptions: Repository<ResourceSubscription>,
    private readonly notifications: NotificationsService,
  ) {}

  async getStatus(resourceId: number, userId: number) {
    const subscription = await this.subscriptions.findOne({ where: { resource_id: resourceId, user_id: userId } });
    return { is_subscribed: Boolean(subscription) };
  }

  async subscribe(resourceId: number, userId: number) {
    const existing = await this.subscriptions.findOne({ where: { resource_id: resourceId, user_id: userId } });
    if (!existing) await this.subscriptions.save(this.subscriptions.create({ resource_id: resourceId, user_id: userId, notification_level: 'all' }));
    return { is_subscribed: true };
  }

  async unsubscribe(resourceId: number, userId: number) {
    await this.subscriptions.delete({ resource_id: resourceId, user_id: userId });
    return { is_subscribed: false };
  }

  async notifyResourceUpdate(resource: Resource): Promise<void> {
    const subscribers = await this.subscriptions.find({ where: { resource_id: resource.id, notification_level: 'all' } });
    await Promise.all(subscribers
      .filter((subscription) => subscription.user_id !== resource.user_id)
      .map((subscription) => this.notifications.create({
        user_id: subscription.user_id,
        type: 'system',
        actor_id: resource.user_id,
        content: `你订阅的资源「${resource.title}」已有更新并已通过审核：/resources/${resource.id}`,
        emailEvent: false,
      }).catch(() => undefined)));
  }
}
