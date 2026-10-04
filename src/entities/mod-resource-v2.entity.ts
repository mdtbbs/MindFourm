import {
  Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn,
} from 'typeorm';

@Entity('mod_profiles')
@Index('uq_mod_profiles_resource', ['resource_id'], { unique: true })
@Index('uq_mod_profiles_mod_id', ['mod_id'], { unique: true })
export class ModProfile {
  @PrimaryGeneratedColumn() id: number;
  @Column({ type: 'int' }) resource_id: number;
  @Column({ type: 'varchar', length: 191 }) mod_id: string;
  @Column({ type: 'varchar', length: 255, nullable: true }) display_name: string | null;
  @Column({ type: 'varchar', length: 24, nullable: true }) runtime_type: 'java' | 'js' | 'hybrid' | 'content' | null;
  @Column({ type: 'text', nullable: true }) description: string | null;
  @Column({ type: 'varchar', length: 500, nullable: true }) upstream_url: string | null;
  @CreateDateColumn({ type: 'datetime' }) created_at: Date;
  @UpdateDateColumn({ type: 'datetime' }) updated_at: Date;
}

@Entity('mod_id_aliases')
@Index('uq_mod_id_aliases_alias', ['alias'], { unique: true })
@Index('idx_mod_id_aliases_resource', ['resource_id'])
export class ModIdAlias {
  @PrimaryGeneratedColumn() id: number;
  @Column({ type: 'int' }) resource_id: number;
  @Column({ type: 'varchar', length: 191 }) alias: string;
  @Column({ type: 'int', nullable: true }) created_by_user_id: number | null;
  @CreateDateColumn({ type: 'datetime' }) created_at: Date;
}

@Entity('mod_version_metadata')
@Index('uq_mod_version_metadata_version', ['resource_version_id'], { unique: true })
export class ModVersionMetadata {
  @PrimaryGeneratedColumn() id: number;
  @Column({ type: 'int' }) resource_version_id: number;
  @Column({ type: 'varchar', length: 100, nullable: true }) parser_version: string | null;
  @Column({ type: 'varchar', length: 24, nullable: true }) runtime_type: string | null;
  @Column({ type: 'varchar', length: 255, nullable: true }) manifest_name: string | null;
  @Column({ type: 'varchar', length: 255, nullable: true }) display_name: string | null;
  @Column({ type: 'varchar', length: 255, nullable: true }) author: string | null;
  @Column({ type: 'varchar', length: 100, nullable: true }) version: string | null;
  @Column({ type: 'varchar', length: 80, nullable: true }) min_game_version: string | null;
  @Column({ type: 'text', nullable: true }) description: string | null;
  @Column({ type: 'varchar', length: 255, nullable: true }) main_class: string | null;
  @Column({ type: 'varchar', length: 255, nullable: true }) package_name: string | null;
  @Column({ type: 'json', nullable: true }) archive_files_json: Array<Record<string, unknown>> | null;
  @Column({ type: 'json', nullable: true }) parsed_manifest_json: Record<string, unknown> | null;
  @Column({ type: 'json', nullable: true }) author_overrides_json: Record<string, unknown> | null;
  @CreateDateColumn({ type: 'datetime' }) created_at: Date;
  @UpdateDateColumn({ type: 'datetime' }) updated_at: Date;
}

@Entity('mod_contents')
@Index('uq_mod_contents_public_id', ['public_id'], { unique: true })
@Index('uq_mod_contents_identity', ['resource_version_id', 'content_type', 'internal_name'], { unique: true })
@Index('idx_mod_contents_name', ['content_type', 'internal_name'])
export class ModContent {
  @PrimaryGeneratedColumn() id: number;
  @Column({ type: 'char', length: 36 }) public_id: string;
  @Column({ type: 'int' }) resource_version_id: number;
  @Column({ type: 'varchar', length: 32 }) content_type: string;
  @Column({ type: 'varchar', length: 191 }) internal_name: string;
  @Column({ type: 'varchar', length: 255, nullable: true }) display_name: string | null;
  @Column({ type: 'text', nullable: true }) description: string | null;
  @Column({ type: 'varchar', length: 500, nullable: true }) icon_key: string | null;
  @Column({ type: 'json', nullable: true }) properties_json: Record<string, unknown> | null;
  @CreateDateColumn({ type: 'datetime' }) created_at: Date;
}

@Entity('mod_content_aliases')
@Index('uq_mod_content_aliases_identity', ['resource_id', 'content_type', 'old_internal_name'], { unique: true })
@Index('idx_mod_content_aliases_target', ['resource_id', 'content_type', 'new_internal_name'])
export class ModContentAlias {
  @PrimaryGeneratedColumn() id: number;
  @Column({ type: 'int' }) resource_id: number;
  @Column({ type: 'varchar', length: 32 }) content_type: string;
  @Column({ type: 'varchar', length: 191 }) old_internal_name: string;
  @Column({ type: 'varchar', length: 191 }) new_internal_name: string;
  @Column({ type: 'int', nullable: true }) created_by_user_id: number | null;
  @CreateDateColumn({ type: 'datetime' }) created_at: Date;
}

@Entity('mod_localizations')
@Index('uq_mod_localizations_locale', ['resource_version_id', 'locale'], { unique: true })
export class ModLocalization {
  @PrimaryGeneratedColumn() id: number;
  @Column({ type: 'int' }) resource_version_id: number;
  @Column({ type: 'varchar', length: 32 }) locale: string;
  @Column({ type: 'int', unsigned: true, default: 0 }) translated_count: number;
  @Column({ type: 'int', unsigned: true, default: 0 }) total_count: number;
  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0 }) percentage: number;
  @Column({ type: 'json', nullable: true }) missing_keys_json: string[] | null;
  @CreateDateColumn({ type: 'datetime' }) created_at: Date;
  @UpdateDateColumn({ type: 'datetime' }) updated_at: Date;
}

@Entity('mod_compatibility_reports')
@Index('uq_mod_compatibility_reports_public_id', ['public_id'], { unique: true })
@Index('uq_mod_compatibility_reports_user_version', ['resource_version_id', 'user_id'], { unique: true })
@Index('idx_mod_compatibility_reports_status', ['resource_id', 'status', 'created_at'])
export class ModCompatibilityReport {
  @PrimaryGeneratedColumn() id: number;
  @Column({ type: 'char', length: 36 }) public_id: string;
  @Column({ type: 'int' }) resource_id: number;
  @Column({ type: 'int' }) resource_version_id: number;
  @Column({ type: 'int' }) user_id: number;
  @Column({ type: 'varchar', length: 32 }) status: string;
  @Column({ type: 'varchar', length: 80, nullable: true }) game_version: string | null;
  @Column({ type: 'varchar', length: 50, nullable: true }) platform_key: string | null;
  @Column({ type: 'varchar', length: 24, nullable: true }) runtime: string | null;
  @Column({ type: 'text', nullable: true }) body: string | null;
  @Column({ type: 'json', nullable: true }) attachment_json: unknown[] | null;
  @Column({ type: 'varchar', length: 32, nullable: true }) author_response_status: string | null;
  @Column({ type: 'text', nullable: true }) author_response: string | null;
  @Column({ type: 'int', nullable: true }) fixed_resource_version_id: number | null;
  @CreateDateColumn({ type: 'datetime' }) created_at: Date;
  @UpdateDateColumn({ type: 'datetime' }) updated_at: Date;
}

@Entity('mod_issue_reports')
@Index('uq_mod_issue_reports_public_id', ['public_id'], { unique: true })
@Index('idx_mod_issue_reports_resource_status', ['resource_id', 'status', 'created_at'])
@Index('uq_mod_issue_reports_version_user', ['resource_version_id', 'user_id'], { unique: true })
export class ModIssueReport {
  @PrimaryGeneratedColumn() id: number;
  @Column({ type: 'char', length: 36 }) public_id: string;
  @Column({ type: 'int' }) resource_id: number;
  @Column({ type: 'int' }) resource_version_id: number;
  @Column({ type: 'int' }) user_id: number;
  @Column({ type: 'varchar', length: 32, default: 'open' }) status: string;
  @Column({ type: 'varchar', length: 255 }) title: string;
  @Column({ type: 'text' }) body: string;
  @Column({ type: 'json', nullable: true }) attachment_json: unknown[] | null;
  @Column({ type: 'varchar', length: 32, nullable: true }) author_response_status: string | null;
  @Column({ type: 'text', nullable: true }) author_response: string | null;
  @Column({ type: 'int', nullable: true }) fixed_resource_version_id: number | null;
  @CreateDateColumn({ type: 'datetime' }) created_at: Date;
  @UpdateDateColumn({ type: 'datetime' }) updated_at: Date;
}

@Entity('mod_conflict_reports')
@Index('uq_mod_conflict_reports_public_id', ['public_id'], { unique: true })
@Index('idx_mod_conflict_reports_status', ['status', 'created_at'])
export class ModConflictReport {
  @PrimaryGeneratedColumn() id: number;
  @Column({ type: 'char', length: 36 }) public_id: string;
  @Column({ type: 'int' }) reporter_user_id: number;
  @Column({ type: 'varchar', length: 24, default: 'unverified' }) status: string;
  @Column({ type: 'varchar', length: 255, nullable: true }) title: string | null;
  @Column({ type: 'text', nullable: true }) body: string | null;
  @Column({ type: 'varchar', length: 80, nullable: true }) game_version_min: string | null;
  @Column({ type: 'varchar', length: 80, nullable: true }) game_version_max: string | null;
  @Column({ type: 'varchar', length: 32, nullable: true }) author_response_status: string | null;
  @Column({ type: 'text', nullable: true }) author_response: string | null;
  @Column({ type: 'int', nullable: true }) fixed_resource_version_id: number | null;
  @CreateDateColumn({ type: 'datetime' }) created_at: Date;
  @UpdateDateColumn({ type: 'datetime' }) updated_at: Date;
}

@Entity('mod_conflict_members')
@Index('uq_mod_conflict_members_version', ['conflict_report_id', 'resource_version_id'], { unique: true })
@Index('idx_mod_conflict_members_resource', ['resource_id'])
export class ModConflictMember {
  @PrimaryGeneratedColumn() id: number;
  @Column({ type: 'int' }) conflict_report_id: number;
  @Column({ type: 'int' }) resource_id: number;
  @Column({ type: 'int' }) resource_version_id: number;
  @Column({ type: 'varchar', length: 255, nullable: true }) version_constraint: string | null;
  @CreateDateColumn({ type: 'datetime' }) created_at: Date;
}
