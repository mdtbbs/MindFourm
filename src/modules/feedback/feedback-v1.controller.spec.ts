import 'reflect-metadata';
import { API_V1_CONTRACT } from '@common/decorators/api-v1.decorator';
import { FeedbackV1Controller } from './feedback-v1.controller';

describe('FeedbackV1Controller', () => {
  it('is a V1 controller and associates an optional viewer when available', async () => {
    const feedback = { create: jest.fn().mockResolvedValue({ id: 4, status: 'pending' }) };
    const controller = new FeedbackV1Controller(feedback as any);

    await expect(controller.submit({ type: 'bug', title: '无法打开', description: '复现步骤' }, { user: { id: 7 } })).resolves.toEqual({ id: 4, status: 'pending' });
    expect(Reflect.getMetadata(API_V1_CONTRACT, FeedbackV1Controller)).toBe(true);
    expect(feedback.create).toHaveBeenCalledWith({ type: 'bug', title: '无法打开', description: '复现步骤', contactEmail: undefined, userId: 7 });
  });
});
