import { BadRequestException, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DataSource, EntityManager } from 'typeorm';
import {
  ResBindingInventoryItem,
  ResObjectInventoryItem,
  ResourceStorageClientService,
} from './resource-storage-client.service';

type LocalResourceFile = {
  id: number;
  public_id: string | null;
  resource_version_id: number | null;
  storage_backend: string | null;
  provider_object_id: string | null;
  provider_binding_id: string | null;
  content_hash: string | null;
  size_bytes: number | null;
  mime_type: string | null;
  integrity_status: string | null;
  availability_status: string | null;
  resource_public_id: string | null;
  resource_status: string | null;
  resource_is_public: number | boolean | null;
  resource_visibility: string | null;
  resource_deleted_at: Date | string | null;
  version_status: string | null;
};

export type ResourceStorageReconciliationFinding = {
  code: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  repairable: boolean;
  repair_risk: 'none' | 'safe_availability_mark' | 'binding_repoint';
  resource_file_public_id: string | null;
  provider_object_id: string | null;
  provider_binding_id: string | null;
  details: Record<string, unknown>;
};

type RepairResult = {
  code: string;
  resource_file_public_id: string | null;
  status: 'repaired' | 'skipped' | 'failed';
  action: 'marked_unavailable' | 'rebound' | 'none';
};

const RES_NAMESPACE = 'mindforum';
const RES_OWNER_TYPE = 'resource_file';
const PUBLIC_RESOURCE_STATUSES = new Set(['approved', 'published']);

@Injectable()
export class ResourceStorageReconciliationService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly storage: ResourceStorageClientService,
  ) {}

  async scan(input: { repair?: boolean; confirm?: boolean; limit?: number }, actorId: number): Promise<{
    run_id: string;
    scanned_at: string;
    repair_requested: boolean;
    truncated: boolean;
    counts: { local_files: number; provider_objects: number; provider_bindings: number; findings: number; by_code: Record<string, number> };
    findings: ResourceStorageReconciliationFinding[];
    repairs: RepairResult[];
  }> {
    const repairRequested = input.repair === true;
    if (repairRequested && input.confirm !== true) {
      throw new BadRequestException({ code: 'RESOURCE_STORAGE_REPAIR_CONFIRM_REQUIRED', message: '修复资源存储对账问题必须同时提供 confirm=true' });
    }
    const runId = randomUUID();
    const limit = Math.min(10_000, Math.max(1, Math.trunc(Number(input.limit)) || 1_000));
    await this.writeAudit(actorId, 'resource.storage.reconciliation.requested', runId, {
      repair_requested: repairRequested,
      confirmed: input.confirm === true,
      limit,
    });

    const localResult = await this.loadLocalFiles(limit);
    const [objects, bindings] = await Promise.all([
      this.loadObjects(),
      this.loadBindings(),
    ]);
    const objectByPublicId = new Map(objects.map((object) => [object.public_id, object]));
    const bindingById = new Map(bindings.map((binding) => [binding.binding_id, binding]));
    const bindingByOwner = new Map(bindings.map((binding) => [binding.owner_id, binding]));
    const localByPublicId = new Map(localResult.items.filter((file) => file.public_id).map((file) => [file.public_id!, file]));
    const findings: ResourceStorageReconciliationFinding[] = [];

    for (const file of localResult.items) {
      this.inspectLocalFile(file, objectByPublicId, bindingById, bindingByOwner, findings);
    }

    // Absence-based findings are only valid when the local inventory is complete.
    // A bounded/truncated local scan cannot prove that a provider owner is orphaned.
    if (!localResult.truncated) {
      for (const binding of bindings) {
        if (!localByPublicId.has(binding.owner_id)) {
          findings.push(this.finding('orphan_binding', 'error', false, 'none', null, binding.object_public_id, binding.binding_id, {
            owner_id: binding.owner_id,
            namespace: binding.namespace,
            owner_type: binding.owner_type,
          }));
        }
      }
      const resourceFileObjectIds = new Set(localResult.items.map((file) => file.provider_object_id).filter(Boolean));
      const resourceBindingsByObject = new Set(bindings.map((binding) => binding.object_public_id));
      for (const object of objects) {
        if (!resourceFileObjectIds.has(object.public_id) && !resourceBindingsByObject.has(object.public_id) && object.binding_count === 0) {
          findings.push(this.finding('orphan_object', 'warning', false, 'none', null, object.public_id, null, {
            object_state: object.state,
            sha256: object.sha256,
            size_bytes: object.size_bytes,
          }));
        }
      }
    }

    const repairs: RepairResult[] = [];
    if (repairRequested) {
      for (const finding of findings.filter((item) => item.repairable)) {
        const file = finding.resource_file_public_id ? localByPublicId.get(finding.resource_file_public_id) : undefined;
        const result = await this.repairFinding(finding, file, objectByPublicId);
        repairs.push(result);
      }
    }

    const byCode = findings.reduce<Record<string, number>>((counts, finding) => {
      counts[finding.code] = (counts[finding.code] || 0) + 1;
      return counts;
    }, {});
    const report = {
      run_id: runId,
      scanned_at: new Date().toISOString(),
      repair_requested: repairRequested,
      truncated: localResult.truncated,
      counts: {
        local_files: localResult.items.length,
        provider_objects: objects.length,
        provider_bindings: bindings.length,
        findings: findings.length,
        by_code: byCode,
      },
      findings,
      repairs,
    };
    await this.writeAudit(actorId, 'resource.storage.reconciliation.completed', runId, {
      repair_requested: repairRequested,
      findings: findings.length,
      repairs: repairs.filter((repair) => repair.status === 'repaired').length,
      truncated: localResult.truncated,
      by_code: byCode,
    });
    return report;
  }

  private async loadLocalFiles(limit: number): Promise<{ items: LocalResourceFile[]; truncated: boolean }> {
    const rows = await this.dataSource.query(
      `SELECT f.id, f.public_id, f.resource_version_id, f.storage_backend, f.provider_object_id, f.provider_binding_id,
              f.content_hash, f.size_bytes, f.mime_type, f.integrity_status, f.availability_status,
              r.public_id AS resource_public_id, r.status AS resource_status, r.is_public AS resource_is_public,
              r.visibility AS resource_visibility, r.deleted_at AS resource_deleted_at,
              v.status AS version_status
       FROM resource_files f
       LEFT JOIN resource_versions v ON v.id=f.resource_version_id
       LEFT JOIN resources r ON r.id=v.resource_id
       WHERE f.storage_backend='res'
       ORDER BY f.id ASC
       LIMIT ?`,
      [limit + 1],
    ) as LocalResourceFile[];
    return { items: rows.slice(0, limit), truncated: rows.length > limit };
  }

  private async loadObjects(): Promise<ResObjectInventoryItem[]> {
    const items: ResObjectInventoryItem[] = [];
    let after: string | undefined;
    const seen = new Set<string>();
    for (let page = 0; page < 10_000; page += 1) {
      const result = await this.storage.listAdminObjectInventory({ limit: 100, ...(after ? { after } : {}) });
      items.push(...result.items);
      if (!result.next_cursor || seen.has(result.next_cursor)) break;
      seen.add(result.next_cursor);
      after = result.next_cursor;
      if (result.items.length === 0) break;
    }
    return items;
  }

  private async loadBindings(): Promise<ResBindingInventoryItem[]> {
    const items: ResBindingInventoryItem[] = [];
    let after: string | undefined;
    const seen = new Set<string>();
    for (let page = 0; page < 10_000; page += 1) {
      const result = await this.storage.listAdminBindingInventory({ namespace: RES_NAMESPACE, ownerType: RES_OWNER_TYPE, limit: 100, ...(after ? { after } : {}) });
      items.push(...result.items);
      if (!result.next_cursor || seen.has(result.next_cursor)) break;
      seen.add(result.next_cursor);
      after = result.next_cursor;
      if (result.items.length === 0) break;
    }
    return items;
  }

  private inspectLocalFile(
    file: LocalResourceFile,
    objects: Map<string, ResObjectInventoryItem>,
    bindings: Map<string, ResBindingInventoryItem>,
    bindingsByOwner: Map<string, ResBindingInventoryItem>,
    findings: ResourceStorageReconciliationFinding[],
  ): void {
    const base = { resource_file_public_id: file.public_id, provider_object_id: file.provider_object_id, provider_binding_id: file.provider_binding_id };
    if (!file.public_id || !file.resource_version_id || !file.resource_public_id || !file.version_status || !file.resource_status) {
      findings.push({ ...this.finding('dangling_resource_file', 'critical', true, 'safe_availability_mark', file.public_id, file.provider_object_id, file.provider_binding_id, {
        resource_version_id: file.resource_version_id,
        resource_public_id: file.resource_public_id,
        version_status: file.version_status,
      }), ...base });
      return;
    }
    if (!file.provider_object_id) {
      findings.push(this.finding('missing_object', 'critical', false, 'none', file.public_id, null, file.provider_binding_id, { reason: 'provider_object_id_missing' }));
      return;
    }
    const object = objects.get(file.provider_object_id);
    if (!object) {
      findings.push(this.finding('missing_object', 'critical', true, 'safe_availability_mark', file.public_id, file.provider_object_id, file.provider_binding_id, {}));
      return;
    }
    if (object.state !== 'verified') {
      findings.push(this.finding('object_unavailable', 'critical', true, 'safe_availability_mark', file.public_id, object.public_id, file.provider_binding_id, { object_state: object.state }));
    }
    if (file.content_hash && file.content_hash.toLowerCase() !== object.sha256.toLowerCase()) {
      findings.push(this.finding('hash_mismatch', 'critical', true, 'safe_availability_mark', file.public_id, object.public_id, file.provider_binding_id, { local: file.content_hash, provider: object.sha256 }));
    }
    if (file.size_bytes !== null && Number(file.size_bytes) !== object.size_bytes) {
      findings.push(this.finding('size_mismatch', 'critical', true, 'safe_availability_mark', file.public_id, object.public_id, file.provider_binding_id, { local: file.size_bytes, provider: object.size_bytes }));
    }
    if (file.mime_type && file.mime_type !== object.mime_type) {
      findings.push(this.finding('mime_mismatch', 'warning', true, 'safe_availability_mark', file.public_id, object.public_id, file.provider_binding_id, { local: file.mime_type, provider: object.mime_type }));
    }
    const ownerBinding = bindingsByOwner.get(file.public_id);
    const exactBinding = file.provider_binding_id ? bindings.get(file.provider_binding_id) : undefined;
    if (!ownerBinding) {
      findings.push(this.finding('missing_binding', 'critical', true, 'binding_repoint', file.public_id, object.public_id, file.provider_binding_id, {}));
    } else {
      if (!file.provider_binding_id || ownerBinding.binding_id !== file.provider_binding_id
        || ownerBinding.object_public_id !== object.public_id || (exactBinding && exactBinding.owner_id !== file.public_id)) {
        findings.push(this.finding('binding_owner_mismatch', 'critical', true, 'binding_repoint', file.public_id, object.public_id, file.provider_binding_id, {
          binding_object_public_id: ownerBinding.object_public_id,
          binding_owner_id: ownerBinding.owner_id,
          expected_owner_id: file.public_id,
        }));
      }
      const expectedVisibility = this.expectedVisibility(file);
      if (ownerBinding.visibility !== expectedVisibility) {
        findings.push(this.finding('publication_mismatch', 'error', true, 'binding_repoint', file.public_id, object.public_id, ownerBinding.binding_id, {
          expected_visibility: expectedVisibility,
          provider_visibility: ownerBinding.visibility,
        }));
      }
      if (file.provider_binding_id && exactBinding && exactBinding.binding_id !== ownerBinding.binding_id) {
        findings.push(this.finding('stale_binding_reference', 'error', true, 'binding_repoint', file.public_id, object.public_id, file.provider_binding_id, {
          owner_binding_id: ownerBinding.binding_id,
        }));
      }
    }
    if (file.availability_status === 'available' && object.state !== 'verified') {
      findings.push(this.finding('availability_mismatch', 'error', true, 'safe_availability_mark', file.public_id, object.public_id, file.provider_binding_id, {
        local_availability: file.availability_status,
        object_state: object.state,
      }));
    }
  }

  private expectedVisibility(file: LocalResourceFile): 'public' | 'private' {
    const publicFile = !file.resource_deleted_at
      && PUBLIC_RESOURCE_STATUSES.has(String(file.resource_status))
      && Number(file.resource_is_public) === 1
      && file.resource_visibility !== 'private'
      && file.version_status === 'published';
    return publicFile ? 'public' : 'private';
  }

  private finding(
    code: string,
    severity: ResourceStorageReconciliationFinding['severity'],
    repairable: boolean,
    repairRisk: ResourceStorageReconciliationFinding['repair_risk'],
    resourceFilePublicId: string | null,
    providerObjectId: string | null,
    providerBindingId: string | null,
    details: Record<string, unknown>,
  ): ResourceStorageReconciliationFinding {
    return {
      code,
      severity,
      repairable,
      repair_risk: repairRisk,
      resource_file_public_id: resourceFilePublicId,
      provider_object_id: providerObjectId,
      provider_binding_id: providerBindingId,
      details,
    };
  }

  private async repairFinding(
    finding: ResourceStorageReconciliationFinding,
    file: LocalResourceFile | undefined,
    objects: Map<string, ResObjectInventoryItem>,
  ): Promise<RepairResult> {
    if (!file || !finding.repairable) return { code: finding.code, resource_file_public_id: finding.resource_file_public_id, status: 'skipped', action: 'none' };
    const unavailableCodes = new Set(['dangling_resource_file', 'missing_object', 'object_unavailable', 'hash_mismatch', 'size_mismatch', 'mime_mismatch', 'availability_mismatch']);
    if (unavailableCodes.has(finding.code)) {
      await this.dataSource.query(
        `UPDATE resource_files SET availability_status='unavailable' WHERE id=? AND storage_backend='res'`,
        [file.id],
      );
      return { code: finding.code, resource_file_public_id: finding.resource_file_public_id, status: 'repaired', action: 'marked_unavailable' };
    }
    if (!['missing_binding', 'binding_owner_mismatch', 'publication_mismatch', 'stale_binding_reference'].includes(finding.code)
      || !file.public_id || !file.provider_object_id) {
      return { code: finding.code, resource_file_public_id: finding.resource_file_public_id, status: 'skipped', action: 'none' };
    }
    const object = objects.get(file.provider_object_id);
    if (!object || object.state !== 'verified') return { code: finding.code, resource_file_public_id: finding.resource_file_public_id, status: 'skipped', action: 'none' };
    try {
      const binding = await this.storage.createBinding(object.public_id, {
        namespace: RES_NAMESPACE,
        owner_type: RES_OWNER_TYPE,
        owner_id: file.public_id,
        visibility: this.expectedVisibility(file),
      });
      await this.dataSource.transaction(async (manager: EntityManager) => {
        // Binding repair must never promote local availability. Integrity and
        // object-health findings own that state, so leave it untouched here.
        await manager.query(
          `UPDATE resource_files SET provider_binding_id=? WHERE id=? AND storage_backend='res'`,
          [binding.id, file.id],
        );
      });
      return { code: finding.code, resource_file_public_id: finding.resource_file_public_id, status: 'repaired', action: 'rebound' };
    } catch {
      return { code: finding.code, resource_file_public_id: finding.resource_file_public_id, status: 'failed', action: 'none' };
    }
  }

  private async writeAudit(actorId: number, action: string, runId: string, details: Record<string, unknown>): Promise<void> {
    await this.dataSource.query(
      `INSERT INTO operation_logs (user_id,action,target_type,target_id,details,created_at)
       VALUES (?,?,?,?,?,NOW())`,
      [Number.isSafeInteger(actorId) ? actorId : null, action, 'resource_storage_reconciliation', null, JSON.stringify({ run_id: runId, ...details })],
    );
  }
}
