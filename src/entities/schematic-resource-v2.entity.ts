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
  @CreateDateColumn({ type: 'datetime' }) created_at: Date;
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
