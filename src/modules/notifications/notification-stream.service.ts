import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Subject } from 'rxjs';

/**
 * Shared notification stream bridge between service and controller.
 *
 * NotificationsService pushes new notifications here after creating them.
 * NotificationsController subscribes and forwards them to per-user SSE streams.
 */
@Injectable()
export class NotificationStreamService implements OnModuleDestroy {
  private subject = new Subject<{ userId: number; notification: any }>();

  /** Observable the controller subscribes to */
  readonly stream$ = this.subject.asObservable();

  /** Called by NotificationsService after a notification is created */
  push(userId: number, notification: any): void {
    this.subject.next({ userId, notification });
  }

  onModuleDestroy(): void {
    this.subject.complete();
  }
}
