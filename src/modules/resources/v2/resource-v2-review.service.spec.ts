import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ResourceV2ReviewService } from './resource-v2-review.service';

const ids = {
  resource: '10000000-0000-4000-8000-000000000001',
  version: '20000000-0000-4000-8000-000000000001',
};

type HarnessOptions = {
  ownerId?: number;
  memberRole?: string | null;
  staffRole?: string;
  versionStatus?: string;
  kind?: string;
  findingSeverity?: string;
};

function createHarness(options: HarnessOptions = {}) {
  const ownerId = options.ownerId ?? 10;
  const versionStatus = options.versionStatus ?? 'published';
  const managerQuery = jest.fn(async (sql: string, parameters: any[] = []) => execute(sql, parameters));
  const outerQuery = jest.fn(async (sql: string, parameters: any[] = []) => execute(sql, parameters));
  const manager = { query: managerQuery };
  const dataSource: any = {
    query: outerQuery,
    transaction: jest.fn(async (callback: (manager: any) => Promise<unknown>) => callback(manager)),
  };
  const service = new ResourceV2ReviewService(dataSource);

  function execute(sql: string, parameters: any[] = []): any {
    if (sql.includes('FROM resources') && sql.includes('WHERE public_id=?')) {
      return parameters[0] === ids.resource ? [{ id: 7, public_id: ids.resource, user_id: ownerId, resource_kind: options.kind || 'mod' }] : [];
    }
    if (sql.includes('FROM resource_members')) {
      return options.memberRole ? [{ role: options.memberRole }] : [];
    }
    if (sql.includes('FROM users WHERE id=?')) return [{ username: 'reviewer', role: options.staffRole || 'member' }];
    if (sql.includes('FROM resource_versions') && sql.includes('WHERE resource_id=? AND public_id=?')) {
      return parameters[1] === ids.version && versionStatus !== 'missing'
        && (!sql.includes("status='published'") || versionStatus === 'published')
        ? [{ id: 17, resource_id: 7, public_id: ids.version, status: versionStatus, version: '1.0.0' }]
        : [];
    }
    if (sql.includes('FROM resource_analysis_runs') && sql.includes('findings_json')) {
      return [{ id: 21, parser_version: 'analyzer-3.2', findings_json: [
        { code: 'missing-dependency', severity: options.findingSeverity || 'WARNING', message: 'Dependency cannot be resolved.' },
        { code: 'unsafe-code', severity: 'ERROR' },
      ] }];
    }
    if (sql.includes('SELECT parser_version FROM resource_analysis_runs')) return [{ parser_version: 'analyzer-3.2' }];
    if (sql.includes('SELECT override.reason')) return [{ reason: 'Known false positive', created_at: new Date('2026-10-05T00:00:00Z'), actor: 'owner-user' }];
    if (sql.includes('SELECT created_at FROM resource_review_annotations')) return [{ created_at: new Date('2026-10-05T01:00:00Z') }];
    if (sql.includes('SELECT id FROM resource_review_events')) return [{ id: 45 }];
    if (sql.includes('FROM resource_review_events event')) return [{
      event_type: 'analysis_finding_ignored', result: 'ignored',
      reason: JSON.stringify({ finding_key: 'missing-dependency', reason: 'Known false positive', parser_version: 'analyzer-3.2' }),
      created_at: new Date('2026-10-05T00:00:00Z'), actor_name: 'owner-user',
      version_public_id: ids.version, latest_parser_version: 'analyzer-3.2',
      field_path: null, annotation_severity: null, annotation_body: null,
    }];
    if (sql.startsWith('DELETE FROM resource_analysis_overrides')) return [{ affectedRows: 1 }];
    if (sql.startsWith('INSERT INTO resource_review_events')) return { insertId: 45 };
    if (sql.startsWith('INSERT INTO resource_review_annotations')) return { affectedRows: 1 };
    if (sql.startsWith('INSERT INTO resource_analysis_overrides')) return { affectedRows: 1 };
    if (sql.startsWith('INSERT INTO operation_logs')) return { affectedRows: 1 };
    return [];
  }

  return { service, dataSource, managerQuery, outerQuery };
}

describe('ResourceV2ReviewService', () => {
  it('sets an ignore only for a matching warning on a published version and preserves actor/parser context', async () => {
    const { service, managerQuery } = createHarness();

    const result = await service.setFindingIgnore(ids.resource, ids.version, 10, {
      finding_key: 'missing-dependency', reason: 'Known false positive',
    });

    expect(result).toMatchObject({
      resource_public_id: ids.resource,
      version_public_id: ids.version,
      finding_key: 'missing-dependency', severity: 'WARNING', ignored: true,
      reason: 'Known false positive', actor: 'owner-user', parser_version: 'analyzer-3.2',
      timestamp: '2026-10-05T00:00:00.000Z',
    });
    expect(managerQuery).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO resource_analysis_overrides'), [21, 'missing-dependency', 10, 'Known false positive']);
    expect(managerQuery).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO resource_review_events'), expect.arrayContaining([
      7, 17, 10, 'analysis_finding_ignored', 'ignored', expect.stringContaining('analyzer-3.2'),
    ]));
    expect(managerQuery).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO operation_logs'), expect.any(Array));
  });

  it('allows an active maintainer and owner to clear an override, recording the event', async () => {
    const { service, managerQuery } = createHarness({ ownerId: 999, memberRole: 'maintainer' });

    const result = await service.clearFindingIgnore(ids.resource, ids.version, 10, {
      finding_key: 'missing-dependency', reason: 'No longer ignored',
    });

    expect(result).toMatchObject({
      resource_public_id: ids.resource, version_public_id: ids.version,
      finding_key: 'missing-dependency', ignored: false, changed: true,
      parser_version: 'analyzer-3.2', reason: 'No longer ignored',
    });
    expect(managerQuery).toHaveBeenCalledWith(expect.stringContaining('DELETE FROM resource_analysis_overrides'), [21, 'missing-dependency']);
    expect(managerQuery).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO resource_review_events'), expect.arrayContaining([
      7, 17, 10, 'analysis_finding_unignored', 'unignored', expect.stringContaining('analyzer-3.2'),
    ]));
  });

  it('rejects non-members, unpublished versions, and INFO findings', async () => {
    const nonMember = createHarness({ ownerId: 999 });
    await expect(nonMember.service.setFindingIgnore(ids.resource, ids.version, 10, {
      finding_key: 'missing-dependency', reason: 'Reason',
    })).rejects.toBeInstanceOf(ForbiddenException);

    const nonPublished = createHarness({ ownerId: 10, versionStatus: 'pending_review' });
    await expect(nonPublished.service.setFindingIgnore(ids.resource, ids.version, 10, {
      finding_key: 'missing-dependency', reason: 'Reason',
    })).rejects.toBeInstanceOf(NotFoundException);

    const informational = createHarness({ findingSeverity: 'INFO' });
    await expect(informational.service.setFindingIgnore(ids.resource, ids.version, 10, {
      finding_key: 'missing-dependency', reason: 'Reason',
    })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('requires an existing finding key and accepts only UUID public identifiers', async () => {
    const { service, managerQuery } = createHarness();
    await expect(service.setFindingIgnore(ids.resource, ids.version, 10, {
      finding_key: 'unknown', reason: 'Reason',
    })).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.setFindingIgnore('17' as any, ids.version, 10, {
      finding_key: 'missing-dependency', reason: 'Reason',
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(managerQuery).not.toHaveBeenCalledWith(expect.stringContaining('INSERT INTO resource_analysis_overrides'), expect.any(Array));
  });

  it('lets moderators create field annotations tied to a version and stores parser context', async () => {
    const { service, managerQuery } = createHarness({ staffRole: 'moderator' });

    const result = await service.addFieldAnnotation(ids.resource, 30, {
      version_public_id: ids.version, field_path: 'manifest.source_url', severity: 'WARNING', body: 'Please verify provenance.',
    });

    expect(result).toEqual({
      resource_public_id: ids.resource, version_public_id: ids.version,
      field_path: 'manifest.source_url', severity: 'WARNING', body: 'Please verify provenance.',
      actor: 'reviewer', timestamp: '2026-10-05T01:00:00.000Z', parser_version: 'analyzer-3.2',
    });
    expect(managerQuery).toHaveBeenCalledWith(expect.stringContaining("'field_annotation'"), expect.arrayContaining([
      7, 17, 30, 'WARNING', expect.stringContaining('analyzer-3.2'),
    ]));
    expect(managerQuery).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO resource_review_annotations'), [45, 7, 'manifest.source_url', 'WARNING', 'Please verify provenance.', 30]);
    expect(managerQuery).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO operation_logs'), expect.any(Array));
    expect(Object.keys(result)).not.toContain('id');
  });

  it('restricts annotations and timeline reads to moderators or resource members and omits numeric IDs', async () => {
    const denied = createHarness({ staffRole: 'member' });
    await expect(denied.service.addFieldAnnotation(ids.resource, 30, {
      field_path: 'title', severity: 'INFO', body: 'Review note',
    })).rejects.toBeInstanceOf(ForbiddenException);

    const outsider = createHarness({ ownerId: 999, memberRole: null, staffRole: 'member' });
    await expect(outsider.service.getReviewTimeline(ids.resource, 30, {})).rejects.toBeInstanceOf(ForbiddenException);

    const member = createHarness({ ownerId: 999, memberRole: 'publisher' });
    const result = await member.service.getReviewTimeline(ids.resource, 10, { limit: 10 });
    expect(result.items[0]).toEqual({
      resource_public_id: ids.resource, version_public_id: ids.version,
      event_type: 'analysis_finding_ignored', result: 'ignored', reason: 'Known false positive',
      finding_key: 'missing-dependency', annotation: null, actor: 'owner-user',
      timestamp: '2026-10-05T00:00:00.000Z', parser_version: 'analyzer-3.2',
    });
    expect(JSON.stringify(result)).not.toMatch(/"(?:id|resource_id|resource_version_id|analysis_run_id)"\s*:/);
  });
});
