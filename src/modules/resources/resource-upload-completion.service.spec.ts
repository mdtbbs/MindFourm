import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { ResourceUploadCompletionService } from './resource-upload-completion.service';

describe('ResourceUploadCompletionService', () => {
  const sessionId = 'a0000000-0000-4000-8000-000000000001';
  function make() {
    const sessions = { findOne: jest.fn().mockResolvedValue({ id: sessionId, user_id: 3, expires_at: new Date(Date.now() + 60000) }) };
    const uploads = { complete: jest.fn() };
    const users = { findOne: jest.fn().mockResolvedValue({ id: 3, role: 'user' }) };
    const job = { data: { sessionId, objectPublicId: 'object-1', userId: 3 }, getState: jest.fn().mockResolvedValue('active'), returnvalue: null as any };
    const queue = { add: jest.fn(), getJob: jest.fn().mockResolvedValue(job), waitUntilReady: jest.fn().mockResolvedValue(undefined) };
    const service = new ResourceUploadCompletionService({} as any, uploads as any, sessions as any, users as any);
    (service as any).queue = queue;
    return { service, sessions, uploads, users, job, queue };
  }

  it('returns promptly without doing a binary read and deduplicates work by session', async () => {
    const { service, uploads, queue } = make();
    await expect(service.enqueue(sessionId, 'object-1', 3)).resolves.toMatchObject({ completed: false, status: 'processing' });
    expect(uploads.complete).not.toHaveBeenCalled();
    expect(queue.add).toHaveBeenCalledWith('complete', { sessionId, objectPublicId: 'object-1', userId: 3 }, { jobId: sessionId });
  });

  it('requires the session owner before accessing Redis', async () => {
    const { service, sessions, queue } = make(); sessions.findOne.mockResolvedValue(null);
    await expect(service.status(sessionId, 4)).rejects.toBeInstanceOf(NotFoundException);
    expect(sessions.findOne).toHaveBeenCalledWith({ where: { id: sessionId, user_id: 4 } });
    expect(queue.getJob).not.toHaveBeenCalled();
  });

  it('rejects expired sessions and a second object for the same queued session', async () => {
    const { service, sessions, job } = make();
    await expect(service.enqueue(sessionId, 'other-object', 3)).rejects.toBeInstanceOf(ConflictException);
    sessions.findOne.mockResolvedValue({ expires_at: new Date(0) });
    await expect(service.enqueue(sessionId, job.data.objectPublicId, 3)).rejects.toBeInstanceOf(ConflictException);
  });

  it('uses database completion even if Redis no longer retains the job', async () => {
    const { service, sessions, queue } = make();
    sessions.findOne.mockResolvedValue({ resource_file_public_id: 'file-1' });
    await expect(service.status(sessionId, 3)).resolves.toEqual({ completed: true, file_public_id: 'file-1' });
    expect(queue.getJob).not.toHaveBeenCalled();
  });

  it('reloads the user role before running the existing complete transaction', async () => {
    const { service, uploads, users, job } = make();
    uploads.complete.mockResolvedValue({ completed: true, file_public_id: 'file-1' });
    await expect(service.process(job.data)).resolves.toEqual({ result: { completed: true, file_public_id: 'file-1' } });
    expect(users.findOne).toHaveBeenCalledWith({ where: { id: 3 } });
    expect(uploads.complete).toHaveBeenCalledWith(sessionId, 'object-1', { id: 3, role: 'user' });
  });

  it('preserves public validation errors while suppressing internal exception details', async () => {
    const { service, uploads, job } = make();
    uploads.complete.mockRejectedValue(new BadRequestException({ code: 'INVALID_MOD_ARCHIVE', message: 'JAR 无效' }));
    job.returnvalue = await service.process(job.data); job.getState.mockResolvedValue('completed');
    await expect(service.status(sessionId, 3)).rejects.toMatchObject({ response: { code: 'INVALID_MOD_ARCHIVE', message: 'JAR 无效' }, status: 400 });
    uploads.complete.mockRejectedValue(new Error('secret internal address'));
    const result = await service.process(job.data);
    expect(JSON.stringify(result)).not.toContain('secret internal address');
    expect(result).toMatchObject({ error: { status: 503, response: { retryable: true } } });
  });

  it('fails closed when Redis is unavailable instead of starting untracked work', async () => {
    const { service, queue, uploads } = make(); queue.add.mockRejectedValue(new Error('Redis down'));
    await expect(service.enqueue(sessionId, 'object-1', 3)).rejects.toMatchObject({ status: 503 });
    expect(uploads.complete).not.toHaveBeenCalled();
  });

  it('bounds initial Redis readiness and never enqueues after the HTTP request has failed', async () => {
    jest.useFakeTimers();
    try {
      const { service, queue } = make();
      let ready!: () => void;
      queue.waitUntilReady.mockImplementation(() => new Promise<void>(resolve => { ready = resolve; }));
      const request = service.enqueue(sessionId, 'object-1', 3);
      const assertion = expect(request).rejects.toMatchObject({ status: 503 });
      await jest.advanceTimersByTimeAsync(5000);
      await assertion;
      ready(); await Promise.resolve();
      expect(queue.add).not.toHaveBeenCalled();
    } finally { jest.useRealTimers(); }
  });

  it('uses the stored session UUID to deduplicate case variants of the request ID', async () => {
    const { service, queue } = make();
    await service.enqueue(sessionId.toUpperCase(), 'object-1', 3);
    expect(queue.add).toHaveBeenCalledWith('complete', expect.objectContaining({ sessionId }), { jobId: sessionId });
  });
});
