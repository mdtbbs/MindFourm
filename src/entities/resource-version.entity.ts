import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn, Unique, Index,
} from 'typeorm';
import { Resource } from './resource.entity';

// A release may be revised without replacing its previously published file.
// Revision 1 is backfilled for all existing rows by the Resource Center V2 migration.
@Unique('uq_resource_versions_resource_version_revision', ['resource_id', 'version', 'revision'])
@Index('idx_resource_versions_hash_status', ['content_hash', 'status', 'resource_id'])
@Index('idx_resource_versions_recommended', ['resource_id', 'recommended', 'status', 'published_at'])
@Index('idx_resource_versions_channel', ['resource_id', 'release_channel', 'status'])
@Entity('resource_versions')
export class ResourceVersion {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  resource_id: number;

  @Column({ length: 50 })
  version: string;

  @Column({ type: 'varchar', length: 24, default: 'compatibility' })
  version_mode: 'semver' | 'compatibility';

  @Column({ type: 'int', unsigned: true, default: 1 })
  revision: number;

  @Column({ type: 'tinyint', unsigned: true, default: 0 })
  recommended: number;

  @Column({ type: 'varchar', length: 80, nullable: true })
  game_version_min: string | null;

  @Column({ type: 'varchar', length: 80, nullable: true })
  game_version_max: string | null;

  @Column({ length: 500, nullable: true })
  file_path: string;

  @Column({ length: 255, nullable: true })
  file_name: string;

  @Column({ nullable: true })
  file_size: number;

  @Column({ length: 100, nullable: true })
  mime_type: string;

  @Column({ type: 'char', length: 64, nullable: true })
  content_hash: string | null;

  @Column({ type: 'text', nullable: true })
  content: string;

  @Column({ type: 'text', nullable: true })
  content_html: string;

  @CreateDateColumn()
  created_at: Date;

  // --- V1 ResourceVersion aggregate fields (additive, all nullable) ---

  @Column({ type: 'char', length: 36, nullable: true, unique: true })
  public_id: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  release_channel: string | null; // stable | beta | alpha

  @Column({ type: 'varchar', length: 50, nullable: true })
  status: string | null; // draft | pending_review | published | rejected | withdrawn | archived

  @Column({ type: 'text', nullable: true })
  release_notes_markdown: string | null;

  @Column({ type: 'text', nullable: true })
  release_notes_html: string | null;

  @Column({ type: 'datetime', nullable: true })
  published_at: Date | null;

  @Column({ type: 'int', nullable: true })
  created_by_user_id: number | null;

  @Column({ type: 'int', nullable: true })
  reviewed_by_user_id: number | null;

  @Column({ type: 'datetime', nullable: true })
  reviewed_at: Date | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  reject_reason: string | null;

  @Column({ default: false })
  is_legacy_root_release: boolean;

  // Declared so the foreign key and its index actually exist; versions are
  // meaningless once their resource is gone.
  @ManyToOne(() => Resource, { eager: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'resource_id' })
  resource: Resource;
}
