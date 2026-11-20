import type { TimelapseReport } from '../../entities/timelapse-report.entity';
import { TimelapsesService } from './timelapses.service';

/**
 * 延时战报控制面测试的共享夹具。
 *
 * 本仓库的既有单元测试（如 game-saves.service.spec.ts）不启动 Nest 测试模块，
 * 而是直接 `new` 服务并注入 jest.fn 依赖。这里沿用同一风格，只把 13 个构造
 * 依赖和固定 UUID/战报行集中到一个文件里，避免五个 spec 各自重复。
 */

/** 固定测试 UUID：必须满足 isSafePublicId 的版本位/变体位约束。 */
export const REPORT_ID = '11111111-1111-4111-8111-111111111111';
export const SECOND_REPORT_ID = '22222222-2222-4222-9222-222222222222';
export const THIRD_REPORT_ID = '33333333-3333-4333-8333-333333333333';
export const MISSING_REPORT_ID = '99999999-9999-4999-8999-999999999999';

export const AUTHOR_ID = 42;
export const OTHER_USER_ID = 7;
export const ADMIN_ID = 1;

export const HOUR_MS = 60 * 60 * 1000;
export const DAY_MS = 24 * HOUR_MS;
export const SHA_A = 'a'.repeat(64);
export const SHA_B = 'b'.repeat(64);

/** 构造一条 timelapse_reports 行；默认是作者本人的上传中会话。 */
export function makeReport(overrides: Partial<TimelapseReport> = {}): TimelapseReport {
  return {
    id: '1',
    public_id: REPORT_ID,
    author_user_id: AUTHOR_ID,
    status: 'uploading',
    visibility: 'public',
    map_name: 'Desert',
    map_width: null,
    map_height: null,
    game_mode: null,
    game_version: null,
    is_multiplayer: false,
    max_wave: 0,
    duration_seconds: 0,
    frame_count: 0,
    source_object_key: `source/${REPORT_ID}.zip`,
    source_sha256: SHA_A,
    source_size_bytes: '10',
    source_purge_after: null,
    video_object_key: null,
    poster_object_key: null,
    summary_metrics_json: null,
    highlights_json: null,
    bound_post_count: 0,
    expires_at: new Date(Date.now() + 30 * DAY_MS),
    reviewed_by_user_id: null,
    reviewed_at: null,
    review_reason: null,
    failure_code: null,
    failure_reason: null,
    created_at: new Date(),
    updated_at: new Date(),
    deleted_at: null,
    ...overrides,
  } as TimelapseReport;
}

/**
 * 构造包含 battleReport 节点的合法 Schema v2 文档。
 *
 * 传入对象时可以携带客户端伪造的 mapName/maxWave，用于验证服务端回填覆盖。
 */
export function makeBattleReportDocument(
  entries: Array<string | { id: string; mapName?: string; maxWave?: number }>,
): Record<string, unknown> {
  const content = entries.map((entry) => {
    const id = typeof entry === 'string' ? entry : entry.id;
    const attrs: Record<string, unknown> = { timelapsePublicId: id };
    if (typeof entry !== 'string') {
      if (entry.mapName !== undefined) attrs.mapName = entry.mapName;
      if (entry.maxWave !== undefined) attrs.maxWave = entry.maxWave;
    }
    return { type: 'battleReport', attrs };
  });
  return { type: 'doc', content };
}

/** 从规范化后的文档里取出全部 battleReport 节点的 attrs。 */
export function battleReportAttrs(
  document: Record<string, unknown>,
): Array<Record<string, unknown>> {
  const result: Array<Record<string, unknown>> = [];
  const visit = (node: Record<string, unknown>) => {
    if (node?.type === 'battleReport') result.push(node.attrs as Record<string, unknown>);
    for (const child of (node?.content as Array<Record<string, unknown>>) || []) visit(child);
  };
  visit(document as Record<string, unknown>);
  return result;
}

export interface TimelapseDeps {
  reports: {
    findOne: jest.Mock;
    find: jest.Mock;
    insert: jest.Mock;
    update: jest.Mock;
    createQueryBuilder: jest.Mock;
  };
  users: { findOne: jest.Mock };
  dataSource: { transaction: jest.Mock; query?: jest.Mock };
  storage: {
    isConfigured: jest.Mock;
    writeStream: jest.Mock;
    statObject: jest.Mock;
    readPrefix: jest.Mock;
    deleteObject: jest.Mock;
    openObject: jest.Mock;
  };
  queue: { enqueue: jest.Mock; isAvailable: jest.Mock };
  refs: {
    resolveDocument: jest.Mock;
    syncPostRefs: jest.Mock;
    removePostRefs: jest.Mock;
    reconcile: jest.Mock;
  };
  settings: { getBoolean: jest.Mock; get: jest.Mock; getCached: jest.Mock };
  notifications: { create: jest.Mock };
  adminNotifications: { publishModerationPending: jest.Mock };
  logs: { log: jest.Mock };
  points: { getUserPoints: jest.Mock };
  bans: { isActive: jest.Mock };
  posts?: { create: jest.Mock };
}

/** 默认开启 timelapses_enabled、存储可用、队列可用，其余依赖全部 jest.fn。 */
export function makeTimelapseDeps(): TimelapseDeps {
  const txManager = {
    query: jest.fn(async () => []),
    insert: jest.fn(async () => ({ identifiers: [] })),
  };
  return {
    reports: {
      findOne: jest.fn(async () => null),
      find: jest.fn(async () => []),
      insert: jest.fn(async () => ({ identifiers: [] })),
      update: jest.fn(async () => ({ affected: 1 })),
      createQueryBuilder: jest.fn(),
    },
    users: { findOne: jest.fn(async () => null) },
    dataSource: {
      transaction: jest.fn(async (work: (manager: any) => Promise<unknown>) => work(txManager)),
      query: jest.fn(async () => []),
    },
    storage: {
      isConfigured: jest.fn(() => true),
      writeStream: jest.fn(async () => ({ size: 10, sha256: SHA_A })),
      statObject: jest.fn(async () => ({ exists: true, size: 10 })),
      readPrefix: jest.fn(async () => Buffer.from([0x50, 0x4b, 0x03, 0x04])),
      deleteObject: jest.fn(async () => undefined),
      openObject: jest.fn(async () => null),
    },
    queue: {
      enqueue: jest.fn(async () => 'job-id'),
      isAvailable: jest.fn(() => true),
    },
    refs: {
      resolveDocument: jest.fn(async (document: unknown) => document),
      syncPostRefs: jest.fn(async () => ({ added: 0, removed: 0 })),
      removePostRefs: jest.fn(async () => 0),
      reconcile: jest.fn(async () => ({ removed: 0, repaired: 0 })),
    },
    settings: {
      // 默认开启功能总开关；其余开关返回调用方给的默认值。
      getBoolean: jest.fn(async (key: string, defaultValue = false) => (
        key === 'timelapses_enabled' ? true : defaultValue
      )),
      get: jest.fn(async () => null),
      getCached: jest.fn(() => null),
    },
    notifications: { create: jest.fn(async () => ({})) },
    adminNotifications: { publishModerationPending: jest.fn(async () => []) },
    logs: { log: jest.fn(async () => ({})) },
    points: { getUserPoints: jest.fn(async () => ({ total_points: 0, available_points: 0 })) },
    bans: { isActive: jest.fn(async () => false) },
    posts: { create: jest.fn(async () => ({ id: 9, title: '草稿', status: 'draft' })) },
  };
}

/** 用 mock 依赖直接构造服务，不经过 Nest DI。 */
export function makeTimelapsesService(deps: TimelapseDeps = makeTimelapseDeps()): TimelapsesService {
  return new TimelapsesService(
    deps.reports as any,
    deps.users as any,
    deps.dataSource as any,
    deps.storage as any,
    deps.queue as any,
    deps.refs as any,
    deps.settings as any,
    deps.notifications as any,
    deps.adminNotifications as any,
    deps.logs as any,
    deps.points as any,
    deps.bans as any,
    deps.posts as any,
  );
}

export interface UploadCounts {
  userExists?: boolean;
  unbound?: number;
  hourly?: number;
  daily?: number;
  active?: number;
}

/**
 * createUpload 的额度查询管理器。
 *
 * 用 SQL 片段区分四条 COUNT 查询，模拟真实事务内的 SELECT ... FOR UPDATE 顺序。
 */
export function makeUploadManager(counts: UploadCounts = {}) {
  const manager = {
    query: jest.fn(async (sql: string) => {
      if (sql.includes('SELECT id FROM users')) {
        return counts.userExists === false ? [] : [{ id: AUTHOR_ID }];
      }
      if (sql.includes('bound_post_count = 0')) return [{ count: counts.unbound ?? 0 }];
      if (sql.includes('INTERVAL 1 HOUR')) return [{ count: counts.hourly ?? 0 }];
      if (sql.includes('INTERVAL 1 DAY')) return [{ count: counts.daily ?? 0 }];
      if (sql.includes("status IN ('uploading','queued','processing')")) return [{ count: counts.active ?? 0 }];
      return [];
    }),
    insert: jest.fn(async () => ({ identifiers: [] })),
  };
  return manager;
}

/** 把 dataSource.transaction 指向 createUpload 专用管理器。 */
export function useUploadManager(deps: TimelapseDeps, counts: UploadCounts = {}) {
  const manager = makeUploadManager(counts);
  deps.dataSource.transaction.mockImplementation(async (work: (entityManager: any) => Promise<unknown>) => work(manager));
  return manager;
}

/**
 * 断言 ApiV1Exception 的稳定错误码与 HTTP 状态。
 *
 * 返回异常对象，便于继续断言 details / response。
 */
export async function expectApiRejection(
  promise: Promise<unknown>,
  code: string,
  status?: number,
): Promise<any> {
  const error: any = await promise.then(() => null, (reason) => reason);
  expect(error).toBeTruthy();
  expect(error.code).toBe(code);
  if (status !== undefined) expect(error.getStatus()).toBe(status);
  return error;
}
