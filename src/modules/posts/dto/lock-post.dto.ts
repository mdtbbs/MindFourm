import { IsBoolean } from 'class-validator';

export class LockPostDto {
  /**
   * Required rather than optional, and a boolean rather than a 0/1 flag.
   *
   * `PUT /api/posts/:id/pin` reads its body as `@Body('is_pinned') isPinned: number`
   * and coerces whatever arrives with `isPinned ? 1 : 0`, so an omitted field silently
   * means "unpin". A locked thread is an enforcement decision, so the caller has to
   * say which way it goes.
   */
  @IsBoolean()
  locked: boolean;
}
