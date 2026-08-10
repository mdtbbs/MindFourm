import {
  Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, Index,
} from 'typeorm';
import { ResourceVersion } from './resource-version.entity';
import { Resource } from './resource.entity';

@Entity('resource_version_dependencies')
@Index('idx_rv_dependencies_version', ['resource_version'])
export class ResourceVersionDependency {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  resource_version_id: number;

  @Column({ length: 50 })
  dependency_type: string; // required | optional | incompatible

  @Column({ type: 'int', nullable: true })
  target_resource_id: number | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  external_identifier: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  version_constraint: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ default: 0 })
  sort_order: number;

  @CreateDateColumn()
  created_at: Date;

  @ManyToOne(() => ResourceVersion, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'resource_version_id' })
  resource_version: ResourceVersion;

  @ManyToOne(() => Resource, { nullable: true })
  @JoinColumn({ name: 'target_resource_id' })
  target_resource: Resource;
}
