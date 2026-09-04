import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Subject } from 'rxjs';

export interface RawStreamEvent {
  userId: number;
  type: string;
  data: any;
}

/**
 * Shared notification stream bridge between service and controller.
 *
 * NotificationsService pushes new notifications here after creating them.
 * NotificationsController subscribes and forwards them to per-user SSE streams.
 *
 * `pushRaw` is a second channel for non-notification SSE events (e.g. friend
 * presence changes). The controller forwards them verbatim with the given type.
 */
@Injectable()
export class NotificationStreamService implements OnModuleDestroy {
  private subject = new Subject<{ userId: number; notification: any }>();
  private rawSubject = new Subject<RawStreamEvent>();

  /** Observable the controller subscribes to for notifications */
  readonly stream$ = this.subject.asObservable();

  /** Observable the controller subscribes to for raw events (presence, etc.) */
  readonly rawStream$ = this.rawSubject.asObservable();

  /** Called by NotificationsService after a notification is created */
  push(userId: number, notification: any): void {
    this.subject.next({ userId, notification });
  }

  /** Called by other services to push a raw SSE event to a user */
  pushRaw(userId: number, type: string, data: any): void {
    this.rawSubject.next({ userId, type, data });
  }

  onModuleDestroy(): void {
    this.subject.complete();
    this.rawSubject.complete();
  }
}
