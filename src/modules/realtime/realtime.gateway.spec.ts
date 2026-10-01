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
});
