import {
  Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, Index,
} from 'typeorm';
import { ResourceVersion } from './resource-version.entity';

@Entity('resource_version_compatibilities')
@Index('idx_rv_compatibilities_version', ['resource_version'])
export class ResourceVersionCompatibility {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  resource_version_id: number;

  @Column({ length: 50 })
  runtime: string; // mindustry

  @Column({ type: 'varchar', length: 50, nullable: true })
  game_series: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  min_version_value: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  max_version_value: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  channel: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  platform_key: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @CreateDateColumn()
  created_at: Date;

  @ManyToOne(() => ResourceVersion, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'resource_version_id' })
  resource_version: ResourceVersion;
}
