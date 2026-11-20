import { TimelapseRefsService } from './timelapse-refs.service';
import {
  AUTHOR_ID, OTHER_USER_ID, REPORT_ID, SECOND_REPORT_ID,
  battleReportAttrs, expectApiRejection, makeBattleReportDocument, makeReport,
} from './timelapse-test.helpers';

/** 只注入 Repository 的轻量服务；引用同步全部走传入的 EntityManager.query。 */
function build() {
  const reports = { find: jest.fn(async () => []), findOne: jest.fn() };
  return { service: new TimelapseRefsService(reports as any), reports };
}

type QueryHandler = (sql: string, parameters: unknown[]) => unknown;

/** 按 SQL 片段返回结果的 EntityManager mock。 */
function makeManager(handler: QueryHandler) {
  return { query: jest.fn(async (sql: string, parameters: unknown[] = []) => handler(sql, parameters)) };
}

function updateCalls(manager: { query: jest.Mock }) {
  return manager.query.mock.calls.filter(([sql]) => String(sql).includes('UPDATE timelapse_reports'));
}

describe('TimelapseRefsService 正文引用解析（resolveDocument）', () => {
  it('没有 battleReport 节点时原样返回且不查库', async () => {
    const { service, reports } = build();
    const document = { type: 'doc', content: [{ type: 'paragraph' }] };

    await expect(service.resolveDocument(document, AUTHOR_ID, { strict: true })).resolves.toBe(document);
    expect(reports.find).not.toHaveBeenCalled();
  });

  it('strict 模式下引用不存在时返回 400 TIMELAPSE_NOT_FOUND', async () => {
    const { service, reports } = build();
    reports.find.mockResolvedValue([]);

    const error = await expectApiRejection(
      service.resolveDocument(makeBattleReportDocument([REPORT_ID]), AUTHOR_ID, { strict: true }),
      'TIMELAPSE_NOT_FOUND',
      400,
    );
    expect(error.details).toEqual([{ publicId: REPORT_ID }]);
  });

  it('strict 模式下引用他人待审核战报时返回 403 TIMELAPSE_NOT_AVAILABLE', async () => {
    const { service, reports } = build();
    reports.find.mockResolvedValue([makeReport({ status: 'pending_review', author_user_id: OTHER_USER_ID })]);

    await expectApiRejection(
      service.resolveDocument(makeBattleReportDocument([REPORT_ID]), AUTHOR_ID, { strict: true }),
      'TIMELAPSE_NOT_AVAILABLE',
      403,
    );
  });

  it('strict 模式下引用他人 private 战报时返回 403', async () => {
    const { service, reports } = build();
    reports.find.mockResolvedValue([makeReport({ status: 'published', visibility: 'private', author_user_id: OTHER_USER_ID })]);

    await expectApiRejection(
      service.resolveDocument(makeBattleReportDocument([REPORT_ID]), AUTHOR_ID, { strict: true }),
      'TIMELAPSE_NOT_AVAILABLE',
      403,
    );
  });

  it('作者本人待审核战报可以通过，并回填数据库元数据', async () => {
    const { service, reports } = build();
    reports.find.mockResolvedValue([makeReport({ status: 'pending_review', map_name: 'Frozen Forest', max_wave: 42 })]);

    const result = await service.resolveDocument(
      makeBattleReportDocument([{ id: REPORT_ID, mapName: '客户端伪造', maxWave: 9999 }]),
      AUTHOR_ID,
      { strict: true },
    );

    expect(battleReportAttrs(result)).toEqual([{
      timelapsePublicId: REPORT_ID,
      mapName: 'Frozen Forest',
      maxWave: 42,
    }]);
  });

  it('公开已发布战报对他人可见并回填元数据', async () => {
    const { service, reports } = build();
    reports.find.mockResolvedValue([makeReport({ status: 'published', map_name: 'Desert', max_wave: 7 })]);

    const result = await service.resolveDocument(
      makeBattleReportDocument([{ id: REPORT_ID, mapName: '伪造', maxWave: 1000 }]),
      AUTHOR_ID,
      { strict: true },
    );

    expect(battleReportAttrs(result)).toEqual([{
      timelapsePublicId: REPORT_ID,
      mapName: 'Desert',
      maxWave: 7,
    }]);
  });

  it('非 strict 模式下缺失引用不抛错，但客户端伪造值仍被清空', async () => {
    const { service, reports } = build();
    reports.find.mockResolvedValue([]);

    const result = await service.resolveDocument(
      makeBattleReportDocument([{ id: REPORT_ID, mapName: '伪造', maxWave: 9999 }]),
      AUTHOR_ID,
      { strict: false },
    );

    expect(battleReportAttrs(result)).toEqual([{
      timelapsePublicId: REPORT_ID,
      mapName: '',
      maxWave: 0,
    }]);
  });

  it('非 strict 模式下他人待审核战报不写入元数据', async () => {
    const { service, reports } = build();
    reports.find.mockResolvedValue([makeReport({ status: 'pending_review', author_user_id: OTHER_USER_ID, map_name: 'Secret', max_wave: 90 })]);

    const result = await service.resolveDocument(
      makeBattleReportDocument([{ id: REPORT_ID, mapName: '伪造', maxWave: 1 }]),
      AUTHOR_ID,
      {},
    );

    expect(battleReportAttrs(result)[0]).toMatchObject({ mapName: '', maxWave: 0 });
  });

  it('一次文档中的多个引用分别回填', async () => {
    const { service, reports } = build();
    reports.find.mockResolvedValue([
      makeReport({ id: '1', public_id: REPORT_ID, status: 'published', map_name: 'A', max_wave: 3 }),
      makeReport({ id: '2', public_id: SECOND_REPORT_ID, status: 'published', map_name: 'B', max_wave: 0 }),
    ]);

    const result = await service.resolveDocument(
      makeBattleReportDocument([REPORT_ID, SECOND_REPORT_ID]),
      AUTHOR_ID,
      { strict: true },
    );

    expect(battleReportAttrs(result)).toEqual([
      { timelapsePublicId: REPORT_ID, mapName: 'A', maxWave: 3 },
      { timelapsePublicId: SECOND_REPORT_ID, mapName: 'B', maxWave: 0 },
    ]);
  });

  it('空地图名回填为空字符串而不是 null', async () => {
    const { service, reports } = build();
    reports.find.mockResolvedValue([makeReport({ status: 'published', map_name: '' })]);

    const result = await service.resolveDocument(makeBattleReportDocument([REPORT_ID]), AUTHOR_ID, { strict: true });

    expect(battleReportAttrs(result)[0].mapName).toBe('');
  });
});

describe('TimelapseRefsService 帖子引用同步（syncPostRefs）', () => {
  it('published 且新增引用时 INSERT IGNORE 并重算为 NULL 宽限期', async () => {
    const { service } = build();
    const manager = makeManager((sql) => {
      if (sql.includes('SELECT id FROM timelapse_reports WHERE public_id IN')) return [{ id: '10' }];
      if (sql.includes('SELECT timelapse_id FROM timelapse_post_refs WHERE post_id')) return [];
      if (sql.includes('SELECT COUNT(*) AS count')) return [{ count: 1 }];
      return [];
    });

    const result = await service.syncPostRefs(
      manager as any,
      55,
      makeBattleReportDocument([REPORT_ID]),
      'published',
    );

    expect(result).toEqual({ added: 1, removed: 0 });
    expect(manager.query).toHaveBeenCalledWith(
      'INSERT IGNORE INTO timelapse_post_refs (timelapse_id, post_id, created_at) VALUES (?, ?, NOW())',
      ['10', 55],
    );
    const updates = updateCalls(manager);
    expect(updates).toHaveLength(1);
    expect(updates[0][0]).toContain('expires_at = CASE WHEN ? > 0 THEN NULL');
    // 计数 > 0：bind 后清空 30 天宽限期。
    expect(updates[0][1]).toEqual([1, 1, '10']);
  });

  it('移除引用时 DELETE 并重新给 30 天宽限期', async () => {
    const { service } = build();
    const manager = makeManager((sql) => {
      if (sql.includes('SELECT timelapse_id FROM timelapse_post_refs WHERE post_id')) return [{ timelapse_id: '10' }];
      if (sql.includes('SELECT COUNT(*) AS count')) return [{ count: 0 }];
      return [];
    });

    const result = await service.syncPostRefs(
      manager as any,
      55,
      { type: 'doc', content: [{ type: 'paragraph' }] },
      'published',
    );

    expect(result).toEqual({ added: 0, removed: 1 });
    expect(manager.query).toHaveBeenCalledWith(
      'DELETE FROM timelapse_post_refs WHERE post_id = ? AND timelapse_id IN (?)',
      [55, '10'],
    );
    const updates = updateCalls(manager);
    expect(updates[0][1]).toEqual([0, 0, '10']);
    expect(updates[0][0]).toContain('DATE_ADD(NOW(), INTERVAL 30 DAY)');
  });

  it('非 published 帖子清空该帖全部引用', async () => {
    const { service } = build();
    const manager = makeManager((sql) => {
      if (sql.includes('SELECT timelapse_id FROM timelapse_post_refs WHERE post_id')) return [{ timelapse_id: '10' }];
      if (sql.includes('SELECT COUNT(*) AS count')) return [{ count: 0 }];
      return [];
    });

    const result = await service.syncPostRefs(
      manager as any,
      55,
      makeBattleReportDocument([REPORT_ID]),
      'draft',
    );

    expect(result).toEqual({ added: 0, removed: 1 });
    // 草稿不占用永久保留额度：不应查询 public_id → 内部 id。
    expect(manager.query.mock.calls.some(([sql]) => String(sql).includes('SELECT id FROM timelapse_reports WHERE public_id IN'))).toBe(false);
    expect(manager.query).toHaveBeenCalledWith(
      'DELETE FROM timelapse_post_refs WHERE post_id = ? AND timelapse_id IN (?)',
      [55, '10'],
    );
  });

  it('引用集合没有变化时不写引用表也不重算', async () => {
    const { service } = build();
    const manager = makeManager((sql) => {
      if (sql.includes('SELECT id FROM timelapse_reports WHERE public_id IN')) return [{ id: '10' }];
      if (sql.includes('SELECT timelapse_id FROM timelapse_post_refs WHERE post_id')) return [{ timelapse_id: '10' }];
      return [];
    });

    const result = await service.syncPostRefs(
      manager as any,
      55,
      makeBattleReportDocument([REPORT_ID]),
      'published',
    );

    expect(result).toEqual({ added: 0, removed: 0 });
    expect(manager.query.mock.calls.some(([sql]) => /^(INSERT|DELETE)/.test(String(sql)))).toBe(false);
    expect(updateCalls(manager)).toHaveLength(0);
  });

  it('同一引用的重复节点去重后只 INSERT 一次', async () => {
    const { service } = build();
    const manager = makeManager((sql) => {
      if (sql.includes('SELECT id FROM timelapse_reports WHERE public_id IN')) return [{ id: '10' }];
      if (sql.includes('SELECT timelapse_id FROM timelapse_post_refs WHERE post_id')) return [];
      if (sql.includes('SELECT COUNT(*) AS count')) return [{ count: 1 }];
      return [];
    });

    const result = await service.syncPostRefs(
      manager as any,
      55,
      makeBattleReportDocument([REPORT_ID, REPORT_ID]),
      'published',
    );

    expect(result).toEqual({ added: 1, removed: 0 });
    const inserts = manager.query.mock.calls.filter(([sql]) => String(sql).startsWith('INSERT IGNORE'));
    expect(inserts).toHaveLength(1);
  });

  it('引用不存在的 public_id 不会写入引用表', async () => {
    const { service } = build();
    const manager = makeManager((sql) => {
      if (sql.includes('SELECT id FROM timelapse_reports WHERE public_id IN')) return [];
      if (sql.includes('SELECT timelapse_id FROM timelapse_post_refs WHERE post_id')) return [];
      return [];
    });

    const result = await service.syncPostRefs(
      manager as any,
      55,
      makeBattleReportDocument([REPORT_ID]),
      'published',
    );

    expect(result).toEqual({ added: 0, removed: 0 });
    expect(manager.query.mock.calls.some(([sql]) => String(sql).startsWith('INSERT IGNORE'))).toBe(false);
  });
});

describe('TimelapseRefsService 移除帖子引用（removePostRefs）', () => {
  it('帖子没有引用时返回 0 且不删除', async () => {
    const { service } = build();
    const manager = makeManager(() => []);

    await expect(service.removePostRefs(manager as any, 55)).resolves.toBe(0);
    expect(manager.query).toHaveBeenCalledTimes(1);
  });

  it('有引用时删除该帖全部引用并重算每篇战报', async () => {
    const { service } = build();
    const manager = makeManager((sql) => {
      if (sql.includes('SELECT timelapse_id FROM timelapse_post_refs WHERE post_id')) {
        return [{ timelapse_id: '10' }, { timelapse_id: '20' }];
      }
      if (sql.includes('SELECT COUNT(*) AS count')) return [{ count: 0 }];
      return [];
    });

    await expect(service.removePostRefs(manager as any, 55)).resolves.toBe(2);

    expect(manager.query).toHaveBeenCalledWith('DELETE FROM timelapse_post_refs WHERE post_id = ?', [55]);
    const updates = updateCalls(manager);
    expect(updates).toHaveLength(2);
    expect(updates.map(([, parameters]) => parameters)).toEqual([
      [0, 0, '10'],
      [0, 0, '20'],
    ]);
  });
});

describe('TimelapseRefsService 引用对账（reconcile）', () => {
  it('清理非发布/已删除帖子的引用并修复计数', async () => {
    const { service } = build();
    const manager = makeManager((sql) => {
      if (sql.includes('SELECT DISTINCT r.timelapse_id')) return [{ timelapse_id: '10' }, { timelapse_id: '11' }];
      if (sql.includes('DELETE r FROM timelapse_post_refs r')) return { affectedRows: 3 };
      if (sql.includes('SELECT t.id FROM timelapse_reports t')) return [{ id: '11' }, { id: '12' }];
      if (sql.includes('SELECT COUNT(*) AS count')) return [{ count: 0 }];
      return [];
    });

    const result = await service.reconcile(manager as any);

    // stale（10、11）与计数异常（11、12）去重后共 3 篇需要重算。
    expect(result).toEqual({ removed: 3, repaired: 3 });
    const updates = updateCalls(manager);
    expect(updates).toHaveLength(3);
    expect(updates.map(([, parameters]) => parameters[2])).toEqual(['10', '11', '12']);
    expect(manager.query.mock.calls.some(([sql]) => String(sql).includes("p.status <> 'published'"))).toBe(true);
  });

  it('DELETE 结果没有 affectedRows 时退回 stale 行数', async () => {
    const { service } = build();
    const manager = makeManager((sql) => {
      if (sql.includes('SELECT DISTINCT r.timelapse_id')) return [{ timelapse_id: '10' }, { timelapse_id: '20' }];
      if (sql.includes('DELETE r FROM timelapse_post_refs r')) return {};
      if (sql.includes('SELECT t.id FROM timelapse_reports t')) return [];
      if (sql.includes('SELECT COUNT(*) AS count')) return [{ count: 0 }];
      return [];
    });

    await expect(service.reconcile(manager as any)).resolves.toMatchObject({ removed: 2, repaired: 2 });
  });

  it('没有异常数据时不重算任何战报', async () => {
    const { service } = build();
    const manager = makeManager((sql) => {
      if (sql.includes('DELETE r FROM timelapse_post_refs r')) return { affectedRows: 0 };
      return [];
    });

    await expect(service.reconcile(manager as any)).resolves.toEqual({ removed: 0, repaired: 0 });
    expect(updateCalls(manager)).toHaveLength(0);
  });

  it('reconcile 使用同一事务管理器完成删除与修复', async () => {
    const { service } = build();
    const manager = makeManager((sql) => {
      if (sql.includes('SELECT DISTINCT r.timelapse_id')) return [{ timelapse_id: '10' }];
      if (sql.includes('DELETE r FROM timelapse_post_refs r')) return { affectedRows: 1 };
      if (sql.includes('SELECT COUNT(*) AS count')) return [{ count: 2 }];
      return [];
    });

    const result = await service.reconcile(manager as any);

    expect(result.repaired).toBe(1);
    // 计数为 2 时更新语句同时写入 bound_post_count 与“> 0 则 NULL”的分支参数。
    const update = updateCalls(manager)[0];
    expect(update[1]).toEqual([2, 2, '10']);
  });
});