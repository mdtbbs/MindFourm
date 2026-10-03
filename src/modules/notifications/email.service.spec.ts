jest.mock('nodemailer', () => ({
  createTransport: jest.fn(),
}));
jest.mock('../settings/settings.service', () => ({ SettingsService: class SettingsService {} }));
jest.mock('./template.service', () => ({ TemplateService: class TemplateService {} }));

import * as nodemailer from 'nodemailer';
import { EmailService } from './email.service';

describe('EmailService SMTP configuration', () => {
  const createTransport = nodemailer.createTransport as jest.Mock;

  beforeEach(() => {
    createTransport.mockReset();
  });

  function transport(messageId = 'message-1') {
    return {
      verify: jest.fn().mockResolvedValue(true),
      sendMail: jest.fn().mockResolvedValue({ messageId }),
    };
  }

  it('uses STARTTLS semantics for port 587 even when a legacy secure=true value remains', async () => {
    const smtp = transport();
    createTransport.mockReturnValue(smtp);
    const settings = {
      getByCategory: jest.fn().mockResolvedValue({
        smtp_host: 'smtp.example.com',
        smtp_port: '587',
        smtp_secure: 'true',
        smtp_user: 'mailer',
        smtp_password: 'secret',
        smtp_from: 'MDTBBS <noreply@mdtbbs.cn>',
      }),
    };
    const service = new EmailService(settings as any, {} as any);

    await service.onModuleInit();

    expect(createTransport).toHaveBeenCalledWith(expect.objectContaining({
      host: 'smtp.example.com',
      port: 587,
      secure: false,
      requireTLS: true,
    }));
  });

  it('rebuilds the transporter when SMTP settings change without a process restart', async () => {
    const first = transport('first');
    const second = transport('second');
    createTransport.mockReturnValueOnce(first).mockReturnValueOnce(second);

    const settings = {
      getByCategory: jest.fn()
        .mockResolvedValueOnce({
          smtp_host: 'smtp-a.example.com', smtp_port: '587', smtp_secure: 'false',
          smtp_user: 'mailer', smtp_password: 'one', smtp_from: 'noreply@example.com',
        })
        .mockResolvedValueOnce({
          smtp_host: 'smtp-b.example.com', smtp_port: '465', smtp_secure: 'true',
          smtp_user: 'mailer', smtp_password: 'two', smtp_from: 'noreply@example.com',
        }),
    };
    const service = new EmailService(settings as any, {} as any);

    await service.onModuleInit();
    await expect(service.sendMail({
      to: 'user@example.com',
      subject: 'Test',
      html: '<p>Test</p>',
    })).resolves.toBe('second');

    expect(createTransport).toHaveBeenCalledTimes(2);
    expect(second.sendMail).toHaveBeenCalled();
  });

  it('supports an SMTP relay without authentication when only a host is configured', async () => {
    const smtp = transport();
    createTransport.mockReturnValue(smtp);
    const settings = {
      getByCategory: jest.fn().mockResolvedValue({
        smtp_host: 'relay.internal.example',
        smtp_port: '25',
        smtp_secure: 'false',
        smtp_from: 'noreply@example.com',
      }),
    };
    const service = new EmailService(settings as any, {} as any);

    await service.onModuleInit();

    expect(createTransport).toHaveBeenCalledWith(expect.objectContaining({
      host: 'relay.internal.example',
      port: 25,
      auth: undefined,
    }));
  });
});
