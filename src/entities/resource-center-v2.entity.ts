import {
  Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn,
} from 'typeorm';

@Entity('resource_members')
@Index('uq_resource_members_resource_user', ['resource_id', 'user_id'], { unique: true })
@Index('idx_resource_members_user_status', ['user_id', 'status'])
export class ResourceMember {
  @PrimaryGeneratedColumn() id: number;
  @Column({ type: 'int' }) resource_id: number;
  @Column({ type: 'int' }) user_id: number;
  @Column({ type: 'varchar', length: 24 }) role: 'owner' | 'maintainer' | 'publisher';
  @Column({ type: 'varchar', length: 24, default: 'active' }) status: 'invited' | 'active' | 'revoked';
  @Column({ type: 'int', nullable: true }) invited_by_user_id: number | null;
  @Column({ type: 'datetime', nullable: true }) accepted_at: Date | null;
  @CreateDateColumn({ type: 'datetime' }) created_at: Date;
  @UpdateDateColumn({ type: 'datetime' }) updated_at: Date;
}

@Entity('resource_relations')
@Index('uq_resource_relations_pair_context', ['source_resource_id', 'target_resource_id', 'relation_type', 'relation_context'], { unique: true })
@Index('idx_resource_relations_target', ['target_resource_id', 'relation_type'])
export class ResourceRelation {
  @PrimaryGeneratedColumn() id: number;
  @Column({ type: 'int' }) source_resource_id: number;
  @Column({ type: 'int' }) target_resource_id: number;
  @Column({ type: 'int', nullable: true }) source_version_id: number | null;
  @Column({ type: 'int', nullable: true }) target_version_id: number | null;
  @Column({ type: 'varchar', length: 40 }) relation_type: string;
  @Column({ type: 'varchar', length: 32, default: 'general' }) relation_context: 'opening' | 'production' | 'defense' | 'logistics' | 'general';
  @Column({ type: 'int', nullable: true }) created_by_user_id: number | null;
  @CreateDateColumn({ type: 'datetime' }) created_at: Date;
}

@Entity('resource_review_events')
@Index('idx_resource_review_events_resource', ['resource_id', 'created_at', 'id'])
@Index('idx_resource_review_events_version', ['resource_version_id', 'created_at'])
export class ResourceReviewEvent {
  @PrimaryGeneratedColumn() id: number;
  @Column({ type: 'int' }) resource_id: number;
  @Column({ type: 'int', nullable: true }) resource_version_id: number | null;
  @Column({ type: 'int', nullable: true }) actor_user_id: number | null;
  @Column({ type: 'varchar', length: 32 }) event_type: string;
  @Column({ type: 'varchar', length: 32, nullable: true }) result: string | null;
  @Column({ type: 'text', nullable: true }) reason: string | null;
  @CreateDateColumn({ type: 'datetime' }) created_at: Date;
}

@Entity('resource_review_annotations')
@Index('idx_resource_review_annotations_event', ['review_event_id', 'id'])
@Index('idx_resource_review_annotations_resource_field', ['resource_id', 'field_path'])
export class ResourceReviewAnnotation {
  @PrimaryGeneratedColumn() id: number;
  @Column({ type: 'int' }) review_event_id: number;
  @Column({ type: 'int' }) resource_id: number;
  @Column({ type: 'varchar', length: 191 }) field_path: string;
  @Column({ type: 'varchar', length: 16, default: 'INFO' }) severity: 'ERROR' | 'WARNING' | 'INFO';
  @Column({ type: 'text' }) body: string;
  @Column({ type: 'int', nullable: true }) created_by_user_id: number | null;
  @CreateDateColumn({ type: 'datetime' }) created_at: Date;
}

@Entity('resource_analysis_runs')
@Index('idx_resource_analysis_runs_resource', ['resource_id', 'created_at'])
@Index('idx_resource_analysis_runs_version', ['resource_version_id', 'created_at'])
export class ResourceAnalysisRun {
  @PrimaryGeneratedColumn() id: number;
  @Column({ type: 'int' }) resource_id: number;
  @Column({ type: 'int' }) resource_version_id: number;
  @Column({ type: 'varchar', length: 64 }) analyzer: string;
  @Column({ type: 'varchar', length: 100 }) parser_version: string;
  @Column({ type: 'varchar', length: 24, default: 'completed' }) status: string;
  @Column({ type: 'json', nullable: true }) summary_json: Record<string, unknown> | null;
  @Column({ type: 'json', nullable: true }) findings_json: unknown[] | null;
  @Column({ type: 'datetime', nullable: true }) started_at: Date | null;
  @Column({ type: 'datetime', nullable: true }) completed_at: Date | null;
  @CreateDateColumn({ type: 'datetime' }) created_at: Date;
}

@Entity('resource_analysis_overrides')
@Index('uq_resource_analysis_override_finding', ['analysis_run_id', 'finding_key'], { unique: true })
export class ResourceAnalysisOverride {
  @PrimaryGeneratedColumn() id: number;
  @Column({ type: 'int' }) analysis_run_id: number;
  @Column({ type: 'varchar', length: 191 }) finding_key: string;
  @Column({ type: 'int' }) actor_user_id: number;
  @Column({ type: 'text' }) reason: string;
  @CreateDateColumn({ type: 'datetime' }) created_at: Date;
}

@Entity('resource_compatibilities')
@Index('idx_resource_compatibilities_version_source', ['resource_version_id', 'source'])
@Index('idx_resource_compatibilities_game_version', ['runtime', 'game_version', 'platform_key'])
@Index('uq_resource_compatibilities_legacy', ['legacy_source_id'], { unique: true })
export class ResourceCompatibility {
  @PrimaryGeneratedColumn() id: number;
  @Column({ type: 'int' }) resource_version_id: number;
  @Column({ type: 'varchar', length: 24 }) source: 'author' | 'analyzer' | 'community';
  @Column({ type: 'varchar', length: 50, default: 'mindustry' }) runtime: string;
  @Column({ type: 'varchar', length: 50, nullable: true }) platform_key: string | null;
  @Column({ type: 'varchar', length: 80, nullable: true }) game_version: string | null;
  @Column({ type: 'varchar', length: 80, nullable: true }) min_game_version: string | null;
  @Column({ type: 'varchar', length: 80, nullable: true }) max_game_version: string | null;
  @Column({ type: 'varchar', length: 50, nullable: true }) channel: string | null;
  @Column({ type: 'varchar', length: 32, nullable: true }) status: string | null;
  @Column({ type: 'varchar', length: 16, nullable: true }) confidence: 'low' | 'medium' | 'high' | null;
  @Column({ type: 'text', nullable: true }) notes: string | null;
  @Column({ type: 'int', nullable: true }) created_by_user_id: number | null;
  @Column({ type: 'int', nullable: true, unique: true }) legacy_source_id: number | null;
  @CreateDateColumn({ type: 'datetime' }) created_at: Date;
}

@Entity('resource_dependencies')
@Index('idx_resource_dependencies_version_type', ['resource_version_id', 'dependency_type'])
@Index('idx_resource_dependencies_target', ['target_resource_id'])
@Index('uq_resource_dependencies_legacy', ['legacy_source_id'], { unique: true })
export class ResourceDependency {
  @PrimaryGeneratedColumn() id: number;
  @Column({ type: 'int' }) resource_version_id: number;
  @Column({ type: 'varchar', length: 24 }) dependency_type: 'required' | 'optional' | 'incompatible' | 'embedded';
  @Column({ type: 'int', nullable: true }) target_resource_id: number | null;
  @Column({ type: 'varchar', length: 255, nullable: true }) external_identifier: string | null;
  @Column({ type: 'varchar', length: 500, nullable: true }) upstream_url: string | null;
  @Column({ type: 'varchar', length: 255, nullable: true }) version_constraint: string | null;
  @Column({ type: 'varchar', length: 24, default: 'unresolved' }) resolution_status: string;
  @Column({ type: 'text', nullable: true }) notes: string | null;
  @Column({ type: 'int', unsigned: true, default: 0 }) sort_order: number;
  @Column({ type: 'int', nullable: true, unique: true }) legacy_source_id: number | null;
  @CreateDateColumn({ type: 'datetime' }) created_at: Date;
}

@Entity('resource_version_diffs')
@Index('uq_resource_version_diffs_pair', ['from_version_id', 'to_version_id'], { unique: true })
@Index('idx_resource_version_diffs_resource', ['resource_id', 'created_at'])
export class ResourceVersionDiff {
  @PrimaryGeneratedColumn() id: number;
  @Column({ type: 'int' }) resource_id: number;
  @Column({ type: 'int' }) from_version_id: number;
  @Column({ type: 'int' }) to_version_id: number;
  @Column({ type: 'json' }) diff_json: Record<string, unknown>;
  @Column({ type: 'varchar', length: 100 }) parser_version: string;
  @Column({ type: 'varchar', length: 24, default: 'completed' }) status: string;
  @CreateDateColumn({ type: 'datetime' }) created_at: Date;
}

@Entity('resource_source_syncs')
@Index('uq_resource_source_syncs_provider_repo', ['resource_id', 'provider', 'repository_url'], { unique: true })
@Index('idx_resource_source_syncs_poll', ['enabled', 'last_polled_at'])
export class ResourceSourceSync {
  @PrimaryGeneratedColumn() id: number;
  @Column({ type: 'int' }) resource_id: number;
  @Column({ type: 'varchar', length: 32 }) provider: string;
  @Column({ type: 'varchar', length: 500 }) repository_url: string;
  @Column({ type: 'tinyint', unsigned: true, default: 0 }) enabled: number;
  @Column({ type: 'tinyint', unsigned: true, default: 1 }) stable_only: number;
  @Column({ type: 'tinyint', unsigned: true, default: 0 }) include_prerelease: number;
  @Column({ type: 'json', nullable: true }) asset_include_json: string[] | null;
  @Column({ type: 'json', nullable: true }) asset_exclude_json: string[] | null;
  @Column({ type: 'datetime', nullable: true }) last_polled_at: Date | null;
  @Column({ type: 'varchar', length: 32, nullable: true }) last_status: string | null;
  @Column({ type: 'text', nullable: true }) last_error: string | null;
  @Column({ type: 'varchar', length: 191, nullable: true }) upstream_tag: string | null;
  @CreateDateColumn({ type: 'datetime' }) created_at: Date;
  @UpdateDateColumn({ type: 'datetime' }) updated_at: Date;
}
