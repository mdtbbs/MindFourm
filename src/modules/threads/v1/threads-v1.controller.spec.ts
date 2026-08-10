import 'reflect-metadata';
import { HttpStatus } from '@nestjs/common';
import { API_V1_CONTRACT } from '../../../common/decorators/api-v1.decorator';
import { ThreadsV1Controller } from './threads-v1.controller';

describe('ThreadsV1Controller', () => {
  it('is marked as V1', () => {
    expect(Reflect.getMetadata(API_V1_CONTRACT, ThreadsV1Controller)).toBe(true);
  });

  it('throws THREAD_NOT_FOUND for missing thread', async () => {
    const adapter = { getThreadV1: jest.fn().mockResolvedValue(null) };
    const controller = new ThreadsV1Controller(adapter as any);
    try { await controller.getThread(999); } catch (e: any) {
      expect(e.getStatus()).toBe(HttpStatus.NOT_FOUND);
      expect(e.code).toBe('THREAD_NOT_FOUND');
    }
  });

  it('returns thread when found', async () => {
    const thread = { id: 1, title: 'Test', status: 'published' };
    const adapter = { getThreadV1: jest.fn().mockResolvedValue(thread) };
    const controller = new ThreadsV1Controller(adapter as any);
    const result = await controller.getThread(1);
    expect(result.id).toBe(1);
  });
});
