import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import type { TimelapseHighlights, TimelapseMetricPoint, TimelapseStatus, TimelapseVisibility } from '../modules/timelapses/timelapse.constants';

/**
 * 一篇基地延时战报（`MDTBBSAddon` 的 `.mreplay.zip` 成片）。
 *
 * 行本身同时承担上传会话与渲染结果：`uploading` 阶段只保存原始帧包对象键，
 * commit 后进入队列；Worker 回写后记录 MP4/WebP 对象键与图表摘要。
 * 原始帧包在 `source_purge_after` 之后由维护任务物理删除。
 */
@Entity('timelapse_reports')
@Index('idx_tr_author_unbound', ['author_user_id', 'bound_post_count', 'deleted_at'])
@Index('idx_tr_status_created', ['status', 'created_at'])
@Index('idx_tr_expiry', ['expires_at', 'bound_post_count', 'deleted_at'])
@Index('idx_tr_source_purge', ['source_purge_after'])
export class TimelapseReport {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id: string;

  @Column({ type: 'char', length: 36, unique: true })
  public_id: string;

  @Column({ type: 'int', unsigned: true })
  author_user_id: number;

  @Column({
    type: 'enum',
    enum: ['uploading', 'queued', 'processing', 'pending_review', 'published', 'rejected', 'failed'],
    default: 'uploading',
  })
  status: TimelapseStatus;

  @Column({ type: 'enum', enum: ['private', 'unlisted', 'public'], default: 'public' })
  visibility: TimelapseVisibility;

  @Column({ type: 'varchar', length: 160 })
  map_name: string;

  @Column({ type: 'int', unsigned: true, nullable: true })
  map_width: number | null;

  @Column({ type: 'int', unsigned: true, nullable: true })
  map_height: number | null;

  @Column({ type: 'varchar', length: 40, nullable: true })
  game_mode: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  game_version: string | null;

  @Column({ type: 'boolean', default: false })
  is_multiplayer: boolean;

  @Column({ type: 'int', unsigned: true, default: 0 })
  max_wave: number;

  @Column({ type: 'int', unsigned: true, default: 0 })
  duration_seconds: number;

  @Column({ type: 'smallint', unsigned: true, default: 0 })
  frame_count: number;

  @Column({ type: 'varchar', length: 512, nullable: true })
  source_object_key: string | null;

  @Column({ type: 'char', length: 64, nullable: true })
  source_sha256: string | null;

  @Column({ type: 'bigint', unsigned: true, nullable: true })
  source_size_bytes: string | null;

  /** 合成完成后设为 NOW() + 24h；维护任务据此物理删除原始帧包。 */
  @Column({ type: 'datetime', nullable: true })
  source_purge_after: Date | null;

  @Column({ type: 'varchar', length: 512, nullable: true })
  video_object_key: string | null;

  @Column({ type: 'varchar', length: 512, nullable: true })
  poster_object_key: string | null;

  @Column({ type: 'json', nullable: true })
  summary_metrics_json: TimelapseMetricPoint[] | null;

  @Column({ type: 'json', nullable: true })
  highlights_json: TimelapseHighlights | null;

  /** 已发布帖子引用计数；> 0 时 `expires_at` 为 NULL（随帖子永久保留）。 */
  @Column({ type: 'int', unsigned: true, default: 0 })
  bound_post_count: number;

  /** 未绑定帖子草稿为 NOW() + 30d；绑定后置 NULL；引用归零后重新给 30d 宽限。 */
  @Column({ type: 'datetime', nullable: true })
  expires_at: Date | null;

  @Column({ type: 'int', nullable: true })
  reviewed_by_user_id: number | null;

  @Column({ type: 'datetime', nullable: true })
  reviewed_at: Date | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  review_reason: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  failure_code: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  failure_reason: string | null;

  @CreateDateColumn({ type: 'datetime' })
  created_at: Date;

  @UpdateDateColumn({ type: 'datetime' })
  updated_at: Date;

  @Column({ type: 'datetime', nullable: true })
  deleted_at: Date | null;
}
