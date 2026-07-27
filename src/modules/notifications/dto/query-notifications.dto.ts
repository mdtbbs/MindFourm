import { IsOptional, IsNumber, IsIn, Min } from 'class-validator';
import { Type } from 'class-transformer';

export const NOTIFICATION_READ_FILTERS = ['all', 'unread', 'read'] as const;
export type NotificationReadFilter = (typeof NOTIFICATION_READ_FILTERS)[number];

export class QueryNotificationsDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  limit?: number = 20;

  @IsOptional()
  cursor?: string;

  /**
   * Applied in SQL, not in the browser.
   *
   * The notifications page used to request one page and then `.filter()` it client
   * side while still showing the server's unfiltered total — so "unread only" could
   * render an empty list on page 1 while the bell still showed a count, and the page
   * numbers described a different result set than the rows beneath them.
   */
  @IsOptional()
  @IsIn(NOTIFICATION_READ_FILTERS)
  filter?: NotificationReadFilter = 'all';
}
