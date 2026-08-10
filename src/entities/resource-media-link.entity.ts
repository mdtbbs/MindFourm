import {
  Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, Index,
} from 'typeorm';
import { Resource } from './resource.entity';
import { MediaAsset } from './media-asset.entity';

@Entity('resource_media_links')
@Index('idx_resource_media_links_resource', ['resource'])
export class ResourceMediaLink {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  resource_id: number;

  @Column()
  media_asset_id: number;

  @Column({ length: 50 })
  role: string; // cover | screenshot | gallery

  @Column({ default: 0 })
  sort_order: number;

  @CreateDateColumn()
  created_at: Date;

  @ManyToOne(() => Resource, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'resource_id' })
  resource: Resource;

  @ManyToOne(() => MediaAsset, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'media_asset_id' })
  media_asset: MediaAsset;
}
