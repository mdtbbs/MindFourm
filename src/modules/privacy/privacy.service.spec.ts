import { PrivacyService } from './privacy.service';

describe('PrivacyService cloud save deletion integration', () => {
  function makeService() {
    const request: any = { id: 12, user_id: 37, status: 'pending', request_reason: null, resolution: null, reviewed_by: null, reviewed_at: null, legal_hold_until: null };
    const requests = { findOne: jest.fn().mockResolvedValue(request), save: jest.fn(async (value) => value) };
    const gameSaves = { markUserDataDeleted: jest.fn().mockResolvedValue({ slots: 1, snapshots: 2, uploads: 0 }) };
    const blobs = { markUserDataDeleted: jest.fn().mockResolvedValue({ records: 1, objects: 1, uploads: 0 }) };
    const logs = { log: jest.fn().mockResolvedValue(undefined) };
    const service = new PrivacyService(requests as any, {} as any, logs as any, gameSaves as any, blobs as any);
    return { service, requests, gameSaves, blobs, logs };
  }

  it('tombstones cloud saves before completing a deletion request', async () => {
    const { service, requests, gameSaves } = makeService();
    const result = await service.reviewRequest(12, 9, { status: 'completed' }, {});

    expect(gameSaves.markUserDataDeleted).toHaveBeenCalledWith(37);
    expect(gameSaves.markUserDataDeleted.mock.invocationCallOrder[0]).toBeLessThan(requests.save.mock.invocationCallOrder[0]);
    expect(result.status).toBe('completed');
  });

  it('does not remove cloud saves when a deletion request is rejected', async () => {
    const { service, gameSaves, blobs } = makeService();
    await service.reviewRequest(12, 9, { status: 'rejected' }, {});
    expect(gameSaves.markUserDataDeleted).not.toHaveBeenCalled();
    expect(blobs.markUserDataDeleted).not.toHaveBeenCalled();
  });

  it('also erases generic blobs, so a completed request leaves no owner data behind', async () => {
    const { service, requests, gameSaves, blobs } = makeService();
    await service.reviewRequest(12, 9, { status: 'completed' }, {});

    expect(blobs.markUserDataDeleted).toHaveBeenCalledWith(37);
    // Both stores are cleared before the request is marked complete, so a failure
    // in either one leaves the request retryable instead of silently "done".
    expect(blobs.markUserDataDeleted.mock.invocationCallOrder[0]).toBeLessThan(requests.save.mock.invocationCallOrder[0]);
    expect(gameSaves.markUserDataDeleted).toHaveBeenCalledWith(37);
  });
});
