import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TimelapseReport } from '../../entities/timelapse-report.entity';
import { TimelapsePostRef } from '../../entities/timelapse-post-ref.entity';
import { TimelapseRefsService } from './timelapse-refs.service';

/**
 * 只包含“帖子 ↔ 战报引用同步”的轻量模块。
 *
 * PostsModule / AdminModule 依赖它，而 TimelapsesModule 依赖 PostsModule；
 * 拆开后不存在 Nest 模块循环依赖。
 */
@Module({
  imports: [TypeOrmModule.forFeature([TimelapseReport, TimelapsePostRef])],
  providers: [TimelapseRefsService],
  exports: [TimelapseRefsService],
})
export class TimelapseRefsModule {}
