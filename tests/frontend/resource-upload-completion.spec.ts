jest.mock('../../frontend/src/lib/api/v1/transport', () => ({ requestV1: jest.fn(), fetchV1: jest.fn() }));
import { fetchV1 } from '../../frontend/src/lib/api/v1/transport';
import { waitForResourceUploadCompletion } from '../../frontend/src/lib/api/v1/resource-direct-upload';

describe('resource upload completion polling', () => {
  beforeEach(() => { jest.useFakeTimers(); jest.clearAllMocks(); });
  afterEach(() => jest.useRealTimers());

  it('keeps waiting past the CDN timeout without another completion POST', async () => {
    const processing = { completed: false as const, session_id: 'session-1', status: 'processing' as const, poll_after_ms: 3000 };
    const done = { completed: true as const, file_public_id: 'file-1' };
    (fetchV1 as jest.Mock).mockResolvedValue(processing).mockResolvedValueOnce(processing);
    const promise = waitForResourceUploadCompletion('session-1', processing);
    await jest.advanceTimersByTimeAsync(180000);
    (fetchV1 as jest.Mock).mockResolvedValueOnce(done);
    await jest.advanceTimersByTimeAsync(3000);
    await expect(promise).resolves.toEqual(done);
    expect(fetchV1).toHaveBeenCalledWith('/resources/uploads/session-1/status', { init: { cache: 'no-store' } });
  });

  it('returns immediate completion without polling', async () => {
    await expect(waitForResourceUploadCompletion('s', { completed: true, file_public_id: 'f' })).resolves.toMatchObject({ file_public_id: 'f' });
    expect(fetchV1).not.toHaveBeenCalled();
  });

  it('surfaces a server validation failure instead of reporting success', async () => {
    (fetchV1 as jest.Mock).mockRejectedValue(new Error('JAR 无效'));
    const promise = waitForResourceUploadCompletion('s', { completed: false, session_id: 's', status: 'processing', poll_after_ms: 3000 });
    const assertion = expect(promise).rejects.toThrow('JAR 无效');
    await jest.advanceTimersByTimeAsync(3000);
    await assertion;
  });
});
