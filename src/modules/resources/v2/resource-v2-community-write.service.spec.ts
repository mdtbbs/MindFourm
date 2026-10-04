import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ResourceV2CommunityWriteService } from './resource-v2-community-write.service';

const ids = {
  map: '10000000-0000-4000-8000-000000000001',
  mapVersion: '20000000-0000-4000-8000-000000000001',
  modA: '10000000-0000-4000-8000-000000000002',
  modAVersion: '20000000-0000-4000-8000-000000000002',
  modB: '10000000-0000-4000-8000-000000000003',
  modBVersion: '20000000-0000-4000-8000-000000000003',
  fixedResource: '10000000-0000-4000-8000-000000000004',
  fixedVersion: '20000000-0000-4000-8000-000000000004',
  compatibilityReport: '30000000-0000-4000-8000-000000000001',
  issueReport: '30000000-0000-4000-8000-000000000002',
  conflictReport: '30000000-0000-4000-8000-000000000003',
};

type HarnessOptions = { phoneVerified?: boolean; publishedFixedVersion?: boolean; authorRole?: 'owner' | 'maintainer' | 'publisher' | null };

function createHarness(options: HarnessOptions = {}) {
  const resourceRows: Record<string, any> = {
    [ids.map]: { id: 1, user_id: 10, resource_kind: 'map', public_id: ids.map },
    [ids.modA]: { id: 2, user_id: 10, resource_kind: 'mod', public_id: ids.modA },
    [ids.modB]: { id: 3, user_id: 11, resource_kind: 'mod', public_id: ids.modB },
    [ids.fixedResource]: { id: 4, user_id: 12, resource_kind: 'mod', public_id: ids.fixedResource },
  };
  const versionRows: Record<string, any> = {
    [`1:${ids.mapVersion}`]: { id: 11, resource_id: 1, public_id: ids.mapVersion, status: 'published' },
    [`2:${ids.modAVersion}`]: { id: 12, resource_id: 2, public_id: ids.modAVersion, status: 'published' },
    [`3:${ids.modBVersion}`]: { id: 13, resource_id: 3, public_id: ids.modBVersion, status: 'published' },
    ...(options.publishedFixedVersion === false ? {} : { [`4:${ids.fixedVersion}`]: { id: 14, resource_id: 4, public_id: ids.fixedVersion, status: 'published' } }),
  };
  const outerQuery = jest.fn(async (sql: string, params: any[] = []) => execute(sql, params));
  const managerQuery = jest.fn(async (sql: string, params: any[] = []) => execute(sql, params));
  const manager = { query: managerQuery };
  const dataSource: any = {
    query: outerQuery,
    transaction: jest.fn(async (callback: (manager: any) => Promise<unknown>) => callback(manager)),
  };
  const service = new ResourceV2CommunityWriteService(dataSource);

  function execute(sql: string, params: any[] = []): any[] {
    if (sql.includes('FROM users WHERE id')) return options.phoneVerified === false ? [{ phone_verified: 0 }] : [{ phone_verified: 1 }];
    if (sql.includes('FROM resources') && sql.includes('WHERE public_id=?')) {
      const row = resourceRows[String(params[0])];
      return row ? [{ ...row }] : [];
    }
    if (sql.includes('FROM resource_versions') && sql.includes('WHERE resource_id=? AND public_id=?')) {
      const row = versionRows[`${params[0]}:${params[1]}`];
      return row ? [{ ...row }] : [];
    }
    if (sql.includes('FROM map_feedback WHERE')) return [{
      feedback_count: '4', difficulty_average: '3.50', resource_sufficiency_average: '4.00',
      balance_average: '3.25', multiplayer_experience_average: null,
    }];
    if (sql.includes('SELECT public_id FROM mod_compatibility_reports')) return [{ public_id: ids.compatibilityReport }];
    if (sql.includes('SELECT public_id,status FROM mod_issue_reports WHERE resource_version_id')) return [{ public_id: ids.issueReport, status: 'open' }];
    if (sql.includes('SELECT id FROM mod_conflict_reports')) return [{ id: 90 }];
    if (sql.includes('SELECT report.public_id,report.resource_id,report.resource_version_id,resource.public_id AS resource_public_id,version.public_id AS version_public_id')) {
      const reportId = String(params[0]);
      if (reportId === ids.compatibilityReport && Number(params[1]) === 10) return [{ public_id: reportId, resource_id: 2, resource_version_id: 12, resource_public_id: ids.modA, version_public_id: ids.modAVersion }];
      if (reportId === ids.issueReport && Number(params[1]) === 10) return [{ public_id: reportId, resource_id: 2, resource_version_id: 12, resource_public_id: ids.modA, version_public_id: ids.modAVersion, status: 'open' }];
      return [];
    }
    if (sql.includes('FROM mod_compatibility_reports report JOIN resources resource')) {
      return params[0] === ids.compatibilityReport ? [{ public_id: ids.compatibilityReport, resource_id: 2, resource_version_id: 12, resource_public_id: ids.modA }] : [];
    }
    if (sql.includes('FROM mod_issue_reports report JOIN resources resource')) {
      return params[0] === ids.issueReport ? [{ public_id: ids.issueReport, resource_id: 2, resource_version_id: 12, resource_public_id: ids.modA }] : [];
    }
    if (sql.includes('FROM mod_conflict_reports WHERE public_id=')) return [{ id: 90, public_id: ids.conflictReport }];
    if (sql.includes('FROM mod_conflict_members member JOIN resources resource')) return [
      { resource_id: 2, resource_public_id: ids.modA, user_id: 10, resource_version_id: 12 },
      { resource_id: 3, resource_public_id: ids.modB, user_id: 11, resource_version_id: 13 },
    ];
    if (sql.includes('LEFT JOIN resource_members member ON')) {
      const role = options.authorRole ?? 'maintainer';
      const actorId = Number(params[0]);
      return [{ user_id: role === 'owner' ? actorId : 77, role: actorId === 10 ? role : null, status: actorId === 10 && role ? 'active' : null }];
    }
    return [];
  }

  return { service, dataSource, managerQuery, outerQuery };
}

describe('ResourceV2CommunityWriteService', () => {
  it('upserts one map feedback per user and returns a structured aggregate', async () => {
    const { service, managerQuery } = createHarness();
    const result = await service.upsertMapFeedback(ids.map, ids.mapVersion, 10, {
      difficulty: 4, resource_sufficiency: 3, balance: 5, body: 'Good cooperative map',
    });

    expect(result).toEqual({
      resource_public_id: ids.map,
      version_public_id: ids.mapVersion,
      aggregate: { feedback_count: 4, difficulty_average: 3.5, resource_sufficiency_average: 4, balance_average: 3.25, multiplayer_experience_average: null },
    });
    expect(managerQuery).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO map_feedback'), expect.arrayContaining([1, 11, 10, 4, 3, 5]));
    expect(managerQuery).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO operation_logs'), expect.any(Array));
    expect(managerQuery).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO resource_review_events'), expect.any(Array));
  });

  it('requires current phone verification before community submissions', async () => {
    const { service, dataSource } = createHarness({ phoneVerified: false });
    await expect(service.upsertMapFeedback(ids.map, ids.mapVersion, 10, { difficulty: 3 }))
      .rejects.toMatchObject({ response: { code: 'PHONE_VERIFICATION_REQUIRED' } });
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('submits or replaces the current per-user Mod compatibility report and supports explicit updates', async () => {
    const { service, managerQuery } = createHarness();
    const created = await service.submitModCompatibilityReport(ids.modA, ids.modAVersion, 10, {
      status: 'performance', game_version: 'v160.2', platform_key: 'linux-x64', runtime: 'java', body: 'Low FPS in campaign',
      attachments: [{ kind: 'log', name: 'client.log', size_bytes: 200, mime_type: 'text/plain' }],
    });
    expect(created).toEqual({ public_id: ids.compatibilityReport, resource_public_id: ids.modA, version_public_id: ids.modAVersion, status: 'performance' });
    expect(managerQuery).toHaveBeenCalledWith(expect.stringContaining('ON DUPLICATE KEY UPDATE'), expect.arrayContaining([2, 12, 10]));
    const update = await service.updateModCompatibilityReport(ids.compatibilityReport, 10, { status: 'working', game_version: 'v160.2' });
    expect(update).toMatchObject({ public_id: ids.compatibilityReport, resource_public_id: ids.modA, status: 'working' });
    expect(managerQuery).toHaveBeenCalledWith(expect.stringContaining('UPDATE mod_compatibility_reports SET'), expect.any(Array));
  });

  it('submits and updates Mod issue reports while persisting only whitelisted attachment metadata', async () => {
    const { service, managerQuery } = createHarness();
    const report = await service.submitModIssueReport(ids.modA, ids.modAVersion, 10, {
      title: 'Client crash', body: 'Crashes on load',
      attachments: [{ kind: 'image', name: 'crash.png', size_bytes: 1024, mime_type: 'image/png', sha256: 'a'.repeat(64) }],
    });
    expect(report).toMatchObject({ resource_public_id: ids.modA, version_public_id: ids.modAVersion, status: 'open' });
    const insertCall = managerQuery.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO mod_issue_reports'));
    expect(insertCall?.[0]).toContain('ON DUPLICATE KEY UPDATE');
    expect(report.public_id).toBe(ids.issueReport);
    expect(JSON.parse(String(insertCall?.[1]?.[6]))).toEqual([{ kind: 'image', name: 'crash.png', size_bytes: 1024, mime_type: 'image/png', sha256: 'a'.repeat(64) }]);
    const repeated = await service.submitModIssueReport(ids.modA, ids.modAVersion, 10, { title: 'Updated crash', body: 'More details' });
    expect(repeated.public_id).toBe(ids.issueReport);
    await service.updateModIssueReport(ids.issueReport, 10, { title: 'Updated title', body: 'More steps to reproduce' });
    expect(managerQuery).toHaveBeenCalledWith(expect.stringContaining('UPDATE mod_issue_reports SET'), expect.any(Array));
    await expect(service.submitModIssueReport(ids.modA, ids.modAVersion, 10, {
      title: 'Unsafe attachment', body: 'x', attachments: [{ kind: 'log', name: '../../secret', size_bytes: 1 }],
    })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('allows only an owner or active maintainer to respond and validates fixed releases', async () => {
    const { service, managerQuery } = createHarness({ authorRole: 'maintainer' });
    const result = await service.respondToModCompatibilityReport(ids.compatibilityReport, 10, {
      author_response_status: 'fixed', author_response: 'Fixed in the next release', fixed_resource_version_public_id: ids.modAVersion,
    });
    expect(result).toMatchObject({ public_id: ids.compatibilityReport, author_response_status: 'fixed', fixed_resource_version_public_id: ids.modAVersion });
    expect(managerQuery).toHaveBeenCalledWith(expect.stringContaining('UPDATE mod_compatibility_reports SET author_response_status'), expect.arrayContaining(['fixed', 'Fixed in the next release', 12]));
    await service.respondToModIssueReport(ids.issueReport, 10, { author_response_status: 'not_mod_issue', author_response: 'This comes from the base game.' });
    await service.respondToModIssueReport(ids.issueReport, 10, { author_response_status: 'confirmed' });
    await service.respondToModIssueReport(ids.issueReport, 10, { author_response_status: 'cannot_reproduce' });
    const owner = createHarness({ authorRole: 'owner' });
    await expect(owner.service.respondToModIssueReport(ids.issueReport, 10, { author_response_status: 'confirmed' })).resolves.toMatchObject({ author_response_status: 'confirmed' });

    const hiddenVersion = createHarness({ publishedFixedVersion: false });
    await expect(hiddenVersion.service.respondToModCompatibilityReport(ids.compatibilityReport, 10, {
      author_response_status: 'fixed', fixed_resource_version_public_id: ids.fixedVersion,
    })).rejects.toBeInstanceOf(NotFoundException);
    const unauthorized = createHarness({ authorRole: 'publisher' });
    await expect(unauthorized.service.respondToModIssueReport(ids.issueReport, 10, { author_response_status: 'confirmed' }))
      .rejects.toMatchObject({ response: { code: 'RESOURCE_AUTHOR_REQUIRED' } });
    await expect(service.respondToModIssueReport(ids.issueReport, 10, { author_response_status: 'fixed' }))
      .rejects.toBeInstanceOf(BadRequestException);
    await expect(service.respondToModIssueReport(ids.issueReport, 10, {
      author_response_status: 'confirmed', fixed_resource_version_public_id: ids.modAVersion,
    })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('publishes a multi-Mod conflict report as unverified after resolving distinct public published versions', async () => {
    const { service, managerQuery } = createHarness();
    const result = await service.submitModConflictReport(10, {
      title: 'Mod A conflicts with Mod B',
      body: 'Loading both causes a crash.',
      game_version_min: 'v160', game_version_max: 'v160.2',
      members: [
        { resource_public_id: ids.modA, version_public_id: ids.modAVersion, version_constraint: '>=1.0' },
        { resource_public_id: ids.modB, version_public_id: ids.modBVersion, version_constraint: '^2.0' },
      ],
    });
    expect(result).toEqual({
      public_id: expect.any(String), status: 'unverified',
      members: [
        { resource_public_id: ids.modA, version_public_id: ids.modAVersion, version_constraint: '>=1.0' },
        { resource_public_id: ids.modB, version_public_id: ids.modBVersion, version_constraint: '^2.0' },
      ],
    });
    expect(managerQuery).toHaveBeenCalledWith(expect.stringContaining("VALUES (?,?,'unverified'"), expect.any(Array));
    expect(managerQuery.mock.calls.filter(([sql]) => String(sql).includes('INSERT INTO mod_conflict_members'))).toHaveLength(2);
  });

  it('requires distinct conflict members and author membership, and validates any fixed Mod release as public and published', async () => {
    const { service } = createHarness();
    await expect(service.submitModConflictReport(10, {
      members: [{ resource_public_id: ids.modA, version_public_id: ids.modAVersion }, { resource_public_id: ids.modA, version_public_id: ids.modAVersion }],
    })).rejects.toBeInstanceOf(BadRequestException);

    await expect(service.respondToModConflictReport(ids.conflictReport, 99, { author_response_status: 'confirmed' }))
      .rejects.toMatchObject({ response: { code: 'RESOURCE_AUTHOR_REQUIRED' } });

    const hiddenFixed = createHarness({ publishedFixedVersion: false });
    await expect(hiddenFixed.service.respondToModConflictReport(ids.conflictReport, 10, {
      author_response_status: 'fixed', fixed_resource_public_id: ids.fixedResource, fixed_resource_version_public_id: ids.fixedVersion,
    })).rejects.toBeInstanceOf(NotFoundException);

    const fixed = await service.respondToModConflictReport(ids.conflictReport, 10, {
      author_response_status: 'fixed', author_response: 'Released a compatibility patch',
      fixed_resource_public_id: ids.fixedResource, fixed_resource_version_public_id: ids.fixedVersion,
    });
    expect(fixed).toMatchObject({ public_id: ids.conflictReport, author_response_status: 'fixed', fixed_resource_version_public_id: ids.fixedVersion });
  });
});
