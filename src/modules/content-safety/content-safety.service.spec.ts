import { ContentSafetyService } from './content-safety.service';

describe('ContentSafetyService', () => {
  const service = new ContentSafetyService(
    { get: jest.fn().mockResolvedValue(''), getNumber: jest.fn().mockResolvedValue(3) } as any,
    { log: jest.fn().mockResolvedValue(undefined) } as any,
  );

  it('forces review for built-in high-risk terms even when global moderation is disabled', async () => {
    await expect(service.assess('免费博彩推广')).resolves.toMatchObject({ mustReview: true, rules: ['keyword:博彩'] });
  });

  it('records only high-risk review decisions', async () => {
    const risk = await service.assess('木马下载');
    await service.recordFlag({ userId: 1, targetType: 'post', targetId: 2, risk, ipAddress: '2001:db8::1' });
    expect((service as any).logs.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'content_safety.flagged', ip_address: '2001:db8::1' }));
  });
});
