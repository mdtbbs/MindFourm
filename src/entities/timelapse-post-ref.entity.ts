import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { TimelapseReport } from './timelapse-report.entity';

/**
 * 帖子 ↔ 战报的引用绑定。
 *
 * 只记录“已发布帖子”的引用：维护 `timelapse_reports.bound_post_count`，
 * 决定战报是随帖子永久保留还是在 30 天宽限后回收。写入与帖子事务同库同事务。
 */
@Entity('timelapse_post_refs')
@Index('idx_tpr_post', ['post_id'])
export class TimelapsePostRef {
  @PrimaryColumn({ type: 'bigint', unsigned: true })
  timelapse_id: string;

  @PrimaryColumn({ type: 'int' })
  post_id: number;

  @CreateDateColumn({ type: 'datetime' })
  created_at: Date;

  @ManyToOne(() => TimelapseReport, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'timelapse_id' })
  timelapse?: TimelapseReport;
}
