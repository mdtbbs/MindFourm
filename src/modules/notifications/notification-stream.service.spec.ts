import { EventEmitter } from 'events';
import { NotificationStreamService } from './notification-stream.service';

describe('NotificationStreamService cross-worker fan-out', () => {
  const setup = () => {
    const subscribers: EventEmitter[] = [];
    const duplicate = jest.fn(() => {
      const subscriber = new EventEmitter() as any;
      subscriber.subscribe = jest.fn().mockResolvedValue(1);
      subscriber.disconnect = jest.fn();
      subscribers.push(subscriber);
      return subscriber;
    });
    const redis = {
      getClient: () => ({ duplicate }),
      isRedisAvailable: jest.fn().mockReturnValue(true),
      publishRealtime: jest.fn(async (channel, message) => {
        subscribers.forEach((subscriber) => subscriber.emit('message', channel, message));
      }),
    };
    const first = new NotificationStreamService(redis as any);
    const second = new NotificationStreamService(redis as any);
    first.onModuleInit(); second.onModuleInit();
    subscribers.forEach((subscriber) => subscriber.emit('ready'));
    return { first, second, redis, subscribers };
  };

  it('delivers once locally and once remotely with the target user intact', async () => {
    const { first, second, redis } = setup();
    const local = jest.fn(), remote = jest.fn(), raw = jest.fn();
    first.stream$.subscribe(local); second.stream$.subscribe(remote); second.rawStream$.subscribe(raw);
    first.push(7, { id: 42 });
    expect(local).toHaveBeenCalledTimes(1);
    expect(remote).toHaveBeenCalledWith({ userId: 7, notification: { id: 42 } });
    expect(remote).toHaveBeenCalledTimes(1);
    first.pushRaw(8, 'presence', { online: true });
    expect(raw).toHaveBeenCalledWith({ userId: 8, type: 'presence', data: { online: true } });
    expect(redis.publishRealtime).toHaveBeenCalledTimes(2);
    await first.onModuleDestroy(); await second.onModuleDestroy();
  });

  it('preserves local delivery during an outage, ignores malformed payloads, and cleans up', async () => {
    const { first, second, redis, subscribers } = setup();
    const local = jest.fn(), remote = jest.fn(), completed = jest.fn();
    first.stream$.subscribe(local);
    second.stream$.subscribe({ next: remote, complete: completed });
    redis.isRedisAvailable.mockReturnValue(false);
    first.push(7, { id: 42 });
    expect(local).toHaveBeenCalledTimes(1);
    expect(remote).not.toHaveBeenCalled();
    subscribers[1].emit('message', 'forum:notification-stream:v1', '{invalid');
    subscribers[1].emit('message', 'forum:notification-stream:v1', JSON.stringify({ kind: 'notification', userId: '7', notification: {} }));
    expect(remote).not.toHaveBeenCalled();
    await second.onModuleDestroy();
    expect(completed).toHaveBeenCalledTimes(1);
    expect((subscribers[1] as any).disconnect).toHaveBeenCalledTimes(1);
    expect(subscribers[1].listenerCount('message')).toBe(0);
    await first.onModuleDestroy();
  });
});
