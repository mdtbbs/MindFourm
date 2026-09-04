import 'reflect-metadata';
import { API_V1_CONTRACT } from '@common/decorators/api-v1.decorator';
import { ReportsV1Controller } from './reports-v1.controller';

describe('ReportsV1Controller', () => {
  it('forwards a report only for the authenticated reporter', async () => {
    const reports = { create: jest.fn().mockResolvedValue({ id: 12 }) };
    const controller = new ReportsV1Controller(reports as any);
    const dto = { target_type: 'post', target_id: 5, reason: 'spam' } as any;

    await expect(controller.create(dto, { user: { id: 7 } })).resolves.toEqual({ id: 12 });
    expect(reports.create).toHaveBeenCalledWith(7, dto);
    expect(Reflect.getMetadata(API_V1_CONTRACT, ReportsV1Controller)).toBe(true);
  });

  it('normalizes report pagination to the V1 snake_case contract', async () => {
    const reports = { getMyReports: jest.fn().mockResolvedValue({ data: [{ id: 12 }], pagination: { page: 2, limit: 20, total: 21, totalPages: 2 } }) };
    const controller = new ReportsV1Controller(reports as any);

    await expect(controller.mine({ user: { id: 7 } }, '2', '20')).resolves.toEqual({
      data: [{ id: 12 }], pagination: { page: 2, limit: 20, total: 21, total_pages: 2 },
    });
  });
});
