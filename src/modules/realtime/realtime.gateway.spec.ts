import { EventEmitter } from 'events';
import { RealtimeGateway } from './realtime.gateway';

describe('RealtimeGateway Redis subscription startup', () => {
  it('waits for the dedicated Redis connection to be ready before subscribing', async () => {
    const subscriber = new EventEmitter() as any;
    subscriber.status = 'connecting';
    subscriber.psubscribe = jest.fn().mockResolvedValue(2);
    subscriber.disconnect = jest.fn();
    const commandClient = { duplicate: jest.fn().mockReturnValue(subscriber) };
    const redis = { getClient: jest.fn().mockReturnValue(commandClient) };
    const gateway = new RealtimeGateway(redis as any, {} as any, {} as any, {} as any);

    await gateway.onModuleInit();

    expect(commandClient.duplicate).toHaveBeenCalledWith({ enableOfflineQueue: true });
    expect(subscriber.psubscribe).not.toHaveBeenCalled();

    subscriber.status = 'ready';
    subscriber.emit('ready');
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(subscriber.psubscribe).toHaveBeenCalledWith('realtime:user:*', 'realtime:session:*');
    gateway.onModuleDestroy();
  });

  it('subscribes immediately when Redis is already ready', async () => {
    const subscriber = new EventEmitter() as any;
    subscriber.status = 'ready';
    subscriber.psubscribe = jest.fn().mockResolvedValue(2);
    subscriber.disconnect = jest.fn();
    const redis = { getClient: () => ({ duplicate: () => subscriber }) };
    const gateway = new RealtimeGateway(redis as any, {} as any, {} as any, {} as any);

    await gateway.onModuleInit();

    expect(subscriber.psubscribe).toHaveBeenCalledWith('realtime:user:*', 'realtime:session:*');
    gateway.onModuleDestroy();
  });

  it('enforces the session subscription limit across multiple subscribe messages', async () => {
    const redis = { getClient: () => ({ duplicate: () => ({}) }) };
    const events = { latestSessionEventId: jest.fn().mockResolvedValue('1-0') };
    const multiplayer = { authorizeRealtimeSession: jest.fn().mockResolvedValue(undefined) };
    const gateway = new RealtimeGateway(redis as any, events as any, multiplayer as any, {} as any) as any;
    const client = { readyState: 1, send: jest.fn() };
    const state = {
      userId: 7, clientId: 'launcher', sessions: new Set<string>(), cursors: new Map<string, string>(),
      delivered: new Map(), acked: new Map(), approvalEvents: new Map(), pumps: new Map(),
    };
    gateway.states.set(client, state);
    const ids = Array.from({ length: 33 }, (_, index) => `ses_${String(index).padStart(20, '0')}`);

    await gateway.handleMessage(client, JSON.stringify({ type: 'subscribe', sessions: ids.slice(0, 32) }));
    await gateway.handleMessage(client, JSON.stringify({ type: 'subscribe', sessions: [ids[32]] }));

    expect(state.sessions.size).toBe(32);
    expect(multiplayer.authorizeRealtimeSession).toHaveBeenCalledTimes(32);
    expect(client.send).toHaveBeenCalledWith(JSON.stringify({ type: 'error', code: 'SESSION_SUBSCRIPTION_LIMIT_REACHED' }));
  });
});
