import {
  Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, Index,
} from 'typeorm';
import { ResourceVersion } from './resource-version.entity';

@Entity('resource_files')
@Index('idx_resource_files_version', ['resource_version'])
export class ResourceFile {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'char', length: 36, unique: true })
  public_id: string;

  @Column()
  resource_version_id: number;

  @Column({ length: 50 })
  role: string; // primary | supplementary | documentation

  @Column({ length: 50 })
  delivery_mode: string; // managed | mfl | external

  @Column({ type: 'varchar', length: 50, nullable: true })
  platform_key: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  architecture_key: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  package_type: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  display_name: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  original_filename: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  mime_type: string | null;

  @Column({ type: 'int', nullable: true })
  size_bytes: number | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  hash_algorithm: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  content_hash: string | null;

  @Column({ length: 50, default: 'unverified_legacy' })
  integrity_status: string; // verified | unverified_legacy | failed | unavailable

  @Column({ type: 'varchar', length: 50, nullable: true })
  storage_backend: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  storage_key: string | null;

  @Column({ type: 'int', nullable: true })
  provider_file_id: number | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  external_url: string | null;

  @Column({ length: 50, default: 'available' })
  availability_status: string; // available | unavailable | pending

  @Column({ default: 0 })
  sort_order: number;

  @CreateDateColumn()
  created_at: Date;

  @ManyToOne(() => ResourceVersion, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'resource_version_id' })
  resource_version: ResourceVersion;
}
