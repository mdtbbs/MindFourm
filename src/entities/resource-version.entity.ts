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

  @CreateDateColumn()
  created_at: Date;

  // Declared so the foreign key and its index actually exist; versions are
  // meaningless once their resource is gone.
  @ManyToOne(() => Resource, { eager: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'resource_id' })
  resource: Resource;
}
