import { TimelapseMaintenanceService } from './timelapse-maintenance.service';
import {
  REPORT_ID, SECOND_REPORT_ID, makeReport,
} from './timelapse-test.helpers';

type QueryHandler = (sql: string, parameters: unknown[]) => unknown;

/** DataSource 与事务管理器共用同一个 query mock，便于按 SQL 片段回放结果。 */
function build(handler: QueryHandler) {
  const query = jest.fn(async (sql: string, parameters: unknown[] = []) => handler(sql, parameters));
  const manager = { query };
  const dataSource = {
    query,
    transaction: jest.fn(async (work: (entityManager: any) => Promise<unknown>) => work(manager)),
  };
  const storage = {
    isConfigured: jest.fn(() => true),
    deleteObject: jest.fn(async () => undefined),
  };
  const refs = { reconcile: jest.fn(async () => ({ removed: 0, repaired: 0 })) };
  const timelapses = { applyFailure: jest.fn(async () => ({ id: REPORT_ID, status: 'failed' })) };
  const service = new TimelapseMaintenanceService(
    dataSource as any,
    storage as any,
    refs as any,
    timelapses as any,
  );
  return { service, query, manager, dataSource, storage, refs, timelapses };
}

const SOURCE_KEY = `source/${REPORT_ID}.zip`;
const VIDEO_KEY = `video/${REPORT_ID}.mp4`;
const POSTER_KEY = `poster/${REPORT_ID}.webp`;

describe('TimelapseMaintenanceService 源包清理（purgeSources）', () => {
  it('到期源对象删除物理文件并把 key/purge_after 置 NULL', async () => {
    const rows = [
      { id: '1', source_object_key: SOURCE_KEY },
      { id: '2', source_object_key: `source/${SECOND_REPORT_ID}.zip` },
    ];
    const { service, query, storage } = build((sql) => {
      if (sql.includes('source_purge_after IS NOT NULL')) return rows;
      return { affectedRows: 1 };
    });

    await expect((service as any).purgeSources()).resolves.toBe(2);

    expect(storage.deleteObject.mock.calls).toEqual([
      [SOURCE_KEY],
      [`source/${SECOND_REPORT_ID}.zip`],
    ]);
    const updates = query.mock.calls.filter(([sql]) => String(sql).includes('SET source_object_key = NULL'));
    expect(updates).toHaveLength(2);
    expect(updates[0][0]).toContain('source_purge_after = NULL');
    // 带 source_object_key 条件，避免并发重新上传后误清新对象。
    expect(updates[0][0]).toContain('WHERE id = ? AND source_object_key = ?');
    expect(updates[0][1]).toEqual(['1', SOURCE_KEY]);
  });

  it('没有到期对象时返回 0 且不触碰存储', async () => {
    const { service, storage } = build(() => []);

    await expect((service as any).purgeSources()).resolves.toBe(0);
    expect(storage.deleteObject).not.toHaveBeenCalled();
  });
});

describe('TimelapseMaintenanceService 草稿过期（expireDrafts）', () => {
  it('到期且未绑定的草稿删除三个对象并软删除', async () => {
    const { service, query, storage } = build((sql) => {
      if (sql.startsWith('SELECT') && sql.includes('expires_at IS NOT NULL')) {
        return [{ id: '1', source_object_key: SOURCE_KEY, video_object_key: VIDEO_KEY, poster_object_key: POSTER_KEY }];
      }
      return { affectedRows: 1 };
    });

    await expect((service as any).expireDrafts()).resolves.toBe(1);

    expect(storage.deleteObject.mock.calls).toEqual([[SOURCE_KEY], [VIDEO_KEY], [POSTER_KEY]]);
    const update = query.mock.calls.find(([sql]) => String(sql).includes('SET deleted_at = NOW()'));
    expect(update![0]).toContain('bound_post_count = 0 AND deleted_at IS NULL');
    expect(update![1]).toEqual(['1']);
  });

  it('SQL 只选取 bound_post_count = 0 的行，绑定中的战报不会被回收', async () => {
    let sawBoundFilter = false;
    const { service, storage } = build((sql) => {
      if (sql.startsWith('SELECT')) {
        sawBoundFilter = sql.includes('bound_post_count = 0');
        // 模拟数据库中 bound_post_count > 0 的行不满足条件。
        return [];
      }
      return { affectedRows: 0 };
    });

    await expect((service as any).expireDrafts()).resolves.toBe(0);

    expect(sawBoundFilter).toBe(true);
    expect(storage.deleteObject).not.toHaveBeenCalled();
  });

  it('对象 key 为 NULL 时跳过删除但仍软删除该行', async () => {
    const { service, storage } = build((sql) => {
      if (sql.startsWith('SELECT') && sql.includes('expires_at IS NOT NULL')) {
        return [{ id: '1', source_object_key: null, video_object_key: null, poster_object_key: null }];
      }
      return { affectedRows: 1 };
    });

    await expect((service as any).expireDrafts()).resolves.toBe(1);
    expect(storage.deleteObject).not.toHaveBeenCalled();
  });
});

describe('TimelapseMaintenanceService 过期上传（expireStaleUploads）', () => {
  it('超时 uploading 软删除、超时 queued 标记 WORKER_QUEUE_LOST', async () => {
    const { service, query, storage } = build((sql) => {
      if (sql.startsWith('SELECT') && sql.includes("status = 'uploading'")) {
        return [{ id: '1', source_object_key: SOURCE_KEY }];
      }
      if (sql.startsWith('SELECT') && sql.includes("status = 'queued'")) {
        return [{ id: '2' }];
      }
      return { affectedRows: 1 };
    });

    await expect((service as any).expireStaleUploads()).resolves.toBe(2);

    expect(storage.deleteObject).toHaveBeenCalledTimes(1);
    expect(storage.deleteObject).toHaveBeenCalledWith(SOURCE_KEY);

    const uploadingUpdate = query.mock.calls.find(([sql]) => String(sql).includes("SET deleted_at = NOW(), source_object_key = NULL"));
    expect(uploadingUpdate![0]).toContain("status = 'uploading' AND deleted_at IS NULL");
    expect(uploadingUpdate![1]).toEqual(['1']);

    const queuedUpdate = query.mock.calls.find(([sql]) => String(sql).includes("failure_code = 'WORKER_QUEUE_LOST'"));
    expect(queuedUpdate![0]).toContain("status = 'failed'");
    expect(queuedUpdate![0]).toContain('source_purge_after = DATE_ADD(NOW(), INTERVAL 24 HOUR)');
    expect(queuedUpdate![1]).toEqual(['2']);

    // 超时阈值来自共享常量（24 小时）。
    const uploadSelect = query.mock.calls.find(([sql]) => String(sql).includes("status = 'uploading'") && String(sql).startsWith('SELECT'));
    expect(uploadSelect![0]).toContain('INTERVAL 24 HOUR');
    expect(uploadSelect![0]).toContain('LIMIT 200');
  });

  it('没有超时任务时返回 0', async () => {
    const { service, storage } = build(() => []);

    await expect((service as any).expireStaleUploads()).resolves.toBe(0);
    expect(storage.deleteObject).not.toHaveBeenCalled();
  });
});

describe('TimelapseMaintenanceService 失联渲染任务（failStaleProcessing）', () => {
  it('调用 applyFailure 并以 WORKER_TIMEOUT 收尾', async () => {
    const stale = makeReport({ id: '5', status: 'processing' });
    const { service, query, timelapses } = build((sql) => (sql.startsWith('SELECT') ? [stale] : { affectedRows: 1 }));

    await expect((service as any).failStaleProcessing()).resolves.toBe(1);

    expect(timelapses.applyFailure).toHaveBeenCalledWith(stale, 'WORKER_TIMEOUT', '渲染 Worker 超时未回写结果');
    const select = query.mock.calls[0][0];
    expect(select).toContain("status = 'processing'");
    expect(select).toContain('INTERVAL 30 MINUTE');
    expect(select).toContain('LIMIT 100');
  });

  it('没有失联任务时返回 0', async () => {
    const { service, timelapses } = build(() => []);

    await expect((service as any).failStaleProcessing()).resolves.toBe(0);
    expect(timelapses.applyFailure).not.toHaveBeenCalled();
  });
});

describe('TimelapseMaintenanceService 维护汇总（runMaintenance）', () => {
  it('汇总各阶段计数并在事务中调用 refs.reconcile', async () => {
    const { service, dataSource, manager, refs } = build(() => []);
    const purge = jest.spyOn(service as any, 'purgeSources').mockResolvedValue(1);
    const drafts = jest.spyOn(service as any, 'expireDrafts').mockResolvedValue(2);
    const uploads = jest.spyOn(service as any, 'expireStaleUploads').mockResolvedValue(3);
    const processing = jest.spyOn(service as any, 'failStaleProcessing').mockResolvedValue(4);
    refs.reconcile.mockResolvedValue({ removed: 5, repaired: 6 });

    await expect(service.runMaintenance()).resolves.toEqual({
      sources_purged: 1,
      drafts_expired: 2,
      uploads_expired: 3,
      processing_failed: 4,
      refs_removed: 5,
      refs_repaired: 6,
    });

    expect(purge).toHaveBeenCalledTimes(1);
    expect(drafts).toHaveBeenCalledTimes(1);
    expect(uploads).toHaveBeenCalledTimes(1);
    expect(processing).toHaveBeenCalledTimes(1);
    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(refs.reconcile).toHaveBeenCalledWith(manager);
  });
});

describe('TimelapseMaintenanceService 定时扫描（sweep）', () => {
  it('存储未配置时直接跳过', async () => {
    const { service, storage } = build(() => []);
    storage.isConfigured.mockReturnValue(false);
    const run = jest.spyOn(service, 'runMaintenance');

    await service.sweep();

    expect(run).not.toHaveBeenCalled();
  });

  it('维护抛错被吞掉，running 标志复位后下一轮仍可执行', async () => {
    const { service } = build(() => []);
    const run = jest.spyOn(service, 'runMaintenance').mockRejectedValueOnce(new Error('db down'));

    await expect(service.sweep()).resolves.toBeUndefined();
    expect(run).toHaveBeenCalledTimes(1);

    run.mockResolvedValue({
      sources_purged: 0,
      drafts_expired: 0,
      uploads_expired: 0,
      processing_failed: 0,
      refs_removed: 0,
      refs_repaired: 0,
    });
    await expect(service.sweep()).resolves.toBeUndefined();
    expect(run).toHaveBeenCalledTimes(2);
  });
});
