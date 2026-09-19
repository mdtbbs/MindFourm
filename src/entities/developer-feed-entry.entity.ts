import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

/** External engineering activity; deliberately separate from community posts. */
@Entity('developer_feed_entries')
@Index('uq_developer_feed_source', ['provider', 'repository', 'item_type', 'external_id'], { unique: true })
export class DeveloperFeedEntry {
  @PrimaryGeneratedColumn() id: number;
  @Column({ length: 40 }) provider: string;
  @Column({ length: 255 }) repository: string;
  @Column({ length: 40 }) item_type: string;
  @Column({ length: 100 }) external_id: string;
  @Column({ length: 40 }) state: string;
  @Column({ type: 'int', nullable: true }) service_account_id: number | null;
  @Column({ length: 255 }) author_login: string;
  @Column({ length: 255, nullable: true }) author_display_name: string | null;
  @Column({ type: 'varchar', length: 500, nullable: true }) author_avatar_url: string | null;
  @Column({ type: 'varchar', length: 500 }) source_url: string;
  @Column({ type: 'varchar', length: 500, nullable: true }) summary: string | null;
  @Column({ default: false }) is_low_value: boolean;
  @Column({ default: true }) is_indexable: boolean;
  @Column({ type: 'datetime', nullable: true }) opened_at: Date | null;
  @Column({ type: 'datetime', nullable: true }) closed_at: Date | null;
  @Column({ type: 'datetime', nullable: true }) merged_at: Date | null;
  @CreateDateColumn() created_at: Date;
  @UpdateDateColumn() updated_at: Date;
}
