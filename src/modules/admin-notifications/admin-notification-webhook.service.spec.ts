jest.mock('../settings/settings.service', () => ({
  SettingsService: class SettingsService {},
}));

import axios from 'axios';
import { createHmac } from 'crypto';
import {
  AdminNotificationWebhookPayload,
  AdminNotificationWebhookService,
} from './admin-notification-webhook.service';

jest.mock('axios');

const mockedAxios = axios as jest.Mocked<typeof axios>;

function createService(overrides: {
  get?: jest.Mock;
  getBoolean?: jest.Mock;
} = {}) {
  const settingsService = {
    get: jest.fn().mockImplementation(async (key: string) => {
      if (key === 'admin_notifications_webhook_url') return 'https://example.com/hooks/admin';
      if (key === 'admin_notifications_webhook_secret') return 'hook-secret';
      if (key === 'admin_notifications_webhook_timeout_ms') return '8000';
      return null;
    }),
    getBoolean: jest.fn().mockImplementation(async (key: string, defaultValue = false) => {
      if (key === 'admin_notifications_webhook_enabled') return true;
      return defaultValue;
    }),
    ...overrides,
  };

  return {
    service: new AdminNotificationWebhookService(settingsService as any),
    settingsService,
  };
}

describe('AdminNotificationWebhookService', () => {
  beforeEach(() => {
    mockedAxios.post.mockReset();
    mockedAxios.post.mockResolvedValue({ status: 200, data: {} } as any);
  });

  it('posts webhook payload with signature and configured timeout', async () => {
    const { service } = createService();
    const notifications = [
      {
        id: 1,
        user_id: 4,
        event_key: 'moderation.post.pending',
        category: 'moderation',
        level: 'warning' as const,
        title: 'Pending post',
        content: 'Review required',
        action_url: '/admin/content/moderation',
        metadata: { item_type: 'post', item_id: 9 },
        is_read: false,
        read_at: null,
        created_at: '2026-07-08T12:00:00.000Z',
      },
    ];

    await service.publish({
      event_key: 'moderation.post.pending',
      category: 'moderation',
      level: 'warning',
      title: 'Pending post',
      content: 'Review required',
      action_url: '/admin/content/moderation',
      metadata: { item_type: 'post', item_id: 9 },
      preference_key: 'admin_notifications_moderation_pending_enabled',
    }, notifications);

    expect(mockedAxios.post).toHaveBeenCalledTimes(1);

    // The body is now sent as a pre-serialized string so the signature covers
    // exactly the bytes on the wire — passing the object let axios re-serialize it
    // independently, which is not guaranteed to match.
    const [url, rawBody, config] = mockedAxios.post.mock.calls[0] as [
      string,
      string,
      { headers: Record<string, string>; timeout: number },
    ];

    expect(url).toBe('https://example.com/hooks/admin');
    expect(typeof rawBody).toBe('string');

    const payload: AdminNotificationWebhookPayload = JSON.parse(rawBody);
    expect(payload).toMatchObject({
      event_type: 'admin-notification',
      event_key: 'moderation.post.pending',
      recipient_ids: [4],
      notifications,
    });
    expect(config.timeout).toBe(8000);
    expect(config.headers['X-MindForum-Event']).toBe('admin-notification');
    expect(config.headers['X-MindForum-Signature']).toBe(
      `sha256=${createHmac('sha256', 'hook-secret').update(rawBody).digest('hex')}`,
    );
  });

  it('refuses to deliver to a private or loopback address', async () => {
    // Without this the admin-supplied URL was a server-side request forgery
    // primitive: cloud metadata, loopback ports and internal services were all
    // reachable from the forum process.
    for (const url of [
      'http://127.0.0.1:6379/',
      'http://localhost/hook',
      'http://169.254.169.254/latest/meta-data/',
      'http://10.0.0.5/hook',
      'http://192.168.1.10/hook',
      'http://172.16.0.9/hook',
      'http://[::1]/hook',
    ]) {
      mockedAxios.post.mockClear();
      const { service } = createService({
        getBoolean: jest.fn().mockResolvedValue(true),
        get: jest.fn(async (key: string) =>
          key === 'admin_notifications_webhook_url' ? url : null,
        ),
      });

      await service.publish({
        event_key: 'moderation.post.pending',
        category: 'moderation',
        title: 'Pending post',
      }, [{
        id: 1,
        user_id: 4,
        event_key: 'moderation.post.pending',
        category: 'moderation',
        level: 'warning',
        title: 'Pending post',
        content: null,
        action_url: null,
        metadata: null,
        is_read: false,
        read_at: null,
        created_at: new Date('2026-07-08T12:00:00.000Z'),
      }] as any);

      expect(mockedAxios.post).not.toHaveBeenCalled();
    }
  });

  it('skips webhook delivery when the channel is disabled', async () => {
    const { service } = createService({
      getBoolean: jest.fn().mockResolvedValue(false),
    });

    await service.publish({
      event_key: 'moderation.post.pending',
      category: 'moderation',
      title: 'Pending post',
    }, [{
      id: 1,
      user_id: 4,
      event_key: 'moderation.post.pending',
      category: 'moderation',
      level: 'warning',
      title: 'Pending post',
      content: null,
      action_url: null,
      metadata: null,
      is_read: false,
      read_at: null,
      created_at: '2026-07-08T12:00:00.000Z',
    }]);

    expect(mockedAxios.post).not.toHaveBeenCalled();
  });
});
