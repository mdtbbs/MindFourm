const decorator = () => () => undefined;

jest.mock('@nestjs/typeorm', () => ({
  InjectRepository: () => () => undefined,
}));

jest.mock('typeorm', () => ({
  Repository: class Repository {},
  Entity: decorator,
  PrimaryGeneratedColumn: decorator,
  PrimaryColumn: decorator,
  Column: decorator,
  ManyToOne: decorator,
  OneToMany: decorator,
  ManyToMany: decorator,
  OneToOne: decorator,
  JoinColumn: decorator,
  JoinTable: decorator,
  CreateDateColumn: decorator,
  UpdateDateColumn: decorator,
  DeleteDateColumn: decorator,
  Index: decorator,
  Unique: decorator,
}));

import { EmailQueueService } from './email-queue.service';
import { EmailTransportUnavailableError } from './email.service';

describe('EmailQueueService', () => {
  function createService() {
    const emailService = {
      sendMail: jest.fn(),
    };
    const emailLogRepository = {
      update: jest.fn().mockResolvedValue(undefined),
    };
    const redisService = {
      getConnectionConfig: jest.fn().mockReturnValue({ host: 'localhost', port: 6379 }),
    };

    const service = new EmailQueueService(
      emailService as any,
      emailLogRepository as any,
      redisService as any,
    );

    return {
      service,
      emailService,
      emailLogRepository,
    };
  }

  it('marks queued email logs as sent after successful delivery', async () => {
    const { service, emailService, emailLogRepository } = createService();

    await service.processEmailJob({
      to: 'user@example.com',
      subject: 'Test subject',
      html: '<p>Hello</p>',
      logId: 12,
    });

    expect(emailService.sendMail).toHaveBeenCalledWith({
      to: 'user@example.com',
      subject: 'Test subject',
      html: '<p>Hello</p>',
      text: undefined,
    });
    expect(emailLogRepository.update).toHaveBeenCalledWith(12, {
      status: 'sent',
      error_message: null,
    });
  });

  it('marks queued email logs as failed when SMTP is unavailable', async () => {
    const { service, emailService, emailLogRepository } = createService();
    emailService.sendMail.mockRejectedValue(new EmailTransportUnavailableError('SMTP unavailable'));

    await expect(service.processEmailJob({
      to: 'user@example.com',
      subject: 'Broken',
      html: '<p>Body</p>',
      logId: 18,
    })).resolves.toBeUndefined();

    expect(emailLogRepository.update).toHaveBeenCalledWith(18, {
      status: 'failed',
      error_message: 'SMTP unavailable',
    });
  });

  it('rethrows unexpected delivery errors after persisting failed status', async () => {
    const { service, emailService, emailLogRepository } = createService();
    emailService.sendMail.mockRejectedValue(new Error('ECONNRESET while sending'));

    await expect(service.processEmailJob({
      to: 'user@example.com',
      subject: 'Broken',
      html: '<p>Body</p>',
      logId: 22,
    })).rejects.toThrow('ECONNRESET while sending');

    expect(emailLogRepository.update).toHaveBeenCalledWith(22, {
      status: 'failed',
      error_message: 'ECONNRESET while sending',
    });
  });

  it('truncates long error messages before persisting them', async () => {
    const { service } = createService();
    const longError = 'x'.repeat(1205);

    const truncated = (service as any).truncateErrorMessage(longError);

    expect(truncated).toHaveLength(1000);
    expect(truncated.endsWith('...')).toBe(true);
  });
});
