import { ServiceUnavailableException } from '@nestjs/common';
import { TimelapseReport } from '../../entities/timelapse-report.entity';
import { TimelapsesService } from './timelapses.service';
import {
  SHA_A, SHA_B, REPORT_ID, AUTHOR_ID, OTHER_USER_ID, ADMIN_ID, DAY_MS,
  battleReportAttrs, expectApiRejection, makeBattleReportDocument, makeReport,
  makeTimelapseDeps, makeTimelapsesService, useUploadManager,
} from './timelapse-test.helpers';

/** 用 mock 依赖直接 new 服务，避免 Nest 测试模块的启动开销。 */
function build() {
  const deps = makeTimelapseDeps();
  return { service: makeTimelapsesService(deps), deps };
}

function authorViewer() {
  return { id: AUTHOR_ID, role: 'user' };
}

function strangerViewer() {
  return { id: OTHER_USER_ID, role: 'user' };
}

describe('TimelapsesService 创建上传会话', () => {
  it('功能开关关闭时返回 TIMELAPSE_DISABLED', async () => {
    const { service, deps } = build();
    deps.settings.getBoolean.mockResolvedValue(false);

    await expectApiRejection(service.createUpload(AUTHOR_ID), 'TIMELAPSE_DISABLED', 403);
    expect(deps.dataSource.transaction).not.toHaveBeenCalled();
  });

  it('存储未配置时返回 TIMELAPSE_STORAGE_UNAVAILABLE', async () => {
    const { service, deps } = build();
    deps.storage.isConfigured.mockReturnValue(false);

    await expectApiRejection(service.createUpload(AUTHOR_ID), 'TIMELAPSE_STORAGE_UNAVAILABLE', 503);
  });

  it('未绑定草稿达到 20 个时拒绝', async () => {
    const { service, deps } = build();
    useUploadManager(deps, { unbound: 20 });

    const error = await expectApiRejection(service.createUpload(AUTHOR_ID), 'TIMELAPSE_DRAFT_LIMIT_EXCEEDED', 429);
    expect(error.details).toEqual([{ limit: 20 }]);
  });

  it('每小时第 4 次提交时按小时窗口限流', async () => {
    const { service, deps } = build();
    useUploadManager(deps, { hourly: 3 });

    const error = await expectApiRejection(service.createUpload(AUTHOR_ID), 'TIMELAPSE_RATE_LIMITED', 429);
    expect(error.details).toEqual([{ window: 'hour', limit: 3 }]);
  });

  it('每日第 11 次提交时按天窗口限流', async () => {
    const { service, deps } = build();
    useUploadManager(deps, { daily: 10 });

    const error = await expectApiRejection(service.createUpload(AUTHOR_ID), 'TIMELAPSE_RATE_LIMITED', 429);
    expect(error.details).toEqual([{ window: 'day', limit: 10 }]);
  });

  it('已有处理中的战报时并发额度为 1', async () => {
    const { service, deps } = build();
    useUploadManager(deps, { active: 1 });

    const error = await expectApiRejection(service.createUpload(AUTHOR_ID), 'TIMELAPSE_CONCURRENT_LIMIT', 429);
    expect(error.details).toEqual([{ limit: 1 }]);
  });

  it('账号不存在时返回 TIMELAPSE_AUTHOR_NOT_FOUND', async () => {
    const { service, deps } = build();
    useUploadManager(deps, { userExists: false });

    await expectApiRejection(service.createUpload(AUTHOR_ID), 'TIMELAPSE_AUTHOR_NOT_FOUND', 404);
  });

  it('额度通过后插入 uploading 行并返回上传地址与 30 天有效期', async () => {
    const { service, deps } = build();
    const manager = useUploadManager(deps);
    const before = Date.now();

    const result = await service.createUpload(AUTHOR_ID);

    expect(manager.insert).toHaveBeenCalledTimes(1);
    const [entity, values] = manager.insert.mock.calls[0] as [unknown, Record<string, any>];
    expect(entity).toBe(TimelapseReport);
    expect(values.author_user_id).toBe(AUTHOR_ID);
    expect(values.status).toBe('uploading');
    expect(values.visibility).toBe('public');
    expect(values.bound_post_count).toBe(0);
    expect(values.public_id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    expect(values.source_object_key).toBe(`source/${values.public_id}.zip`);
    const expiresAt = new Date(values.expires_at).getTime();
    expect(expiresAt - before).toBeGreaterThanOrEqual(30 * DAY_MS - 1000);
    expect(expiresAt - before).toBeLessThan(30 * DAY_MS + 60_000);

    expect(result.id).toBe(values.public_id);
    expect(result.upload_url).toBe(`/api/v1/timelapses/uploads/${values.public_id}/file`);
    expect(result.max_bytes).toBe(25 * 1024 * 1024);
    expect(new Date(result.expires_at).getTime()).toBe(expiresAt);
  });
});

describe('TimelapsesService 接收原始帧包', () => {
  it('非本人上传返回 TIMELAPSE_NOT_FOUND', async () => {
    const { service, deps } = build();
    deps.reports.findOne.mockResolvedValue(makeReport({ author_user_id: OTHER_USER_ID }));

    await expectApiRejection(
      service.receiveUpload(AUTHOR_ID, REPORT_ID, {} as any),
      'TIMELAPSE_NOT_FOUND',
      404,
    );
    expect(deps.storage.writeStream).not.toHaveBeenCalled();
  });

  it('已经 commit 的战报不能再覆盖原始帧包', async () => {
    const { service, deps } = build();
    deps.reports.findOne.mockResolvedValue(makeReport({ status: 'queued' }));

    await expectApiRejection(
      service.receiveUpload(AUTHOR_ID, REPORT_ID, {} as any),
      'TIMELAPSE_ALREADY_COMMITTED',
      409,
    );
  });

  it('上传会话超过 24 小时返回 TIMELAPSE_UPLOAD_EXPIRED', async () => {
    const { service, deps } = build();
    deps.reports.findOne.mockResolvedValue(makeReport({ created_at: new Date(Date.now() - 25 * 60 * 60 * 1000) }));

    await expectApiRejection(
      service.receiveUpload(AUTHOR_ID, REPORT_ID, {} as any),
      'TIMELAPSE_UPLOAD_EXPIRED',
      410,
    );
  });

  it('超过 25MB 时把存储错误映射为 413 TIMELAPSE_FILE_TOO_LARGE', async () => {
    const { service, deps } = build();
    deps.reports.findOne.mockResolvedValue(makeReport());
    deps.storage.writeStream.mockRejectedValue(Object.assign(new Error('too large'), { code: 'TIMELAPSE_FILE_TOO_LARGE' }));

    await expectApiRejection(
      service.receiveUpload(AUTHOR_ID, REPORT_ID, {} as any),
      'TIMELAPSE_FILE_TOO_LARGE',
      413,
    );
    expect(deps.reports.update).not.toHaveBeenCalled();
  });

  it('存储不可用时映射为 503 TIMELAPSE_STORAGE_UNAVAILABLE', async () => {
    const { service, deps } = build();
    deps.reports.findOne.mockResolvedValue(makeReport());
    deps.storage.writeStream.mockRejectedValue(Object.assign(new Error('storage down'), { code: 'TIMELAPSE_STORAGE_UNAVAILABLE' }));

    await expectApiRejection(
      service.receiveUpload(AUTHOR_ID, REPORT_ID, {} as any),
      'TIMELAPSE_STORAGE_UNAVAILABLE',
      503,
    );
  });

  it('成功后写回 source_sha256 与 source_size_bytes', async () => {
    const { service, deps } = build();
    deps.reports.findOne.mockResolvedValue(makeReport());
    deps.storage.writeStream.mockResolvedValue({ size: 1234, sha256: SHA_B });

    const result = await service.receiveUpload(AUTHOR_ID, REPORT_ID, {} as any);

    expect(deps.storage.writeStream).toHaveBeenCalledWith(
      `source/${REPORT_ID}.zip`,
      expect.anything(),
      { maxBytes: 25 * 1024 * 1024 },
    );
    expect(deps.reports.update).toHaveBeenCalledWith(
      { id: '1' },
      expect.objectContaining({
        source_object_key: `source/${REPORT_ID}.zip`,
        source_sha256: SHA_B,
        source_size_bytes: '1234',
      }),
    );
    expect(result).toEqual({
      id: REPORT_ID,
      uploaded: true,
      size_bytes: 1234,
      sha256: SHA_B,
      max_bytes: 25 * 1024 * 1024,
    });
  });
});

describe('TimelapsesService 提交渲染', () => {
  it('缺少源文件或 SHA 时返回 TIMELAPSE_UPLOAD_INCOMPLETE', async () => {
    const { service, deps } = build();
    deps.reports.findOne.mockResolvedValue(makeReport({ source_object_key: null }));

    await expectApiRejection(service.commit(AUTHOR_ID, REPORT_ID, {}), 'TIMELAPSE_UPLOAD_INCOMPLETE', 409);
    expect(deps.queue.enqueue).not.toHaveBeenCalled();
  });

  it('源对象尚未完整写入时返回 TIMELAPSE_UPLOAD_INCOMPLETE', async () => {
    const { service, deps } = build();
    deps.reports.findOne.mockResolvedValue(makeReport());
    deps.storage.statObject.mockResolvedValue({ exists: false });

    await expectApiRejection(service.commit(AUTHOR_ID, REPORT_ID, {}), 'TIMELAPSE_UPLOAD_INCOMPLETE', 409);
  });

  it('文件头不是 PK\\x03\\x04 时返回 TIMELAPSE_INVALID_ARCHIVE', async () => {
    const { service, deps } = build();
    deps.reports.findOne.mockResolvedValue(makeReport());
    deps.storage.readPrefix.mockResolvedValue(Buffer.from('RAR!'));

    await expectApiRejection(service.commit(AUTHOR_ID, REPORT_ID, {}), 'TIMELAPSE_INVALID_ARCHIVE', 400);
    expect(deps.queue.enqueue).not.toHaveBeenCalled();
  });

  it('客户端 SHA 与已上传文件不一致时返回 TIMELAPSE_CHECKSUM_MISMATCH', async () => {
    const { service, deps } = build();
    deps.reports.findOne.mockResolvedValue(makeReport());

    await expectApiRejection(service.commit(AUTHOR_ID, REPORT_ID, { sha256: SHA_B }), 'TIMELAPSE_CHECKSUM_MISMATCH', 409);
    expect(deps.storage.statObject).not.toHaveBeenCalled();
  });

  it('校验通过后置为 queued 并入队', async () => {
    const { service, deps } = build();
    deps.reports.findOne.mockResolvedValue(makeReport());

    const result = await service.commit(AUTHOR_ID, REPORT_ID, { sha256: SHA_A });

    expect(deps.reports.update).toHaveBeenCalledWith(
      { id: '1', status: 'uploading' },
      expect.objectContaining({ status: 'queued' }),
    );
    expect(deps.queue.enqueue).toHaveBeenCalledWith({
      timelapseId: REPORT_ID,
      authorUserId: AUTHOR_ID,
      sourceSha256: SHA_A,
      sourceSizeBytes: 10,
    });
    expect(result).toEqual({ id: REPORT_ID, status: 'queued' });
  });

  it('已经进入队列的提交是幂等的', async () => {
    const { service, deps } = build();
    deps.reports.findOne.mockResolvedValue(makeReport({ status: 'processing' }));

    await expect(service.commit(AUTHOR_ID, REPORT_ID, {})).resolves.toEqual({
      id: REPORT_ID,
      status: 'processing',
      idempotent: true,
    });
    expect(deps.queue.enqueue).not.toHaveBeenCalled();
  });

  it('入队失败时回滚为 uploading 并抛出 503 TIMELAPSE_QUEUE_UNAVAILABLE', async () => {
    const { service, deps } = build();
    deps.reports.findOne.mockResolvedValue(makeReport());
    deps.queue.enqueue.mockRejectedValue(new ServiceUnavailableException({
      code: 'TIMELAPSE_QUEUE_UNAVAILABLE',
      message: '渲染队列暂时不可用，请稍后重试。',
      retryable: true,
    }));

    const error: any = await service.commit(AUTHOR_ID, REPORT_ID, {}).then(() => null, (reason) => reason);

    expect(error).toBeTruthy();
    expect(error.getStatus()).toBe(503);
    expect(error.getResponse()).toMatchObject({ code: 'TIMELAPSE_QUEUE_UNAVAILABLE', retryable: true });
    // 第一次是 uploading → queued，第二次是失败后的 queued → uploading 回滚。
    expect(deps.reports.update).toHaveBeenCalledTimes(2);
    expect(deps.reports.update.mock.calls[0][0]).toEqual({ id: '1', status: 'uploading' });
    expect(deps.reports.update.mock.calls[1][0]).toEqual({ id: '1', status: 'queued' });
    expect(deps.reports.update.mock.calls[1][1]).toEqual(expect.objectContaining({ status: 'uploading' }));
  });
});

describe('TimelapsesService 战报可见性', () => {
  it('已发布的公开战报对匿名可读，并返回视频与封面地址', async () => {
    const { service, deps } = build();
    deps.reports.findOne.mockResolvedValue(makeReport({
      status: 'published',
      video_object_key: `video/${REPORT_ID}.mp4`,
      poster_object_key: `poster/${REPORT_ID}.webp`,
      reviewed_at: new Date('2026-01-02T03:04:05.000Z'),
      summary_metrics_json: [{ t: 0, wave: 10 }] as any,
    }));
    deps.users.findOne.mockResolvedValue({ id: AUTHOR_ID, username: 'alice', avatar_url: '/a.png' });

    const result = await service.getReport(REPORT_ID, null);

    expect(result.status).toBe('published');
    expect(result.author).toEqual({ id: AUTHOR_ID, username: 'alice', avatar_url: '/a.png' });
    expect(result.video_url).toBe(`/api/v1/timelapses/${REPORT_ID}/video`);
    expect(result.poster_url).toBe(`/api/v1/timelapses/${REPORT_ID}/poster`);
    expect(result.metrics).toHaveLength(1);
    expect(result.published_at).toBe('2026-01-02T03:04:05.000Z');
  });

  it('待审核战报对非作者返回 404', async () => {
    const { service, deps } = build();
    deps.reports.findOne.mockResolvedValue(makeReport({
      status: 'pending_review',
      video_object_key: `video/${REPORT_ID}.mp4`,
    }));

    await expectApiRejection(service.getReport(REPORT_ID, strangerViewer()), 'TIMELAPSE_NOT_FOUND', 404);
  });

  it('待审核战报的作者可读，并拿到自己的视频地址', async () => {
    const { service, deps } = build();
    deps.reports.findOne.mockResolvedValue(makeReport({
      status: 'pending_review',
      video_object_key: `video/${REPORT_ID}.mp4`,
      review_reason: '内部说明',
    }));
    deps.users.findOne.mockResolvedValue({ id: AUTHOR_ID, username: 'alice', avatar_url: null });

    const result = await service.getReport(REPORT_ID, authorViewer());

    expect(result.status).toBe('pending_review');
    expect(result.video_url).toBe(`/api/v1/timelapses/${REPORT_ID}/video`);
    expect(result.review_reason).toBe('内部说明');
  });

  it('private 战报对非作者返回 404', async () => {
    const { service, deps } = build();
    deps.reports.findOne.mockResolvedValue(makeReport({ status: 'published', visibility: 'private' }));

    await expectApiRejection(service.getReport(REPORT_ID, strangerViewer()), 'TIMELAPSE_NOT_FOUND', 404);
  });

  it('private 战报的作者可读', async () => {
    const { service, deps } = build();
    deps.reports.findOne.mockResolvedValue(makeReport({ status: 'published', visibility: 'private' }));

    await expect(service.getReport(REPORT_ID, authorViewer())).resolves.toMatchObject({ visibility: 'private' });
  });

  it('非法 public_id 直接 404 且不查库', async () => {
    const { service, deps } = build();

    await expectApiRejection(service.getReport('../etc/passwd', null), 'TIMELAPSE_NOT_FOUND', 404);
    expect(deps.reports.findOne).not.toHaveBeenCalled();
  });

  it('已软删除的战报视为不存在', async () => {
    const { service, deps } = build();
    deps.reports.findOne.mockResolvedValue(null);

    await expectApiRejection(service.getReport(REPORT_ID, authorViewer()), 'TIMELAPSE_NOT_FOUND', 404);
  });
});

describe('TimelapsesService 审核', () => {
  it('非 pending_review 状态不可审核', async () => {
    const { service, deps } = build();
    deps.reports.findOne.mockResolvedValue(makeReport({ status: 'published' }));

    const error = await expectApiRejection(service.review(ADMIN_ID, REPORT_ID, 'approve', undefined), 'TIMELAPSE_NOT_REVIEWABLE', 409);
    expect(error.details).toEqual([{ status: 'published' }]);
  });

  it('驳回但没有原因时返回 400 TIMELAPSE_REVIEW_REASON_REQUIRED', async () => {
    const { service, deps } = build();
    deps.reports.findOne.mockResolvedValue(makeReport({ status: 'pending_review' }));

    await expectApiRejection(service.review(ADMIN_ID, REPORT_ID, 'reject', '   '), 'TIMELAPSE_REVIEW_REASON_REQUIRED', 400);
    expect(deps.reports.update).not.toHaveBeenCalled();
  });

  it('通过审核：更新字段、写审计并通知作者', async () => {
    const { service, deps } = build();
    deps.reports.findOne.mockResolvedValue(makeReport({ status: 'pending_review', map_name: 'Desert' }));

    const result = await service.review(ADMIN_ID, REPORT_ID, 'approve', undefined, {
      ipAddress: '10.0.0.1',
      userAgent: 'jest',
    });

    expect(deps.reports.update).toHaveBeenCalledWith(
      { id: '1' },
      expect.objectContaining({
        status: 'published',
        reviewed_by_user_id: ADMIN_ID,
        reviewed_at: expect.any(Date),
        review_reason: null,
      }),
    );
    const logCall = deps.logs.log.mock.calls[0][0];
    expect(logCall).toMatchObject({
      user_id: ADMIN_ID,
      action: 'timelapse.review.approve',
      target_type: 'timelapse',
      target_id: 1,
      ip_address: '10.0.0.1',
      user_agent: 'jest',
    });
    expect(JSON.parse(logCall.details)).toEqual({ public_id: REPORT_ID, decision: 'approve', reason: null });
    expect(deps.notifications.create).toHaveBeenCalledWith(expect.objectContaining({
      user_id: AUTHOR_ID,
      type: 'timelapse',
      content: expect.stringContaining('已通过审核并发布'),
    }));
    expect(result).toMatchObject({ id: REPORT_ID, status: 'published', review_reason: null });
    expect(Number.isNaN(Date.parse(result.reviewed_at))).toBe(false);
  });

  it('驳回审核：reason 去除首尾空白后写库并通知作者', async () => {
    const { service, deps } = build();
    deps.reports.findOne.mockResolvedValue(makeReport({ status: 'pending_review', map_name: 'Desert' }));

    const result = await service.review(ADMIN_ID, REPORT_ID, 'reject', '  内容造假  ');

    expect(deps.reports.update).toHaveBeenCalledWith(
      { id: '1' },
      expect.objectContaining({ status: 'rejected', review_reason: '内容造假' }),
    );
    expect(deps.logs.log.mock.calls[0][0].action).toBe('timelapse.review.reject');
    expect(deps.notifications.create.mock.calls[0][0].content).toContain('原因：内容造假');
    expect(result).toMatchObject({ status: 'rejected', review_reason: '内容造假' });
  });

  it('审核说明超过 500 字时截断', async () => {
    const { service, deps } = build();
    deps.reports.findOne.mockResolvedValue(makeReport({ status: 'pending_review' }));

    await service.review(ADMIN_ID, REPORT_ID, 'reject', 'x'.repeat(600));

    expect(deps.reports.update.mock.calls[0][1].review_reason).toHaveLength(500);
  });

  it('审计日志写入失败不影响审核结果', async () => {
    const { service, deps } = build();
    deps.reports.findOne.mockResolvedValue(makeReport({ status: 'pending_review' }));
    deps.logs.log.mockRejectedValue(new Error('db down'));

    await expect(service.review(ADMIN_ID, REPORT_ID, 'approve', undefined)).resolves.toMatchObject({
      status: 'published',
    });
  });
});

describe('TimelapsesService Worker 回写', () => {
  const completedResult = {
    job_id: 'job-1',
    status: 'completed' as const,
    map_name: 'Desert',
    max_wave: 42,
  };

  it('completed 但缺少视频或封面时标记 failed / WORKER_ARTIFACTS_MISSING', async () => {
    const { service, deps } = build();
    deps.reports.findOne.mockResolvedValue(makeReport({ status: 'processing' }));
    deps.storage.statObject.mockImplementation(async (key: string) => (
      key.startsWith('video/') ? { exists: true, size: 10 } : { exists: false }
    ));

    const result = await service.applyRenderResult(REPORT_ID, completedResult as any);

    expect(result).toEqual({ id: REPORT_ID, status: 'failed', failure_code: 'WORKER_ARTIFACTS_MISSING' });
    expect(deps.reports.update).toHaveBeenCalledWith(
      { id: '1' },
      expect.objectContaining({
        status: 'failed',
        failure_code: 'WORKER_ARTIFACTS_MISSING',
        failure_reason: '渲染 Worker 未上传完整的视频或封面。',
        video_object_key: null,
        poster_object_key: null,
      }),
    );
    expect(deps.storage.deleteObject).toHaveBeenCalledWith(`video/${REPORT_ID}.mp4`);
    expect(deps.storage.deleteObject).toHaveBeenCalledWith(`poster/${REPORT_ID}.webp`);
    expect(deps.notifications.create.mock.calls[0][0].content).toContain('渲染失败');
  });

  it('completed 正常时清洗指标、24 小时后清理源包并进入待审核', async () => {
    const { service, deps } = build();
    deps.reports.findOne.mockResolvedValue(makeReport({ status: 'processing' }));

    const result = await service.applyRenderResult(REPORT_ID, {
      ...completedResult,
      map_name: '  Desert  ',
      map_width: 100_000_000,
      map_height: 720,
      game_mode: 'survival',
      game_version: 'v146',
      is_multiplayer: true,
      max_wave: 42,
      frame_count: 999,
      duration_seconds: 999_999,
      summary_metrics: [
        { t: 0, wave: 12, power_gen: -5, power_use: 100, power_stored: 50, core_items: 3, item_rate_per_min: 20, units_ally: 4, units_enemy: 5, buildings_ally: 60, players_online: 1 },
      ],
      highlights: { max_wave: 999, peak_power_gen: 999, peak_power_use: 0, peak_power_stored: 0, peak_item_rate_per_min: 0, peak_buildings_ally: 0, peak_units_ally: 0, peak_units_enemy: 0 },
    } as any);
    const updateValues = deps.reports.update.mock.calls[0][1];

    expect(result).toEqual({ id: REPORT_ID, status: 'pending_review' });
    expect(updateValues.status).toBe('pending_review');
    expect(updateValues.map_name).toBe('Desert');
    expect(updateValues.map_width).toBe(100_000);
    expect(updateValues.frame_count).toBe(180);
    expect(updateValues.duration_seconds).toBe(86_400);
    expect(updateValues.max_wave).toBe(999);
    expect(updateValues.is_multiplayer).toBe(true);
    // 负值指标仍被清洗为 0；Worker 的 highlights 是签名回写的受信边界，
    // 点位采样可能漏掉峰值，因此 max_wave 取 Worker 值与点位值的较大者。
    expect(updateValues.summary_metrics_json[0]).toMatchObject({ wave: 12, power_gen: 0 });
    expect(updateValues.highlights_json.max_wave).toBe(999);
    expect(updateValues.highlights_json.peak_power_gen).toBe(999);
    const purgeAfter = new Date(updateValues.source_purge_after).getTime();
    expect(purgeAfter - Date.now()).toBeGreaterThan(23.5 * 60 * 60 * 1000);
    expect(purgeAfter - Date.now()).toBeLessThan(24.5 * 60 * 60 * 1000);

    expect(deps.notifications.create.mock.calls[0][0].content).toContain('等待人工审核');
    expect(deps.adminNotifications.publishModerationPending).toHaveBeenCalledWith(expect.objectContaining({
      item_type: 'timelapse',
      item_id: 1,
      title: 'Desert',
      content: '最高 999 波 · 180 帧',
      author_username: `#${AUTHOR_ID}`,
      action_url: '/admin/content/moderation?type=timelapses',
    }));
  });

  it('自动通过开关 + 版主作者时直接 published', async () => {
    const { service, deps } = build();
    deps.reports.findOne.mockResolvedValue(makeReport({ status: 'processing' }));
    deps.settings.getBoolean.mockImplementation(async (key: string, defaultValue = false) => {
      if (key === 'timelapses_enabled') return true;
      if (key === 'timelapse_auto_approve_trusted') return true;
      return defaultValue;
    });
    deps.users.findOne.mockResolvedValue({ id: AUTHOR_ID, role: 'moderator' });

    const result = await service.applyRenderResult(REPORT_ID, {
      ...completedResult,
      summary_metrics: [],
      frame_count: 30,
    } as any);

    expect(result).toEqual({ id: REPORT_ID, status: 'published' });
    expect(deps.reports.update).toHaveBeenCalledWith(
      { id: '1' },
      expect.objectContaining({
        status: 'published',
        review_reason: 'auto_approved_trusted',
        reviewed_by_user_id: null,
        reviewed_at: expect.any(Date),
      }),
    );
    expect(deps.notifications.create.mock.calls[0][0].content).toContain('自动通过审核并发布');
    expect(deps.adminNotifications.publishModerationPending).not.toHaveBeenCalled();
  });

  it('超大 max_wave 收敛到 1,000,000', async () => {
    const { service, deps } = build();
    deps.reports.findOne.mockResolvedValue(makeReport({ status: 'processing' }));

    await service.applyRenderResult(REPORT_ID, {
      ...completedResult,
      max_wave: 9_000_000_000,
      summary_metrics: [],
    } as any);

    expect(deps.reports.update.mock.calls[0][1].max_wave).toBe(1_000_000);
    expect(deps.reports.update.mock.calls[0][1].highlights_json.max_wave).toBe(1_000_000);
  });

  it('failed 结果清理对象并记录清洗后的大写错误码', async () => {
    const { service, deps } = build();
    deps.reports.findOne.mockResolvedValue(makeReport({ status: 'processing' }));

    const result = await service.applyRenderResult(REPORT_ID, {
      job_id: 'job-1',
      status: 'failed',
      failure_code: 'ffmpeg_timeout',
      failure_reason: '  ffmpeg 超时  ',
    } as any);

    expect(result).toEqual({ id: REPORT_ID, status: 'failed', failure_code: 'FFMPEG_TIMEOUT' });
    expect(deps.reports.update).toHaveBeenCalledWith(
      { id: '1' },
      expect.objectContaining({
        status: 'failed',
        failure_code: 'FFMPEG_TIMEOUT',
        failure_reason: 'ffmpeg 超时',
      }),
    );
    expect(deps.storage.deleteObject).toHaveBeenCalledWith(`video/${REPORT_ID}.mp4`);
    expect(deps.storage.deleteObject).toHaveBeenCalledWith(`poster/${REPORT_ID}.webp`);
    expect(deps.notifications.create.mock.calls[0][0].content).toContain('渲染失败：ffmpeg 超时');
  });

  it('已发布战报重复收到 completed 时幂等返回', async () => {
    const { service, deps } = build();
    deps.reports.findOne.mockResolvedValue(makeReport({ status: 'published' }));

    await expect(service.applyRenderResult(REPORT_ID, completedResult as any)).resolves.toEqual({
      id: REPORT_ID,
      status: 'published',
      idempotent: true,
    });
    expect(deps.storage.statObject).not.toHaveBeenCalled();
  });

  it('尚未进入渲染流程的战报拒绝回写', async () => {
    const { service, deps } = build();
    deps.reports.findOne.mockResolvedValue(makeReport({ status: 'uploading' }));

    await expectApiRejection(service.applyRenderResult(REPORT_ID, completedResult as any), 'TIMELAPSE_NOT_RENDERING', 409);
  });
});

describe('TimelapsesService 草稿帖', () => {
  it('非作者返回 404', async () => {
    const { service, deps } = build();
    deps.reports.findOne.mockResolvedValue(makeReport({ status: 'pending_review', author_user_id: OTHER_USER_ID }));

    await expectApiRejection(
      service.createDraftPost(AUTHOR_ID, REPORT_ID, {}),
      'TIMELAPSE_NOT_FOUND',
      404,
    );
    expect(deps.posts.create).not.toHaveBeenCalled();
  });

  it('上传中（未生成成片）返回 TIMELAPSE_NOT_READY', async () => {
    const { service, deps } = build();
    deps.reports.findOne.mockResolvedValue(makeReport({ status: 'uploading' }));

    await expectApiRejection(service.createDraftPost(AUTHOR_ID, REPORT_ID, {}), 'TIMELAPSE_NOT_READY', 409);
  });

  it('帖子服务未注入时返回 TIMELAPSE_DRAFT_UNAVAILABLE', async () => {
    const deps = makeTimelapseDeps();
    const service = makeTimelapsesService({ ...deps, posts: undefined });

    await expectApiRejection(service.createDraftPost(AUTHOR_ID, REPORT_ID, {}), 'TIMELAPSE_DRAFT_UNAVAILABLE', 503);
  });

  it('成功创建草稿并写入 battleReport 节点', async () => {
    const { service, deps } = build();
    deps.reports.findOne.mockResolvedValue(makeReport({ status: 'pending_review', map_name: 'Desert' }));

    const result = await service.createDraftPost(AUTHOR_ID, REPORT_ID, { category_id: 3 });

    expect(deps.posts.create).toHaveBeenCalledTimes(1);
    const [dto, userId, provenance] = deps.posts.create.mock.calls[0];
    expect(userId).toBe(AUTHOR_ID);
    expect(provenance).toEqual({ source: 'USER' });
    expect(dto).toMatchObject({
      title: '基地延时战报：Desert',
      content_schema_version: 2,
      status: 'draft',
      category_id: 3,
    });
    // 草稿节点只携带 public_id；mapName/maxWave 由帖子保存事务中的 resolveDocument 回填。
    const attrs = battleReportAttrs(dto.content_json);
    expect(attrs).toEqual([{ timelapsePublicId: REPORT_ID }]);
    expect(result).toEqual({ post_id: 9, title: '草稿', status: 'draft' });
  });

  it('标题取用户输入并截断到 200 字', async () => {
    const { service, deps } = build();
    deps.reports.findOne.mockResolvedValue(makeReport({ status: 'published' }));

    await service.createDraftPost(AUTHOR_ID, REPORT_ID, { title: '  自定义标题  ' });

    expect(deps.posts.create.mock.calls[0][0].title).toBe('自定义标题');
  });

  it('PostsService 返回 null 时返回 TIMELAPSE_DRAFT_FAILED', async () => {
    const { service, deps } = build();
    deps.reports.findOne.mockResolvedValue(makeReport({ status: 'published' }));
    deps.posts.create.mockResolvedValue(null);

    await expectApiRejection(service.createDraftPost(AUTHOR_ID, REPORT_ID, {}), 'TIMELAPSE_DRAFT_FAILED', 500);
  });
});

describe('TimelapsesService 其它', () => {
  it('isQueueAvailable 透传队列状态', () => {
    const { service, deps } = build();
    expect(service.isQueueAvailable()).toBe(true);
    deps.queue.isAvailable.mockReturnValue(false);
    expect(service.isQueueAvailable()).toBe(false);
  });

  it('getInternalSource 在源包被清理后返回 410', async () => {
    const { service, deps } = build();
    deps.reports.findOne.mockResolvedValue(makeReport({ source_object_key: null }));

    await expectApiRejection(service.getInternalSource(REPORT_ID), 'TIMELAPSE_SOURCE_GONE', 410);
  });
});
