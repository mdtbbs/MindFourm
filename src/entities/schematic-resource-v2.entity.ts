import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('schematic_version_metadata')
@Index('uq_schematic_version_metadata_version', ['resource_version_id'], { unique: true })
export class SchematicVersionMetadata {
  @PrimaryGeneratedColumn() id: number;
  @Column({ type: 'int' }) resource_version_id: number;
  @Column({ type: 'varchar', length: 500, nullable: true }) preview_key: string | null;
  @Column({ type: 'int', unsigned: true, nullable: true }) width: number | null;
  @Column({ type: 'int', unsigned: true, nullable: true }) height: number | null;
  @Column({ type: 'int', unsigned: true, nullable: true }) block_count: number | null;
  @Column({ type: 'char', length: 64, nullable: true }) content_hash: string | null;
  @Column({ type: 'char', length: 64, nullable: true }) structure_hash: string | null;
  @Column({ type: 'char', length: 64, nullable: true }) normalized_structure_hash: string | null;
  @Column({ type: 'int', unsigned: true, nullable: true }) min_supported_build: number | null;
  @Column({ type: 'int', nullable: true }) schematic_format_version: number | null;
  @Column({ type: 'varchar', length: 100, nullable: true }) parser_version: string | null;
  @Column({ type: 'json', nullable: true }) dependencies_json: string[] | null;
  @Column({ type: 'json', nullable: true }) source_renderer_metadata_json: Record<string, unknown> | null;
  @Column({ type: 'json', nullable: true }) source_metadata_json: Record<string, unknown> | null;
  @CreateDateColumn({ type: 'datetime' }) created_at: Date;
  @UpdateDateColumn({ type: 'datetime' }) updated_at: Date;
}

@Entity('schematic_blocks')
@Index('uq_schematic_blocks_version_name', ['resource_version_id', 'internal_name'], { unique: true })
export class SchematicBlock {
  @PrimaryGeneratedColumn() id: number;
  @Column({ type: 'int' }) resource_version_id: number;
  @Column({ type: 'varchar', length: 191 }) internal_name: string;
  @Column({ type: 'varchar', length: 255, nullable: true }) display_name: string | null;
  @Column({ type: 'int', unsigned: true, default: 1 }) count: number;
  @Column({ type: 'json', nullable: true }) positions_json: unknown[] | null;
  @Column({ type: 'json', nullable: true }) properties_json: Record<string, unknown> | null;
  @CreateDateColumn({ type: 'datetime' }) created_at: Date;
}

@Entity('schematic_materials')
@Index('uq_schematic_materials_version_item', ['resource_version_id', 'internal_name'], { unique: true })
export class SchematicMaterial {
  @PrimaryGeneratedColumn() id: number;
  @Column({ type: 'int' }) resource_version_id: number;
  @Column({ type: 'varchar', length: 191 }) internal_name: string;
  @Column({ type: 'bigint', unsigned: true, default: 0 }) amount: string | number;
  @CreateDateColumn({ type: 'datetime' }) created_at: Date;
}

@Entity('schematic_logic_processors')
@Index('uq_schematic_logic_processors_position', ['resource_version_id', 'position_x', 'position_y'], { unique: true })
export class SchematicLogicProcessor {
  @PrimaryGeneratedColumn() id: number;
  @Column({ type: 'int' }) resource_version_id: number;
  @Column({ type: 'int', nullable: true }) position_x: number | null;
  @Column({ type: 'int', nullable: true }) position_y: number | null;
  @Column({ type: 'varchar', length: 64, nullable: true }) processor_type: string | null;
  @Column({ type: 'json', nullable: true }) links_json: unknown[] | null;
  @Column({ type: 'json', nullable: true }) variables_json: Record<string, unknown> | null;
  // 源码只是惰性文本：服务端从不编译或执行 mlog，审计结果是静态解析投影。
  @Column({ type: 'mediumtext', nullable: true }) source_code: string | null;
  @Column({ type: 'tinyint', unsigned: true, default: 0 }) source_truncated: number;
  @Column({ type: 'char', length: 64, nullable: true }) source_sha256: string | null;
  @Column({ type: 'int', unsigned: true, default: 0 }) instruction_count: number;
  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true }) estimated_cycle_ticks: string | number | null;
  @Column({ type: 'json', nullable: true }) audit_findings_json: unknown[] | null;
  @CreateDateColumn({ type: 'datetime' }) created_at: Date;
}

/**
 * 公开逻辑片段索引。只由已审核发布蓝图的推荐版本派生；资源不可公开时
 * 必须同步删除，不能把私有/下架/审核中的源码继续暴露在检索里。
 */
@Entity('schematic_logic_snippets')
@Index('uq_schematic_logic_snippets_version_processor', ['resource_version_id', 'processor_key'], { unique: true })
@Index('idx_schematic_logic_snippets_resource', ['resource_id', 'resource_version_id'])
@Index('idx_schematic_logic_snippets_processor_type', ['processor_type'])
@Index('ft_schematic_logic_snippets_searchable', ['searchable_text'], { fulltext: true })
export class SchematicLogicSnippet {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true }) id: string | number;
  @Column({ type: 'int' }) resource_id: number;
  @Column({ type: 'int' }) resource_version_id: number;
  @Column({ type: 'int', nullable: true }) processor_id: number | null;
  @Column({ type: 'varchar', length: 128 }) processor_key: string;
  @Column({ type: 'varchar', length: 64 }) processor_type: string;
  @Column({ type: 'int', nullable: true }) position_x: number | null;
  @Column({ type: 'int', nullable: true }) position_y: number | null;
  @Column({ type: 'int', unsigned: true, default: 0 }) instruction_count: number;
  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true }) estimated_cycle_ticks: string | number | null;
  @Column({ type: 'json', nullable: true }) opcodes_json: string[] | null;
  @Column({ type: 'json', nullable: true }) referenced_units_json: string[] | null;
  @Column({ type: 'json', nullable: true }) referenced_blocks_json: string[] | null;
  @Column({ type: 'tinyint', unsigned: true, default: 0 }) has_warnings: number;
  @Column({ type: 'json', nullable: true }) findings_json: unknown[] | null;
  @Column({ type: 'char', length: 64, nullable: true }) source_sha256: string | null;
  @Column({ type: 'mediumtext', nullable: true }) source_excerpt: string | null;
  @Column({ type: 'mediumtext' }) searchable_text: string;
  @Column({ type: 'int', nullable: true }) author_user_id: number | null;
  @CreateDateColumn({ type: 'datetime' }) created_at: Date;
  @UpdateDateColumn({ type: 'datetime' }) updated_at: Date;
}

@Entity('schematic_analyses')
@Index('uq_schematic_analyses_version', ['resource_version_id'], { unique: true })
export class SchematicAnalysis {
  @PrimaryGeneratedColumn() id: number;
  @Column({ type: 'int' }) resource_version_id: number;
  @Column({ type: 'varchar', length: 100, nullable: true }) parser_version: string | null;
  @Column({ type: 'varchar', length: 24, default: 'completed' }) status: string;
  @Column({ type: 'tinyint', unsigned: true, default: 0 }) complete: number;
  @Column({ type: 'tinyint', unsigned: true, default: 0 }) available: number;
  @Column({ type: 'tinyint', unsigned: true, default: 1 }) estimated: number;
  @Column({ type: 'json', nullable: true }) production_json: Record<string, unknown> | null;
  @Column({ type: 'json', nullable: true }) bottlenecks_json: unknown[] | null;
  @Column({ type: 'json', nullable: true }) warnings_json: unknown[] | null;
  @CreateDateColumn({ type: 'datetime' }) created_at: Date;
  @UpdateDateColumn({ type: 'datetime' }) updated_at: Date;
}
