import axios from 'axios';
import { createHmac } from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import { SettingsService } from '../settings/settings.service';
import { isPublicHttpUrl } from '@common/utils/safe-url.util';
import type {
  AdminNotificationView,
  PublishAdminNotificationInput,
} from './admin-notifications.service';

export interface AdminNotificationWebhookPayload {
  event_type: 'admin-notification';
  event_key: string;
  category: string;
  level: string;
  title: string;
  content: string | null;
  action_url: string | null;
  metadata: Record<string, unknown> | null;
  preference_key: string | null;
  recipient_ids: number[];
  notifications: AdminNotificationView[];
  sent_at: string;
}

@Injectable()
export class AdminNotificationWebhookService {
  private readonly logger = new Logger(AdminNotificationWebhookService.name);

  constructor(private readonly settingsService: SettingsService) {}

  async publish(
    input: PublishAdminNotificationInput,
    notifications: AdminNotificationView[],
  ): Promise<void> {
    if (notifications.length === 0) {
      return;
    }

    if (!(await this.settingsService.getBoolean('admin_notifications_webhook_enabled', false))) {
      return;
    }

    const url = (await this.settingsService.get('admin_notifications_webhook_url'))?.trim();
    if (!url) {
      return;
    }

    // The URL is admin-supplied and was posted to with no validation at all, which
    // made this a server-side request forgery primitive: cloud metadata endpoints,
    // internal-only services and loopback ports were all reachable.
    if (!isPublicHttpUrl(url)) {
      this.logger.warn(`Refusing to deliver admin notification webhook to ${url}`);
      return;
    }

    const payload: AdminNotificationWebhookPayload = {
      event_type: 'admin-notification',
      event_key: input.event_key,
      category: input.category,
      level: input.level || 'info',
      title: input.title,
      content: input.content ?? null,
      action_url: input.action_url ?? null,
      metadata: input.metadata ?? null,
      preference_key: input.preference_key ?? null,
      recipient_ids: notifications.map((notification) => notification.user_id),
      notifications,
      sent_at: new Date().toISOString(),
    };

    const serializedPayload = JSON.stringify(payload);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-MindForum-Event': 'admin-notification',
    };

    const secret = (await this.settingsService.get('admin_notifications_webhook_secret'))?.trim();
    if (secret) {
      headers['X-MindForum-Signature'] = `sha256=${createHmac('sha256', secret)
        .update(serializedPayload)
        .digest('hex')}`;
    }

    // Send the exact bytes the signature was computed over. Passing the object let
    // axios re-serialize it independently, so the HMAC was not guaranteed to match
    // the body the receiver actually verified.
    await axios.post(url, serializedPayload, {
      headers,
      timeout: this.parseTimeout(await this.settingsService.get('admin_notifications_webhook_timeout_ms')),
      // Prevent axios from following a redirect into a blocked address.
      maxRedirects: 0,
      transformRequest: [(data) => data],
    });
  }

  private parseTimeout(value: string | null): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 5000;
  }
}
