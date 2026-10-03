import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index, ManyToOne, JoinColumn, Unique } from 'typeorm';
import { ResourceVersion } from './resource-version.entity';

/** Pins one exact published ResourceVersion into one exact Pack version. */
@Entity('resource_pack_items')
@Unique('uq_resource_pack_items_membership', ['pack_version_id', 'member_resource_version_id'])
@Index('idx_resource_pack_items_order', ['pack_version_id', 'sort_order', 'id'])
export class ResourcePackItem {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  pack_version_id: number;

  @Column()
  member_resource_version_id: number;

  @Column({ type: 'int', unsigned: true, default: 0 })
  sort_order: number;

  @CreateDateColumn()
  created_at: Date;

  @ManyToOne(() => ResourceVersion, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'pack_version_id' })
  pack_version: ResourceVersion;

  @ManyToOne(() => ResourceVersion, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'member_resource_version_id' })
  member_resource_version: ResourceVersion;
}
