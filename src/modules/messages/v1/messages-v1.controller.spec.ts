import 'reflect-metadata';
import { MessagesV1Controller } from './messages-v1.controller';
import { REQUIRED_OAUTH_SCOPES } from '../../../common/decorators/require-oauth-scopes.decorator';
import { RATE_LIMIT_KEY } from '../../../common/decorators/rate-limit.decorator';

describe('MessagesV1Controller', () => {
  it('keeps separate read/write OAuth scopes and explicit request limits', () => {
    expect(Reflect.getMetadata(REQUIRED_OAUTH_SCOPES, MessagesV1Controller.prototype.conversations)).toEqual(['message.read']);
    expect(Reflect.getMetadata(RATE_LIMIT_KEY, MessagesV1Controller.prototype.conversations)).toEqual({ max: 60, window: 60 });
    expect(Reflect.getMetadata(REQUIRED_OAUTH_SCOPES, MessagesV1Controller.prototype.send)).toEqual(['message.write']);
    expect(Reflect.getMetadata(RATE_LIMIT_KEY, MessagesV1Controller.prototype.send)).toEqual({ max: 10, window: 60 });
  });

  it('adapts the existing cursor service and returns only public message fields', async () => {
    const messages = {
      getConversation: jest.fn().mockResolvedValue({
        data: [{ id: 7, sender_id: 1, recipient_id: 2, content: 'Hi', content_html: '<p>Hi</p>', is_read: 1, created_at: new Date('2026-01-01'), deleted_by_sender: 0 }],
        nextCursor: 'opaque-next', hasMore: true,
      }),
    };
    const settings = { getBoolean: jest.fn().mockResolvedValue(true) };
    const controller = new MessagesV1Controller(messages as any, settings as any);
    await expect(controller.conversation({ user: { id: 1 } }, 2, { limit: '10' })).resolves.toEqual({
      items: [{ id: 7, sender_id: 1, recipient_id: 2, content: 'Hi', content_html: '<p>Hi</p>', is_read: true, created_at: '2026-01-01T00:00:00.000Z' }],
      next_cursor: 'opaque-next', has_more: true,
    });
    expect(messages.getConversation).toHaveBeenCalledWith(1, 2, '10', undefined);
  });

  it('returns THIRD_PARTY_ACCESS_DISABLED instead of hiding a disabled API', async () => {
    const controller = new MessagesV1Controller({} as any, { getBoolean: jest.fn(async (key: string) => key === 'feature_messages_enabled') } as any);
    try {
      await controller.conversations({ user: { id: 1 }, authContext: { source: 'mindauth_oauth', partyType: 'third_party' } }, {});
      throw new Error('expected feature gate');
    } catch (error: any) {
      expect(error).toMatchObject({ code: 'THIRD_PARTY_ACCESS_DISABLED' });
      expect(error.getStatus()).toBe(403);
    }
  });

  it('returns MESSAGING_DISABLED when the site closes messaging', async () => {
    const controller = new MessagesV1Controller({} as any, { getBoolean: jest.fn().mockResolvedValue(false) } as any);
    await expect(controller.conversations({ user: { id: 1 } }, {})).rejects.toMatchObject({ code: 'MESSAGING_DISABLED' });
  });
});
