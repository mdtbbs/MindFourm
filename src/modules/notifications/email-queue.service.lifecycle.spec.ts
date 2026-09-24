import { EmailQueueService } from './email-queue.service';

describe('EmailQueueService lifecycle', () => {
  it('can shut down cleanly when queue initialization did not complete', async () => {
    const service = new EmailQueueService({} as any, {} as any, {} as any);
    await expect(service.onModuleDestroy()).resolves.toBeUndefined();
  });
});
