import { BadRequestException } from '@nestjs/common';
import { ResourcesV2WriteController } from './resources-v2-write.controller';

describe('ResourcesV2WriteController invitation response validation', () => {
  function controller() {
    const resources = { respondToInvitation: jest.fn().mockResolvedValue({ accepted: true }) };
    return { controller: new ResourcesV2WriteController(resources as any, {} as any), resources };
  }

  it.each([
    ['accept true', { accept: true }, true],
    ['accept false', { accept: false }, false],
  ])('passes %s through as a real JSON boolean', async (_label, body, expected) => {
    const { controller: instance, resources } = controller();

    await instance.respondToInvitation('10000000-0000-4000-8000-000000000001', body as any, { user: { id: 7 } });

    expect(resources.respondToInvitation).toHaveBeenCalledWith(
      '10000000-0000-4000-8000-000000000001', expected, 7,
    );
  });

  it.each([
    ['string false', { accept: 'false' }],
    ['string true', { accept: 'true' }],
    ['number one', { accept: 1 }],
    ['number zero', { accept: 0 }],
    ['missing accept', {}],
    ['missing body', undefined],
  ])('rejects %s with 400', async (_label, body) => {
    const { controller: instance, resources } = controller();

    await expect(instance.respondToInvitation(
      '10000000-0000-4000-8000-000000000001', body as any, { user: { id: 7 } },
    )).rejects.toBeInstanceOf(BadRequestException);
    expect(resources.respondToInvitation).not.toHaveBeenCalled();
  });
});
