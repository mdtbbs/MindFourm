import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn, Unique,
} from 'typeorm';
import { Resource } from './resource.entity';

// One row per (resource, version): without the constraint, a retried upload
// silently creates a second row for the same version string and the version list
// shows duplicates.
@Unique('uq_resource_versions_resource_version', ['resource_id', 'version'])
@Entity('resource_versions')
export class ResourceVersion {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  resource_id: number;

  @Column({ length: 50 })
  version: string;

  @Column({ length: 500, nullable: true })
  file_path: string;

  @Column({ length: 255, nullable: true })
  file_name: string;

  @Column({ nullable: true })
  file_size: number;

  @Column({ length: 100, nullable: true })
  mime_type: string;

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
