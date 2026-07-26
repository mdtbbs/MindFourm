const decorator = () => () => undefined;

jest.mock('@nestjs/typeorm', () => ({
  InjectRepository: () => () => undefined,
}));

jest.mock('typeorm', () => ({
  Repository: class Repository {},
  IsNull: jest.fn(() => ({ _type: 'isNull' })),
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

// `report.entity` itself is loaded for real — the reason/status vocabularies live
// there and a stubbed copy would let the test drift away from the column definitions.
jest.mock('@entities/user.entity', () => ({ User: class User {} }));
jest.mock('@entities/post.entity', () => ({ Post: class Post {} }));
jest.mock('@entities/reply.entity', () => ({ Reply: class Reply {} }));
jest.mock('@entities/resource.entity', () => ({ Resource: class Resource {} }));

// Kept out of the unit test entirely: the real services reach for Redis and the
// settings table at import time.
jest.mock('../settings/settings.service', () => ({ SettingsService: class SettingsService {} }));
jest.mock('../admin-notifications/admin-notifications.service', () => ({
  AdminNotificationsService: class AdminNotificationsService {},
}));

import { BadRequestException, ConflictException, Logger, NotFoundException } from '@nestjs/common';
import type { Repository } from 'typeorm';
import type { Report } from '@entities/report.entity';
import type { Post } from '@entities/post.entity';
import type { Reply } from '@entities/reply.entity';
import type { Resource } from '@entities/resource.entity';
import type { User } from '@entities/user.entity';
import type { SettingsService } from '../settings/settings.service';
import type { AdminNotificationsService } from '../admin-notifications/admin-notifications.service';
import { ReportsService } from './reports.service';
import { CreateReportDto } from './dto/create-report.dto';

type RepositoryMock = Record<string, jest.Mock>;

interface Overrides {
  reportRepository?: RepositoryMock;
  postRepository?: RepositoryMock;
  replyRepository?: RepositoryMock;
  resourceRepository?: RepositoryMock;
  userRepository?: RepositoryMock;
  settingsService?: RepositoryMock;
  adminNotificationsService?: RepositoryMock;
}

function createService(overrides: Overrides = {}) {
  const reportRepository: RepositoryMock = {
    findOne: jest.fn().mockResolvedValue(null),
    findAndCount: jest.fn().mockResolvedValue([[], 0]),
    count: jest.fn().mockResolvedValue(0),
    create: jest.fn().mockImplementation((value: unknown) => value),
    save: jest.fn().mockImplementation(async (value: unknown) => ({
      id: 7,
      ...(value as Record<string, unknown>),
    })),
    ...overrides.reportRepository,
  };
  const postRepository: RepositoryMock = {
    findOne: jest.fn().mockResolvedValue(null),
    update: jest.fn().mockResolvedValue(undefined),
    ...overrides.postRepository,
  };
  const replyRepository: RepositoryMock = {
    findOne: jest.fn().mockResolvedValue(null),
    update: jest.fn().mockResolvedValue(undefined),
    ...overrides.replyRepository,
  };
  const resourceRepository: RepositoryMock = {
    findOne: jest.fn().mockResolvedValue(null),
    update: jest.fn().mockResolvedValue(undefined),
    ...overrides.resourceRepository,
  };
  const userRepository: RepositoryMock = {
    findOne: jest.fn().mockResolvedValue(null),
    ...overrides.userRepository,
  };
  const settingsService: RepositoryMock = {
    getNumber: jest.fn().mockResolvedValue(null),
    ...overrides.settingsService,
  };
  const adminNotificationsService: RepositoryMock = {
    publish: jest.fn().mockResolvedValue([]),
    ...overrides.adminNotificationsService,
  };

  const service = new ReportsService(
    reportRepository as unknown as Repository<Report>,
    postRepository as unknown as Repository<Post>,
    replyRepository as unknown as Repository<Reply>,
    resourceRepository as unknown as Repository<Resource>,
    userRepository as unknown as Repository<User>,
    settingsService as unknown as SettingsService,
    adminNotificationsService as unknown as AdminNotificationsService,
  );

  return {
    service,
    reportRepository,
    postRepository,
    replyRepository,
    resourceRepository,
    userRepository,
    settingsService,
    adminNotificationsService,
  };
}

function postReportDto(overrides: Partial<CreateReportDto> = {}): CreateReportDto {
  return {
    target_type: 'post',
    target_id: 42,
    reason: 'spam',
    ...overrides,
  };
}

describe('ReportsService.create', () => {
  it('rejects a report against a post that does not exist or was soft-deleted', async () => {
    const { service, postRepository, reportRepository } = createService();

    await expect(service.create(1, postReportDto())).rejects.toBeInstanceOf(NotFoundException);
    // Soft-deleted rows are excluded by the lookup itself, so no row is ever written
    // for content nobody can see.
    expect(postRepository.findOne).toHaveBeenCalled();
    expect(reportRepository.save).not.toHaveBeenCalled();
  });

  it('rejects a report against a reply that does not exist', async () => {
    const { service } = createService();

    await expect(
      service.create(1, postReportDto({ target_type: 'reply', target_id: 9 })),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('refuses to let a user report their own post', async () => {
    const { service, reportRepository, postRepository } = createService({
      postRepository: {
        findOne: jest.fn().mockResolvedValue({ id: 42, user_id: 1, status: 'published' }),
        update: jest.fn(),
      },
    });

    await expect(service.create(1, postReportDto())).rejects.toBeInstanceOf(BadRequestException);
    expect(reportRepository.save).not.toHaveBeenCalled();
    expect(postRepository.update).not.toHaveBeenCalled();
  });

  it('refuses to let a user report their own account', async () => {
    const { service } = createService({
      userRepository: { findOne: jest.fn().mockResolvedValue({ id: 5 }) },
    });

    await expect(
      service.create(5, postReportDto({ target_type: 'user', target_id: 5 })),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a second report from the same user while the first is still pending', async () => {
    const { service, reportRepository } = createService({
      postRepository: {
        findOne: jest.fn().mockResolvedValue({ id: 42, user_id: 2, status: 'published' }),
        update: jest.fn(),
      },
      reportRepository: {
        findOne: jest.fn().mockResolvedValue({ id: 3, status: 'pending' }),
      },
    });

    await expect(service.create(1, postReportDto())).rejects.toBeInstanceOf(ConflictException);
    expect(reportRepository.save).not.toHaveBeenCalled();
  });

  it('accepts a new report once the reporter\'s earlier one has been handled', async () => {
    // The duplicate check filters on status = pending, so a resolved report must not
    // block a repeat offence from being reported again.
    const { service, reportRepository } = createService({
      postRepository: {
        findOne: jest.fn().mockResolvedValue({ id: 42, user_id: 2, status: 'published' }),
        update: jest.fn(),
      },
    });

    const report = await service.create(1, postReportDto());

    expect(reportRepository.findOne).toHaveBeenCalledWith({
      where: {
        reporter_id: 1,
        target_type: 'post',
        target_id: 42,
        status: 'pending',
      },
    });
    expect(report).toMatchObject({ id: 7, reporter_id: 1, target_id: 42, status: 'pending' });
  });

  it('sends a post back for review and notifies moderators when pending reports reach the threshold', async () => {
    const { service, postRepository, adminNotificationsService, settingsService } = createService({
      postRepository: {
        findOne: jest.fn().mockResolvedValue({ id: 42, user_id: 2, status: 'published' }),
        update: jest.fn().mockResolvedValue(undefined),
      },
      reportRepository: { count: jest.fn().mockResolvedValue(3) },
      settingsService: { getNumber: jest.fn().mockResolvedValue(3) },
    });

    await service.create(1, postReportDto());

    expect(settingsService.getNumber).toHaveBeenCalledWith('report_auto_hide_threshold');
    expect(postRepository.update).toHaveBeenCalledWith({ id: 42 }, { status: 'pending' });
    expect(adminNotificationsService.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        event_key: 'report.threshold.post',
        category: 'moderation',
        metadata: expect.objectContaining({ target_id: 42, pending_count: 3, auto_hidden: true }),
      }),
    );
  });

  it('leaves the target published while pending reports are below the threshold', async () => {
    const { service, postRepository, adminNotificationsService } = createService({
      postRepository: {
        findOne: jest.fn().mockResolvedValue({ id: 42, user_id: 2, status: 'published' }),
        update: jest.fn(),
      },
      reportRepository: { count: jest.fn().mockResolvedValue(2) },
      settingsService: { getNumber: jest.fn().mockResolvedValue(5) },
    });

    await service.create(1, postReportDto());

    expect(postRepository.update).not.toHaveBeenCalled();
    expect(adminNotificationsService.publish).not.toHaveBeenCalled();
  });

  it('treats a threshold of 0 as auto-hiding disabled, however many reports pile up', async () => {
    const { service, postRepository, adminNotificationsService } = createService({
      postRepository: {
        findOne: jest.fn().mockResolvedValue({ id: 42, user_id: 2, status: 'published' }),
        update: jest.fn(),
      },
      reportRepository: { count: jest.fn().mockResolvedValue(99) },
      settingsService: { getNumber: jest.fn().mockResolvedValue(0) },
    });

    await service.create(1, postReportDto());

    expect(postRepository.update).not.toHaveBeenCalled();
    expect(adminNotificationsService.publish).not.toHaveBeenCalled();
  });

  it('falls back to a threshold of 5 when the setting is missing', async () => {
    const { service, postRepository } = createService({
      postRepository: {
        findOne: jest.fn().mockResolvedValue({ id: 42, user_id: 2, status: 'published' }),
        update: jest.fn().mockResolvedValue(undefined),
      },
      reportRepository: { count: jest.fn().mockResolvedValue(5) },
      settingsService: { getNumber: jest.fn().mockResolvedValue(null) },
    });

    await service.create(1, postReportDto());

    expect(postRepository.update).toHaveBeenCalledWith({ id: 42 }, { status: 'pending' });
  });

  it('notifies moderators about a reported user without trying to hide the account', async () => {
    const { service, adminNotificationsService } = createService({
      userRepository: { findOne: jest.fn().mockResolvedValue({ id: 8 }) },
      reportRepository: { count: jest.fn().mockResolvedValue(3) },
      settingsService: { getNumber: jest.fn().mockResolvedValue(3) },
    });

    await service.create(1, postReportDto({ target_type: 'user', target_id: 8 }));

    expect(adminNotificationsService.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        event_key: 'report.threshold.user',
        metadata: expect.objectContaining({ auto_hidden: false }),
      }),
    );
  });

  it('still stores the report when escalation fails', async () => {
    // The row is committed before the threshold is evaluated; failing the request
    // afterwards would tell the reporter their submission was rejected.
    const loggerError = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const { service, reportRepository } = createService({
      postRepository: {
        findOne: jest.fn().mockResolvedValue({ id: 42, user_id: 2, status: 'published' }),
        update: jest.fn().mockRejectedValue(new Error('deadlock')),
      },
      reportRepository: { count: jest.fn().mockResolvedValue(5) },
      settingsService: { getNumber: jest.fn().mockResolvedValue(5) },
    });

    await expect(service.create(1, postReportDto())).resolves.toMatchObject({ id: 7 });
    expect(reportRepository.save).toHaveBeenCalled();
    expect(loggerError).toHaveBeenCalled();
    loggerError.mockRestore();
  });
});

describe('ReportsService.resolve', () => {
  it('records the handler, timestamp and note on a pending report', async () => {
    const stored = { id: 3, status: 'pending', handled_by: null, handled_at: null, resolution_note: null };
    const { service, reportRepository } = createService({
      reportRepository: {
        findOne: jest.fn().mockResolvedValue(stored),
        save: jest.fn().mockImplementation(async (value: unknown) => value),
      },
    });

    const resolved = await service.resolve(3, 11, { status: 'resolved', resolution_note: '已删除' });

    expect(resolved).toMatchObject({ status: 'resolved', handled_by: 11, resolution_note: '已删除' });
    expect(resolved.handled_at).toBeInstanceOf(Date);
    expect(reportRepository.save).toHaveBeenCalled();
  });

  it('rejects a second decision on a report another moderator already handled', async () => {
    const { service, reportRepository } = createService({
      reportRepository: {
        findOne: jest.fn().mockResolvedValue({ id: 3, status: 'dismissed' }),
      },
    });

    await expect(service.resolve(3, 11, { status: 'resolved' })).rejects.toBeInstanceOf(ConflictException);
    expect(reportRepository.save).not.toHaveBeenCalled();
  });

  it('rejects a decision on a report id that does not exist', async () => {
    const { service } = createService();

    await expect(service.resolve(404, 11, { status: 'dismissed' })).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('ReportsService.listForAdmin', () => {
  it('rounds totalPages up so the partially filled last page is reachable', async () => {
    const { service } = createService({
      reportRepository: { findAndCount: jest.fn().mockResolvedValue([[], 23]) },
    });

    const result = await service.listForAdmin({ page: 2, limit: 10 });

    expect(result.pagination).toEqual({ page: 2, limit: 10, total: 23, totalPages: 3 });
  });

  it('returns all four pagination fields when there are no reports at all', async () => {
    // The web client's normalizer treats a pagination object missing any field as
    // "no data", so an empty queue still has to carry the full shape.
    const { service } = createService();

    const result = await service.listForAdmin({ page: 1, limit: 20 });

    expect(Object.keys(result.pagination).sort()).toEqual(['limit', 'page', 'total', 'totalPages']);
    expect(result.pagination.totalPages).toBe(1);
  });

  it('passes only the filters that were supplied down to the query', async () => {
    const findAndCount = jest.fn().mockResolvedValue([[], 0]);
    const { service } = createService({ reportRepository: { findAndCount } });

    await service.listForAdmin({ status: 'pending', page: 1, limit: 20 });

    expect(findAndCount).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: 'pending' } }),
    );
  });

  it('strips private reporter fields from queue rows', async () => {
    const { service } = createService({
      reportRepository: {
        findAndCount: jest.fn().mockResolvedValue([
          [{
            id: 1,
            target_type: 'post',
            reporter: { id: 2, username: 'alice', email: 'alice@example.com' },
            handler: null,
          }],
          1,
        ]),
      },
    });

    const result = await service.listForAdmin({ page: 1, limit: 20 });

    expect(result.data[0].reporter).toEqual({ id: 2, username: 'alice' });
    expect(result.data[0].handler).toBeNull();
  });
});

describe('ReportsService.getMyReports', () => {
  it('exposes the outcome to the reporter without revealing which moderator ruled', async () => {
    const handledAt = new Date('2026-07-01T00:00:00Z');
    const { service } = createService({
      reportRepository: {
        findAndCount: jest.fn().mockResolvedValue([
          [{
            id: 1,
            target_type: 'post',
            target_id: 42,
            reason: 'spam',
            detail: null,
            status: 'resolved',
            resolution_note: '已处理',
            created_at: handledAt,
            handled_at: handledAt,
            handled_by: 11,
          }],
          1,
        ]),
      },
    });

    const result = await service.getMyReports(1, 1, 20);

    expect(result.data[0]).toEqual({
      id: 1,
      target_type: 'post',
      target_id: 42,
      reason: 'spam',
      detail: null,
      status: 'resolved',
      resolution_note: '已处理',
      created_at: handledAt,
      handled_at: handledAt,
    });
    expect(result.pagination).toEqual({ page: 1, limit: 20, total: 1, totalPages: 1 });
  });
});

describe('ReportsService.countPendingForTarget', () => {
  it('counts only reports still awaiting a decision', async () => {
    const count = jest.fn().mockResolvedValue(4);
    const { service } = createService({ reportRepository: { count } });

    await expect(service.countPendingForTarget('resource', 12)).resolves.toBe(4);
    expect(count).toHaveBeenCalledWith({
      where: { target_type: 'resource', target_id: 12, status: 'pending' },
    });
  });
});
